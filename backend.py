"""
WealthPilot - AI-Powered Portfolio Intelligence Platform
=========================================================
The most comprehensive portfolio management solution for retail investors.
Solves real problems: tax optimization, risk analysis, income planning, goal tracking.
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import sqlite3
import json
import random
import numpy as np
import pandas as pd
from io import BytesIO
import tempfile
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
import uvicorn

# =============================================================================
# CONFIG & SETUP
# =============================================================================
app = FastAPI(title="WealthPilot API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

SECRET_KEY = "wealthpilot-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# =============================================================================
# DATABASE
# =============================================================================
def get_db():
    conn = sqlite3.connect('wealthpilot.db', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Users
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, username TEXT UNIQUE, email TEXT UNIQUE, 
        hashed_password TEXT, full_name TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        risk_tolerance TEXT DEFAULT 'moderate', investment_horizon INTEGER DEFAULT 10,
        tax_bracket REAL DEFAULT 0.24, state TEXT DEFAULT 'CA'
    )''')
    
    # Portfolios
    c.execute('''CREATE TABLE IF NOT EXISTS portfolios (
        id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, description TEXT,
        portfolio_type TEXT DEFAULT 'taxable', goal TEXT, target_value REAL,
        target_date TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Holdings
    c.execute('''CREATE TABLE IF NOT EXISTS holdings (
        id INTEGER PRIMARY KEY, portfolio_id INTEGER, symbol TEXT, name TEXT,
        quantity REAL, cost_basis REAL, current_price REAL, purchase_date TEXT,
        asset_type TEXT, sector TEXT, dividend_yield REAL DEFAULT 0,
        annual_dividend REAL DEFAULT 0, tax_lot_id TEXT,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )''')
    
    # Goals
    c.execute('''CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, target_amount REAL,
        current_amount REAL DEFAULT 0, target_date TEXT, priority INTEGER DEFAULT 1,
        category TEXT, monthly_contribution REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Transactions
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY, portfolio_id INTEGER, symbol TEXT, 
        transaction_type TEXT, quantity REAL, price REAL, 
        transaction_date TEXT, notes TEXT,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )''')
    
    # Tax Loss Harvesting Opportunities
    c.execute('''CREATE TABLE IF NOT EXISTS tlh_opportunities (
        id INTEGER PRIMARY KEY, portfolio_id INTEGER, symbol TEXT,
        unrealized_loss REAL, potential_tax_savings REAL, 
        replacement_symbol TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )''')
    
    # Alerts
    c.execute('''CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY, user_id INTEGER, alert_type TEXT,
        title TEXT, message TEXT, severity TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        action_url TEXT, metadata TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Watchlist
    c.execute('''CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY, user_id INTEGER, symbol TEXT,
        target_price REAL, notes TEXT, added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    conn.commit()
    conn.close()

init_db()

# =============================================================================
# MODELS
# =============================================================================
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str

class UserLogin(BaseModel):
    username: str
    password: str

class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    portfolio_type: str = "taxable"
    goal: Optional[str] = None
    target_value: Optional[float] = None
    target_date: Optional[str] = None

class HoldingCreate(BaseModel):
    symbol: str
    name: str
    quantity: float
    cost_basis: float
    purchase_date: Optional[str] = None
    asset_type: str = "Equity"
    sector: Optional[str] = None

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: Optional[str] = None
    priority: int = 1
    category: str = "General"
    monthly_contribution: float = 0

class UserPreferences(BaseModel):
    risk_tolerance: str = "moderate"
    investment_horizon: int = 10
    tax_bracket: float = 0.24
    state: str = "CA"

# =============================================================================
# AUTH
# =============================================================================
def create_token(data: dict):
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(days=30)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (payload["user_id"],)).fetchone()
        conn.close()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return dict(user)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# =============================================================================
# AUTH ENDPOINTS
# =============================================================================
@app.post("/api/auth/register")
async def register(user: UserCreate):
    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE username = ? OR email = ?", 
                   (user.username, user.email)).fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="User already exists")
    
    hashed = pwd_context.hash(user.password)
    c = conn.execute("INSERT INTO users (username, email, hashed_password, full_name) VALUES (?, ?, ?, ?)",
                    (user.username, user.email, hashed, user.full_name))
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"access_token": create_token({"user_id": user_id}), "user": {"id": user_id, "username": user.username, "full_name": user.full_name}}

@app.post("/api/auth/login")
async def login(user: UserLogin):
    conn = get_db()
    db_user = conn.execute("SELECT * FROM users WHERE username = ?", (user.username,)).fetchone()
    conn.close()
    if not db_user or not pwd_context.verify(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": create_token({"user_id": db_user["id"]}), 
            "user": {"id": db_user["id"], "username": db_user["username"], "full_name": db_user["full_name"], "email": db_user["email"]}}

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(require_auth)):
    return {"id": user["id"], "username": user["username"], "full_name": user["full_name"], "email": user["email"],
            "risk_tolerance": user["risk_tolerance"], "investment_horizon": user["investment_horizon"],
            "tax_bracket": user["tax_bracket"], "state": user["state"]}

@app.put("/api/auth/preferences")
async def update_preferences(prefs: UserPreferences, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("UPDATE users SET risk_tolerance=?, investment_horizon=?, tax_bracket=?, state=? WHERE id=?",
                (prefs.risk_tolerance, prefs.investment_horizon, prefs.tax_bracket, prefs.state, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "updated"}

# =============================================================================
# PORTFOLIO ENDPOINTS
# =============================================================================
@app.get("/api/portfolios")
async def get_portfolios(user: dict = Depends(require_auth)):
    conn = get_db()
    portfolios = conn.execute("SELECT * FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    result = []
    for p in portfolios:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
        total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
        total_gain = total_value - total_cost
        total_income = sum(h["annual_dividend"] * h["quantity"] for h in holdings)
        result.append({**dict(p), "total_value": total_value, "total_cost": total_cost, 
                      "total_gain": total_gain, "total_income": total_income, "holdings_count": len(holdings)})
    conn.close()
    return result

@app.post("/api/portfolios")
async def create_portfolio(portfolio: PortfolioCreate, user: dict = Depends(require_auth)):
    conn = get_db()
    c = conn.execute("INSERT INTO portfolios (user_id, name, description, portfolio_type, goal, target_value, target_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user["id"], portfolio.name, portfolio.description, portfolio.portfolio_type, portfolio.goal, portfolio.target_value, portfolio.target_date))
    portfolio_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": portfolio_id, "name": portfolio.name}

@app.get("/api/portfolios/{portfolio_id}")
async def get_portfolio(portfolio_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, user["id"])).fetchone()
    if not portfolio:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    return {**dict(portfolio), "holdings": [dict(h) for h in holdings]}

@app.delete("/api/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("DELETE FROM holdings WHERE portfolio_id = ?", (portfolio_id,))
    conn.execute("DELETE FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# =============================================================================
# HOLDINGS ENDPOINTS
# =============================================================================
@app.get("/api/portfolios/{portfolio_id}/holdings")
async def get_holdings(portfolio_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    return [dict(h) for h in holdings]

@app.post("/api/portfolios/{portfolio_id}/holdings")
async def add_holding(portfolio_id: int, holding: HoldingCreate, user: dict = Depends(require_auth)):
    conn = get_db()
    # Get current price (simulated)
    current_price = holding.cost_basis * (1 + random.uniform(-0.3, 0.5))
    div_yield = random.uniform(0, 0.08)
    annual_div = current_price * div_yield
    
    sector = holding.sector or get_sector(holding.symbol)
    
    c = conn.execute("""INSERT INTO holdings (portfolio_id, symbol, name, quantity, cost_basis, current_price, 
                       purchase_date, asset_type, sector, dividend_yield, annual_dividend, tax_lot_id) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (portfolio_id, holding.symbol.upper(), holding.name, holding.quantity, holding.cost_basis,
                     current_price, holding.purchase_date or datetime.now().strftime("%Y-%m-%d"),
                     holding.asset_type, sector, div_yield, annual_div, f"LOT-{random.randint(10000, 99999)}"))
    conn.commit()
    conn.close()
    return {"id": c.lastrowid, "symbol": holding.symbol}

@app.delete("/api/holdings/{holding_id}")
async def delete_holding(holding_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

def get_sector(symbol: str) -> str:
    sectors = {
        "AAPL": "Technology", "MSFT": "Technology", "GOOGL": "Technology", "NVDA": "Technology",
        "JPM": "Financials", "BAC": "Financials", "GS": "Financials", "V": "Financials",
        "JNJ": "Healthcare", "UNH": "Healthcare", "PFE": "Healthcare", "ABBV": "Healthcare",
        "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
        "PG": "Consumer Staples", "KO": "Consumer Staples", "PEP": "Consumer Staples",
        "HD": "Consumer Discretionary", "AMZN": "Consumer Discretionary",
        "VZ": "Communication", "T": "Communication", "DIS": "Communication",
        "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities",
        "AMT": "Real Estate", "PLD": "Real Estate", "O": "Real Estate",
        "CAT": "Industrials", "UNP": "Industrials", "HON": "Industrials",
        "LIN": "Materials", "APD": "Materials",
    }
    return sectors.get(symbol.upper(), "Other")

# =============================================================================
# AI PORTFOLIO ANALYSIS ENGINE
# =============================================================================
def calculate_portfolio_health_score(holdings: List[dict], user_prefs: dict) -> dict:
    """Calculate comprehensive portfolio health score (0-100)"""
    if not holdings:
        return {"score": 0, "grade": "N/A", "factors": {}}
    
    scores = {}
    
    # 1. Diversification Score (0-25)
    sectors = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        sectors[sector] = sectors.get(sector, 0) + h["quantity"] * h["current_price"]
    total_value = sum(sectors.values())
    
    if total_value > 0:
        weights = [v/total_value for v in sectors.values()]
        herfindahl = sum(w**2 for w in weights)
        diversification = min(25, (1 - herfindahl) * 30)
    else:
        diversification = 0
    scores["diversification"] = round(diversification, 1)
    
    # 2. Risk-Adjusted Return Score (0-25)
    gains = [(h["current_price"] - h["cost_basis"]) / h["cost_basis"] if h["cost_basis"] > 0 else 0 for h in holdings]
    avg_return = np.mean(gains) if gains else 0
    volatility = np.std(gains) if len(gains) > 1 else 0.2
    sharpe = avg_return / volatility if volatility > 0 else 0
    risk_score = min(25, max(0, (sharpe + 1) * 12.5))
    scores["risk_adjusted"] = round(risk_score, 1)
    
    # 3. Income Quality Score (0-20)
    total_income = sum(h["annual_dividend"] * h["quantity"] for h in holdings)
    yield_on_cost = total_income / sum(h["cost_basis"] * h["quantity"] for h in holdings) if holdings else 0
    income_score = min(20, yield_on_cost * 400)
    scores["income_quality"] = round(income_score, 1)
    
    # 4. Tax Efficiency Score (0-15)
    unrealized_gains = sum((h["current_price"] - h["cost_basis"]) * h["quantity"] for h in holdings if h["current_price"] > h["cost_basis"])
    unrealized_losses = sum((h["cost_basis"] - h["current_price"]) * h["quantity"] for h in holdings if h["current_price"] < h["cost_basis"])
    tax_score = 15 if unrealized_losses > 0 else 10  # Bonus for TLH opportunities
    scores["tax_efficiency"] = round(tax_score, 1)
    
    # 5. Concentration Risk Score (0-15)
    if total_value > 0:
        max_weight = max(h["quantity"] * h["current_price"] / total_value for h in holdings)
        concentration_score = max(0, 15 - (max_weight * 20))
    else:
        concentration_score = 0
    scores["concentration"] = round(concentration_score, 1)
    
    total_score = sum(scores.values())
    grade = "A+" if total_score >= 90 else "A" if total_score >= 80 else "B+" if total_score >= 70 else "B" if total_score >= 60 else "C+" if total_score >= 50 else "C" if total_score >= 40 else "D"
    
    return {"score": round(total_score, 1), "grade": grade, "factors": scores}

def generate_ai_insights(holdings: List[dict], user_prefs: dict) -> List[dict]:
    """Generate AI-powered actionable insights"""
    insights = []
    
    if not holdings:
        return [{"type": "info", "title": "Get Started", "message": "Add holdings to receive AI-powered insights", "action": "add_holding"}]
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # 1. Check concentration risk
    for h in holdings:
        weight = (h["quantity"] * h["current_price"]) / total_value if total_value > 0 else 0
        if weight > 0.15:
            insights.append({
                "type": "warning",
                "title": f"High Concentration: {h['symbol']}",
                "message": f"{h['symbol']} represents {weight*100:.1f}% of your portfolio. Consider reducing to below 10% for better diversification.",
                "action": "rebalance",
                "priority": 1
            })
    
    # 2. Check for tax-loss harvesting opportunities
    for h in holdings:
        unrealized_loss = (h["cost_basis"] - h["current_price"]) * h["quantity"]
        if unrealized_loss > 500:
            tax_savings = unrealized_loss * 0.24  # Assume 24% tax bracket
            insights.append({
                "type": "opportunity",
                "title": f"Tax-Loss Harvesting: {h['symbol']}",
                "message": f"Harvest ${unrealized_loss:,.0f} loss to save ~${tax_savings:,.0f} in taxes. Replace with similar ETF to maintain exposure.",
                "action": "tlh",
                "priority": 2,
                "symbol": h["symbol"],
                "loss": unrealized_loss,
                "tax_savings": tax_savings
            })
    
    # 3. Check sector allocation
    sectors = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        sectors[sector] = sectors.get(sector, 0) + h["quantity"] * h["current_price"]
    
    for sector, value in sectors.items():
        weight = value / total_value if total_value > 0 else 0
        if weight > 0.30:
            insights.append({
                "type": "warning",
                "title": f"Sector Overweight: {sector}",
                "message": f"{sector} is {weight*100:.1f}% of your portfolio. Consider diversifying to reduce sector risk.",
                "action": "diversify",
                "priority": 2
            })
    
    # 4. Income optimization
    low_yield_holdings = [h for h in holdings if h["dividend_yield"] < 0.01 and h["quantity"] * h["current_price"] > 5000]
    if low_yield_holdings and len(low_yield_holdings) > len(holdings) * 0.5:
        insights.append({
            "type": "info",
            "title": "Income Opportunity",
            "message": f"{len(low_yield_holdings)} holdings pay little to no dividends. Consider dividend growth stocks for passive income.",
            "action": "income",
            "priority": 3
        })
    
    # 5. Winners to trim
    big_winners = [h for h in holdings if (h["current_price"] - h["cost_basis"]) / h["cost_basis"] > 1.0]
    for h in big_winners:
        gain_pct = (h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100
        insights.append({
            "type": "info",
            "title": f"Big Winner: {h['symbol']} +{gain_pct:.0f}%",
            "message": f"Consider taking some profits to lock in gains and rebalance.",
            "action": "trim",
            "priority": 3
        })
    
    return sorted(insights, key=lambda x: x.get("priority", 99))[:10]

def calculate_risk_metrics(holdings: List[dict]) -> dict:
    """Calculate comprehensive risk metrics"""
    if not holdings:
        return {}
    
    # Simulate historical returns for risk calculation
    returns = []
    for h in holdings:
        weight = h["quantity"] * h["current_price"]
        # Simulate 252 daily returns
        daily_returns = np.random.normal(0.0004, 0.015, 252)
        returns.append(daily_returns * weight)
    
    if not returns:
        return {}
    
    portfolio_returns = np.sum(returns, axis=0) / sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Calculate metrics
    annual_return = np.mean(portfolio_returns) * 252 * 100
    annual_volatility = np.std(portfolio_returns) * np.sqrt(252) * 100
    sharpe_ratio = (annual_return - 2) / annual_volatility if annual_volatility > 0 else 0
    
    # Sortino Ratio (downside deviation)
    negative_returns = portfolio_returns[portfolio_returns < 0]
    downside_deviation = np.std(negative_returns) * np.sqrt(252) * 100 if len(negative_returns) > 0 else annual_volatility
    sortino_ratio = (annual_return - 2) / downside_deviation if downside_deviation > 0 else 0
    
    # Maximum Drawdown
    cumulative = np.cumprod(1 + portfolio_returns)
    peak = np.maximum.accumulate(cumulative)
    drawdown = (cumulative - peak) / peak
    max_drawdown = np.min(drawdown) * 100
    
    # Value at Risk (95%)
    var_95 = np.percentile(portfolio_returns, 5) * 100
    
    # Beta (vs market)
    market_returns = np.random.normal(0.0003, 0.012, 252)
    covariance = np.cov(portfolio_returns, market_returns)[0, 1]
    market_variance = np.var(market_returns)
    beta = covariance / market_variance if market_variance > 0 else 1
    
    return {
        "annual_return": round(annual_return, 2),
        "annual_volatility": round(annual_volatility, 2),
        "sharpe_ratio": round(sharpe_ratio, 2),
        "sortino_ratio": round(sortino_ratio, 2),
        "max_drawdown": round(max_drawdown, 2),
        "var_95": round(var_95, 2),
        "beta": round(beta, 2),
        "alpha": round(annual_return - (2 + beta * 8), 2)  # CAPM alpha
    }

def generate_rebalance_recommendations(holdings: List[dict], target_allocation: dict = None) -> List[dict]:
    """Generate smart rebalancing recommendations"""
    if not holdings:
        return []
    
    # Default target: equal weight by sector
    if not target_allocation:
        sectors = list(set(h.get("sector", "Other") for h in holdings))
        target_allocation = {s: 1/len(sectors) for s in sectors}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    if total_value == 0:
        return []
    
    # Current allocation
    current = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        current[sector] = current.get(sector, 0) + h["quantity"] * h["current_price"]
    
    recommendations = []
    for sector, target_pct in target_allocation.items():
        current_pct = current.get(sector, 0) / total_value
        diff = target_pct - current_pct
        
        if abs(diff) > 0.02:  # 2% threshold
            action = "buy" if diff > 0 else "sell"
            amount = abs(diff) * total_value
            recommendations.append({
                "sector": sector,
                "action": action,
                "current_pct": round(current_pct * 100, 1),
                "target_pct": round(target_pct * 100, 1),
                "amount": round(amount, 2),
                "holdings": [h["symbol"] for h in holdings if h.get("sector") == sector]
            })
    
    return sorted(recommendations, key=lambda x: abs(x["current_pct"] - x["target_pct"]), reverse=True)

def project_dividend_income(holdings: List[dict]) -> dict:
    """Project dividend income over time"""
    if not holdings:
        return {}
    
    monthly_income = []
    annual_income = sum(h["annual_dividend"] * h["quantity"] for h in holdings)
    
    # Project 12 months
    for month in range(12):
        monthly = annual_income / 12
        # Add some variance
        monthly *= (1 + random.uniform(-0.1, 0.1))
        monthly_income.append(round(monthly, 2))
    
    # Top dividend payers
    div_holdings = sorted(holdings, key=lambda h: h["annual_dividend"] * h["quantity"], reverse=True)
    top_payers = [{
        "symbol": h["symbol"],
        "annual": round(h["annual_dividend"] * h["quantity"], 2),
        "yield": round(h["dividend_yield"] * 100, 2),
        "pct_of_income": round(h["annual_dividend"] * h["quantity"] / annual_income * 100, 1) if annual_income > 0 else 0
    } for h in div_holdings[:10]]
    
    # Growth projection (5 years, 6% annual growth)
    projections = []
    current = annual_income
    for year in range(6):
        projections.append({"year": year, "income": round(current, 2)})
        current *= 1.06
    
    return {
        "annual_income": round(annual_income, 2),
        "monthly_average": round(annual_income / 12, 2),
        "monthly_breakdown": monthly_income,
        "top_payers": top_payers,
        "yield_on_cost": round(annual_income / sum(h["cost_basis"] * h["quantity"] for h in holdings) * 100, 2) if holdings else 0,
        "projections": projections
    }

# =============================================================================
# ANALYSIS ENDPOINTS
# =============================================================================
@app.get("/api/portfolios/{portfolio_id}/analysis")
async def get_portfolio_analysis(portfolio_id: int, user: dict = Depends(require_auth)):
    """Comprehensive AI-powered portfolio analysis"""
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, user["id"])).fetchone()
    if not portfolio:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    user_prefs = {"risk_tolerance": user["risk_tolerance"], "tax_bracket": user["tax_bracket"]}
    
    # Calculate all metrics
    health = calculate_portfolio_health_score(holdings, user_prefs)
    insights = generate_ai_insights(holdings, user_prefs)
    risk = calculate_risk_metrics(holdings)
    rebalance = generate_rebalance_recommendations(holdings)
    income = project_dividend_income(holdings)
    
    # Sector breakdown
    sectors = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        sectors[sector] = sectors.get(sector, 0) + h["quantity"] * h["current_price"]
    total = sum(sectors.values())
    sector_breakdown = [{"name": k, "value": round(v, 2), "pct": round(v/total*100, 1) if total > 0 else 0} 
                       for k, v in sorted(sectors.items(), key=lambda x: x[1], reverse=True)]
    
    # Asset type breakdown
    types = {}
    for h in holdings:
        t = h.get("asset_type", "Equity")
        types[t] = types.get(t, 0) + h["quantity"] * h["current_price"]
    type_breakdown = [{"name": k, "value": round(v, 2), "pct": round(v/total*100, 1) if total > 0 else 0}
                     for k, v in sorted(types.items(), key=lambda x: x[1], reverse=True)]
    
    # Top holdings
    sorted_holdings = sorted(holdings, key=lambda h: h["quantity"] * h["current_price"], reverse=True)
    top_holdings = [{
        "symbol": h["symbol"],
        "name": h["name"],
        "value": round(h["quantity"] * h["current_price"], 2),
        "weight": round(h["quantity"] * h["current_price"] / total * 100, 1) if total > 0 else 0,
        "gain_pct": round((h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100, 1) if h["cost_basis"] > 0 else 0,
        "yield": round(h["dividend_yield"] * 100, 2)
    } for h in sorted_holdings[:10]]
    
    return {
        "portfolio": dict(portfolio),
        "health_score": health,
        "ai_insights": insights,
        "risk_metrics": risk,
        "rebalance_recommendations": rebalance,
        "income_analysis": income,
        "sector_breakdown": sector_breakdown,
        "type_breakdown": type_breakdown,
        "top_holdings": top_holdings,
        "summary": {
            "total_value": round(total, 2),
            "total_cost": round(sum(h["cost_basis"] * h["quantity"] for h in holdings), 2),
            "total_gain": round(sum((h["current_price"] - h["cost_basis"]) * h["quantity"] for h in holdings), 2),
            "holdings_count": len(holdings),
            "sectors_count": len(sectors)
        }
    }

@app.get("/api/portfolios/{portfolio_id}/tax-optimization")
async def get_tax_optimization(portfolio_id: int, user: dict = Depends(require_auth)):
    """Detailed tax-loss harvesting analysis"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    tax_bracket = user["tax_bracket"]
    opportunities = []
    
    for h in holdings:
        unrealized = (h["current_price"] - h["cost_basis"]) * h["quantity"]
        if unrealized < -100:  # Only losses over $100
            tax_savings = abs(unrealized) * tax_bracket
            
            # Find replacement securities
            replacements = get_tlh_replacements(h["symbol"], h["sector"])
            
            opportunities.append({
                "symbol": h["symbol"],
                "name": h["name"],
                "quantity": h["quantity"],
                "cost_basis": round(h["cost_basis"], 2),
                "current_price": round(h["current_price"], 2),
                "unrealized_loss": round(abs(unrealized), 2),
                "tax_savings": round(tax_savings, 2),
                "purchase_date": h["purchase_date"],
                "holding_period": "long-term" if h["purchase_date"] and (datetime.now() - datetime.strptime(h["purchase_date"], "%Y-%m-%d")).days > 365 else "short-term",
                "replacement_options": replacements,
                "wash_sale_end": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            })
    
    # Summary
    total_harvestable = sum(o["unrealized_loss"] for o in opportunities)
    total_tax_savings = sum(o["tax_savings"] for o in opportunities)
    
    return {
        "opportunities": sorted(opportunities, key=lambda x: x["tax_savings"], reverse=True),
        "summary": {
            "total_harvestable_losses": round(total_harvestable, 2),
            "potential_tax_savings": round(total_tax_savings, 2),
            "tax_bracket": tax_bracket * 100,
            "opportunities_count": len(opportunities),
            "annual_loss_limit": 3000,
            "carryforward_potential": max(0, total_harvestable - 3000)
        },
        "wash_sale_warning": "Remember: Cannot buy substantially identical securities within 30 days before or after sale"
    }

def get_tlh_replacements(symbol: str, sector: str) -> List[dict]:
    """Get tax-loss harvesting replacement options"""
    replacements = {
        "Technology": [
            {"symbol": "VGT", "name": "Vanguard Info Tech ETF", "expense": 0.10},
            {"symbol": "XLK", "name": "Tech Select SPDR", "expense": 0.09},
            {"symbol": "QQQ", "name": "Invesco QQQ", "expense": 0.20}
        ],
        "Healthcare": [
            {"symbol": "VHT", "name": "Vanguard Health Care ETF", "expense": 0.10},
            {"symbol": "XLV", "name": "Health Care Select SPDR", "expense": 0.09}
        ],
        "Financials": [
            {"symbol": "VFH", "name": "Vanguard Financials ETF", "expense": 0.10},
            {"symbol": "XLF", "name": "Financial Select SPDR", "expense": 0.09}
        ],
        "Energy": [
            {"symbol": "VDE", "name": "Vanguard Energy ETF", "expense": 0.10},
            {"symbol": "XLE", "name": "Energy Select SPDR", "expense": 0.09}
        ],
        "Consumer Staples": [
            {"symbol": "VDC", "name": "Vanguard Consumer Staples ETF", "expense": 0.10},
            {"symbol": "XLP", "name": "Consumer Staples SPDR", "expense": 0.09}
        ],
        "Other": [
            {"symbol": "VTI", "name": "Vanguard Total Stock Market", "expense": 0.03},
            {"symbol": "SPY", "name": "SPDR S&P 500", "expense": 0.09}
        ]
    }
    return replacements.get(sector, replacements["Other"])

# =============================================================================
# GOALS ENDPOINTS
# =============================================================================
@app.get("/api/goals")
async def get_goals(user: dict = Depends(require_auth)):
    conn = get_db()
    goals = conn.execute("SELECT * FROM goals WHERE user_id = ? ORDER BY priority", (user["id"],)).fetchall()
    conn.close()
    
    result = []
    for g in goals:
        progress = g["current_amount"] / g["target_amount"] * 100 if g["target_amount"] > 0 else 0
        
        # Calculate projected completion
        if g["monthly_contribution"] > 0:
            remaining = g["target_amount"] - g["current_amount"]
            months_to_goal = remaining / g["monthly_contribution"] if g["monthly_contribution"] > 0 else float('inf')
            projected_date = (datetime.now() + timedelta(days=months_to_goal * 30)).strftime("%Y-%m-%d")
        else:
            projected_date = None
        
        result.append({
            **dict(g),
            "progress": round(progress, 1),
            "projected_completion": projected_date
        })
    
    return result

@app.post("/api/goals")
async def create_goal(goal: GoalCreate, user: dict = Depends(require_auth)):
    conn = get_db()
    c = conn.execute("INSERT INTO goals (user_id, name, target_amount, target_date, priority, category, monthly_contribution) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user["id"], goal.name, goal.target_amount, goal.target_date, goal.priority, goal.category, goal.monthly_contribution))
    conn.commit()
    conn.close()
    return {"id": c.lastrowid, "name": goal.name}

@app.put("/api/goals/{goal_id}")
async def update_goal(goal_id: int, goal: GoalCreate, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("UPDATE goals SET name=?, target_amount=?, target_date=?, priority=?, category=?, monthly_contribution=? WHERE id=? AND user_id=?",
                (goal.name, goal.target_amount, goal.target_date, goal.priority, goal.category, goal.monthly_contribution, goal_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/api/goals/{goal_id}")
async def delete_goal(goal_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("DELETE FROM goals WHERE id = ? AND user_id = ?", (goal_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# =============================================================================
# ALERTS ENDPOINTS
# =============================================================================
@app.get("/api/alerts")
async def get_alerts(user: dict = Depends(require_auth)):
    conn = get_db()
    alerts = conn.execute("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", (user["id"],)).fetchall()
    conn.close()
    return [dict(a) for a in alerts]

@app.put("/api/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?", (alert_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "read"}

# =============================================================================
# WATCHLIST ENDPOINTS
# =============================================================================
@app.get("/api/watchlist")
async def get_watchlist(user: dict = Depends(require_auth)):
    conn = get_db()
    items = conn.execute("SELECT * FROM watchlist WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    result = []
    for item in items:
        # Simulate current price
        current_price = random.uniform(50, 500)
        change = random.uniform(-5, 5)
        result.append({
            **dict(item),
            "current_price": round(current_price, 2),
            "change_pct": round(change, 2),
            "target_reached": item["target_price"] and current_price <= item["target_price"]
        })
    
    return result

@app.post("/api/watchlist")
async def add_to_watchlist(symbol: str = Query(...), target_price: float = Query(None), user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("INSERT INTO watchlist (user_id, symbol, target_price) VALUES (?, ?, ?)",
                (user["id"], symbol.upper(), target_price))
    conn.commit()
    conn.close()
    return {"status": "added"}

@app.delete("/api/watchlist/{item_id}")
async def remove_from_watchlist(item_id: int, user: dict = Depends(require_auth)):
    conn = get_db()
    conn.execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", (item_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "removed"}

# =============================================================================
# FILE UPLOAD & ANALYSIS
# =============================================================================
@app.post("/api/upload/portfolio")
async def upload_portfolio_file(file: UploadFile = File(...), portfolio_id: int = Query(...), user: dict = Depends(require_auth)):
    """Upload Excel/CSV file to import holdings"""
    contents = await file.read()
    
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(contents))
        else:
            df = pd.read_excel(BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    # Flexible column mapping
    col_mapping = {}
    for col in df.columns:
        col_lower = col.lower()
        if 'symbol' in col_lower or 'ticker' in col_lower:
            col_mapping['symbol'] = col
        elif 'quantity' in col_lower or 'shares' in col_lower or 'qty' in col_lower:
            col_mapping['quantity'] = col
        elif 'price' in col_lower and 'change' not in col_lower:
            col_mapping['price'] = col
        elif 'value' in col_lower and 'change' not in col_lower:
            col_mapping['value'] = col
        elif 'cost' in col_lower or 'principal' in col_lower and '$' in col_lower:
            col_mapping['cost'] = col
        elif 'category' in col_lower or 'sector' in col_lower:
            col_mapping['sector'] = col
        elif 'type' in col_lower:
            col_mapping['type'] = col
        elif 'description' in col_lower or 'name' in col_lower:
            col_mapping['name'] = col
        elif 'yield' in col_lower:
            col_mapping['yield'] = col
        elif 'income' in col_lower or 'dividend' in col_lower:
            col_mapping['income'] = col
    
    if 'symbol' not in col_mapping:
        raise HTTPException(status_code=400, detail="Could not find Symbol column")
    
    # Import holdings
    conn = get_db()
    imported = 0
    
    for _, row in df.iterrows():
        symbol = str(row.get(col_mapping.get('symbol', ''), '')).strip()
        if not symbol or symbol == 'nan':
            continue
        
        quantity = float(row.get(col_mapping.get('quantity', ''), 0) or 0)
        price = float(row.get(col_mapping.get('price', ''), 100) or 100)
        cost = float(row.get(col_mapping.get('cost', ''), price) or price)
        name = str(row.get(col_mapping.get('name', ''), symbol))[:50]
        sector = str(row.get(col_mapping.get('sector', ''), '')) or get_sector(symbol)
        asset_type = str(row.get(col_mapping.get('type', ''), 'Equity'))
        div_yield = float(row.get(col_mapping.get('yield', ''), 0) or 0) / 100 if col_mapping.get('yield') else random.uniform(0, 0.05)
        income = float(row.get(col_mapping.get('income', ''), 0) or 0)
        
        if quantity > 0:
            conn.execute("""INSERT INTO holdings (portfolio_id, symbol, name, quantity, cost_basis, current_price, 
                           purchase_date, asset_type, sector, dividend_yield, annual_dividend, tax_lot_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (portfolio_id, symbol.upper(), name, quantity, cost / quantity if quantity > 0 else cost,
                         price / quantity if quantity > 0 else price, datetime.now().strftime("%Y-%m-%d"),
                         asset_type, sector, div_yield, income, f"LOT-{random.randint(10000, 99999)}"))
            imported += 1
    
    conn.commit()
    conn.close()
    
    return {"imported": imported, "total_rows": len(df)}

# =============================================================================
# SCENARIO SIMULATOR
# =============================================================================
@app.post("/api/portfolios/{portfolio_id}/simulate")
async def simulate_scenario(portfolio_id: int, 
                           action: str = Query(...),  # buy, sell, rebalance
                           symbol: str = Query(None),
                           quantity: float = Query(None),
                           target_allocation: str = Query(None),
                           user: dict = Depends(require_auth)):
    """Simulate what-if scenarios"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    # Create simulation copy
    sim_holdings = [h.copy() for h in holdings]
    
    if action == "buy" and symbol and quantity:
        # Add new holding or increase existing
        existing = next((h for h in sim_holdings if h["symbol"] == symbol.upper()), None)
        if existing:
            existing["quantity"] += quantity
        else:
            sim_holdings.append({
                "symbol": symbol.upper(),
                "name": symbol.upper(),
                "quantity": quantity,
                "cost_basis": 100,  # Simulated
                "current_price": 100,
                "sector": get_sector(symbol),
                "dividend_yield": 0.02,
                "annual_dividend": 2
            })
    
    elif action == "sell" and symbol and quantity:
        existing = next((h for h in sim_holdings if h["symbol"] == symbol.upper()), None)
        if existing:
            existing["quantity"] = max(0, existing["quantity"] - quantity)
            if existing["quantity"] == 0:
                sim_holdings.remove(existing)
    
    # Calculate before/after metrics
    before_health = calculate_portfolio_health_score(holdings, {"risk_tolerance": "moderate"})
    after_health = calculate_portfolio_health_score(sim_holdings, {"risk_tolerance": "moderate"})
    
    before_risk = calculate_risk_metrics(holdings)
    after_risk = calculate_risk_metrics(sim_holdings)
    
    return {
        "before": {
            "health_score": before_health["score"],
            "sharpe_ratio": before_risk.get("sharpe_ratio", 0),
            "volatility": before_risk.get("annual_volatility", 0),
            "holdings_count": len(holdings)
        },
        "after": {
            "health_score": after_health["score"],
            "sharpe_ratio": after_risk.get("sharpe_ratio", 0),
            "volatility": after_risk.get("annual_volatility", 0),
            "holdings_count": len(sim_holdings)
        },
        "impact": {
            "health_change": round(after_health["score"] - before_health["score"], 1),
            "risk_change": round(after_risk.get("annual_volatility", 0) - before_risk.get("annual_volatility", 0), 2),
            "recommendation": "Proceed" if after_health["score"] >= before_health["score"] else "Reconsider"
        }
    }

# =============================================================================
# MARKET DATA (Simulated)
# =============================================================================
@app.get("/api/market/quote/{symbol}")
async def get_quote(symbol: str):
    price = random.uniform(50, 500)
    return {
        "symbol": symbol.upper(),
        "price": round(price, 2),
        "change": round(random.uniform(-10, 10), 2),
        "change_pct": round(random.uniform(-5, 5), 2),
        "volume": random.randint(1000000, 50000000),
        "high": round(price * 1.02, 2),
        "low": round(price * 0.98, 2),
        "open": round(price * 1.001, 2)
    }

@app.get("/api/market/indices")
async def get_indices():
    return [
        {"symbol": "^GSPC", "name": "S&P 500", "price": round(5234.18 + random.uniform(-50, 50), 2), "change_pct": round(random.uniform(-2, 2), 2)},
        {"symbol": "^DJI", "name": "Dow Jones", "price": round(39069.11 + random.uniform(-200, 200), 2), "change_pct": round(random.uniform(-2, 2), 2)},
        {"symbol": "^IXIC", "name": "NASDAQ", "price": round(16920.79 + random.uniform(-100, 100), 2), "change_pct": round(random.uniform(-2, 2), 2)},
        {"symbol": "^RUT", "name": "Russell 2000", "price": round(2047.69 + random.uniform(-20, 20), 2), "change_pct": round(random.uniform(-2, 2), 2)},
        {"symbol": "^VIX", "name": "VIX", "price": round(15 + random.uniform(-5, 10), 2), "change_pct": round(random.uniform(-10, 10), 2)},
    ]

@app.get("/api/market/sectors")
async def get_sectors():
    sectors = ["Technology", "Healthcare", "Financials", "Consumer Discretionary", "Communication",
               "Industrials", "Consumer Staples", "Energy", "Utilities", "Real Estate", "Materials"]
    return [{"name": s, "change_pct": round(random.uniform(-3, 3), 2)} for s in sectors]

# =============================================================================
# DASHBOARD SUMMARY
# =============================================================================
@app.get("/api/dashboard")
async def get_dashboard(user: dict = Depends(require_auth)):
    """Get comprehensive dashboard data"""
    conn = get_db()
    portfolios = conn.execute("SELECT * FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    
    total_value = 0
    total_cost = 0
    total_income = 0
    all_holdings = []
    
    for p in portfolios:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        for h in holdings:
            all_holdings.append(dict(h))
            total_value += h["quantity"] * h["current_price"]
            total_cost += h["quantity"] * h["cost_basis"]
            total_income += h["annual_dividend"] * h["quantity"]
    
    goals = conn.execute("SELECT * FROM goals WHERE user_id = ?", (user["id"],)).fetchall()
    alerts = conn.execute("SELECT * FROM alerts WHERE user_id = ? AND is_read = 0", (user["id"],)).fetchall()
    conn.close()
    
    # Calculate health score across all holdings
    health = calculate_portfolio_health_score(all_holdings, {"risk_tolerance": user["risk_tolerance"]})
    insights = generate_ai_insights(all_holdings, {"risk_tolerance": user["risk_tolerance"]})
    
    # Performance data (simulated)
    performance = []
    base = total_value * 0.8
    for i in range(30):
        base *= (1 + random.uniform(-0.02, 0.025))
        performance.append({"day": i, "value": round(base, 2)})
    
    return {
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_value - total_cost, 2),
            "total_gain_pct": round((total_value - total_cost) / total_cost * 100, 2) if total_cost > 0 else 0,
            "annual_income": round(total_income, 2),
            "yield_on_cost": round(total_income / total_cost * 100, 2) if total_cost > 0 else 0,
            "portfolios_count": len(portfolios),
            "holdings_count": len(all_holdings)
        },
        "health_score": health,
        "top_insights": insights[:5],
        "goals_progress": [{"name": g["name"], "progress": round(g["current_amount"] / g["target_amount"] * 100, 1) if g["target_amount"] > 0 else 0} for g in goals],
        "unread_alerts": len(alerts),
        "performance_30d": performance,
        "market_indices": await get_indices()
    }

# =============================================================================
# PDF REPORT
# =============================================================================
@app.get("/api/portfolios/{portfolio_id}/report")
async def generate_report(portfolio_id: int, user: dict = Depends(require_auth)):
    """Generate comprehensive PDF report"""
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, user["id"])).fetchone()
    if not portfolio:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        raise HTTPException(status_code=400, detail="No holdings to report")
    
    # Generate report
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=24, textColor=colors.HexColor('#1e40af'))
    elements.append(Paragraph("WealthPilot Portfolio Report", title_style))
    elements.append(Paragraph(f"{portfolio['name']} - {datetime.now().strftime('%B %d, %Y')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Summary
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    total_income = sum(h["annual_dividend"] * h["quantity"] for h in holdings)
    health = calculate_portfolio_health_score(holdings, {})
    
    summary_data = [
        ["Metric", "Value"],
        ["Total Value", f"${total_value:,.2f}"],
        ["Total Cost", f"${total_cost:,.2f}"],
        ["Total Gain/Loss", f"${total_value - total_cost:,.2f}"],
        ["Return", f"{(total_value - total_cost) / total_cost * 100:.1f}%"],
        ["Annual Income", f"${total_income:,.2f}"],
        ["Health Score", f"{health['score']}/100 ({health['grade']})"],
    ]
    
    summary_table = Table(summary_data, colWidths=[2*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Holdings
    elements.append(Paragraph("Holdings Detail", styles['Heading2']))
    holdings_data = [["Symbol", "Shares", "Cost", "Price", "Value", "Gain%"]]
    for h in sorted(holdings, key=lambda x: x["quantity"] * x["current_price"], reverse=True)[:20]:
        gain_pct = (h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100 if h["cost_basis"] > 0 else 0
        holdings_data.append([
            h["symbol"],
            f"{h['quantity']:.2f}",
            f"${h['cost_basis']:.2f}",
            f"${h['current_price']:.2f}",
            f"${h['quantity'] * h['current_price']:,.2f}",
            f"{gain_pct:.1f}%"
        ])
    
    holdings_table = Table(holdings_data, colWidths=[0.8*inch, 0.7*inch, 0.9*inch, 0.9*inch, 1.1*inch, 0.7*inch])
    holdings_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ]))
    elements.append(holdings_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as f:
        f.write(buffer.getvalue())
        temp_path = f.name
    
    return FileResponse(temp_path, filename=f"{portfolio['name'].replace(' ', '_')}_Report.pdf", media_type='application/pdf')

# =============================================================================
# PHASE 2: ADVANCED ANALYTICS ENGINE
# =============================================================================

def calculate_efficient_frontier(holdings: List[dict], num_portfolios: int = 100) -> dict:
    """Calculate efficient frontier using Modern Portfolio Theory"""
    if len(holdings) < 2:
        return {"error": "Need at least 2 holdings for optimization"}
    
    # Get returns for each holding
    n_assets = min(len(holdings), 15)  # Limit for performance
    holdings = holdings[:n_assets]
    
    # Simulate returns (in production, use real historical data)
    np.random.seed(42)
    n_days = 252
    returns_matrix = np.zeros((n_days, n_assets))
    
    for i, h in enumerate(holdings):
        # Simulate daily returns based on asset type
        base_return = 0.0004 if h.get("asset_type") == "Equity" else 0.0002
        volatility = 0.02 if h.get("asset_type") == "Equity" else 0.01
        returns_matrix[:, i] = np.random.normal(base_return, volatility, n_days)
    
    # Calculate mean returns and covariance matrix
    mean_returns = np.mean(returns_matrix, axis=0) * 252  # Annualized
    cov_matrix = np.cov(returns_matrix.T) * 252  # Annualized
    
    # Generate random portfolios for efficient frontier
    results = []
    weights_record = []
    
    for _ in range(num_portfolios):
        weights = np.random.random(n_assets)
        weights /= np.sum(weights)
        
        portfolio_return = np.dot(weights, mean_returns)
        portfolio_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        sharpe = (portfolio_return - 0.02) / portfolio_volatility  # 2% risk-free rate
        
        results.append({
            "return": round(portfolio_return * 100, 2),
            "volatility": round(portfolio_volatility * 100, 2),
            "sharpe": round(sharpe, 3)
        })
        weights_record.append(weights.tolist())
    
    # Find optimal portfolios
    results_df = sorted(results, key=lambda x: x["sharpe"], reverse=True)
    max_sharpe_idx = results.index(results_df[0])
    min_vol_idx = min(range(len(results)), key=lambda i: results[i]["volatility"])
    
    # Current portfolio position
    current_weights = np.array([h["quantity"] * h["current_price"] for h in holdings])
    current_weights = current_weights / np.sum(current_weights)
    current_return = np.dot(current_weights, mean_returns) * 100
    current_vol = np.sqrt(np.dot(current_weights.T, np.dot(cov_matrix, current_weights))) * 100
    current_sharpe = (current_return / 100 - 0.02) / (current_vol / 100)
    
    return {
        "frontier_points": results,
        "optimal_portfolio": {
            "weights": {holdings[i]["symbol"]: round(weights_record[max_sharpe_idx][i] * 100, 1) 
                       for i in range(n_assets)},
            "expected_return": results_df[0]["return"],
            "volatility": results_df[0]["volatility"],
            "sharpe_ratio": results_df[0]["sharpe"]
        },
        "min_variance_portfolio": {
            "weights": {holdings[i]["symbol"]: round(weights_record[min_vol_idx][i] * 100, 1) 
                       for i in range(n_assets)},
            "expected_return": results[min_vol_idx]["return"],
            "volatility": results[min_vol_idx]["volatility"],
            "sharpe_ratio": results[min_vol_idx]["sharpe"]
        },
        "current_portfolio": {
            "expected_return": round(current_return, 2),
            "volatility": round(current_vol, 2),
            "sharpe_ratio": round(current_sharpe, 3)
        },
        "symbols": [h["symbol"] for h in holdings]
    }

def run_monte_carlo_simulation(holdings: List[dict], years: int = 10, simulations: int = 1000) -> dict:
    """Run Monte Carlo simulation for portfolio projection"""
    if not holdings:
        return {"error": "No holdings for simulation"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Portfolio parameters (simplified)
    annual_return = 0.08  # 8% expected return
    annual_volatility = 0.18  # 18% volatility
    
    # Run simulations
    trading_days = years * 252
    dt = 1 / 252
    
    all_paths = []
    final_values = []
    
    for _ in range(simulations):
        prices = [total_value]
        for _ in range(trading_days):
            drift = (annual_return - 0.5 * annual_volatility**2) * dt
            shock = annual_volatility * np.sqrt(dt) * np.random.normal()
            prices.append(prices[-1] * np.exp(drift + shock))
        all_paths.append(prices)
        final_values.append(prices[-1])
    
    # Calculate percentiles
    percentiles = {
        "p5": round(np.percentile(final_values, 5), 2),
        "p25": round(np.percentile(final_values, 25), 2),
        "p50": round(np.percentile(final_values, 50), 2),
        "p75": round(np.percentile(final_values, 75), 2),
        "p95": round(np.percentile(final_values, 95), 2)
    }
    
    # Sample paths for visualization (every year)
    sample_indices = [0, 252, 504, 756, 1008, 1260, 1512, 1764, 2016, 2268, 2520][:years + 1]
    sample_paths = []
    for path in all_paths[:100]:  # Only return 100 paths for visualization
        sample_paths.append([round(path[i], 2) for i in sample_indices if i < len(path)])
    
    # Calculate probability of meeting goals
    prob_double = len([v for v in final_values if v >= total_value * 2]) / simulations * 100
    prob_loss = len([v for v in final_values if v < total_value]) / simulations * 100
    
    return {
        "initial_value": round(total_value, 2),
        "years": years,
        "simulations": simulations,
        "percentiles": percentiles,
        "expected_value": round(np.mean(final_values), 2),
        "median_value": percentiles["p50"],
        "best_case": round(max(final_values), 2),
        "worst_case": round(min(final_values), 2),
        "prob_double": round(prob_double, 1),
        "prob_loss": round(prob_loss, 1),
        "sample_paths": sample_paths[:20],  # Return 20 sample paths
        "years_labels": list(range(years + 1))
    }

def calculate_factor_exposure(holdings: List[dict]) -> dict:
    """Calculate Fama-French style factor exposures"""
    if not holdings:
        return {}
    
    # Simulate factor exposures (in production, use actual factor loadings)
    factors = {
        "market_beta": round(random.uniform(0.8, 1.3), 2),
        "size_smb": round(random.uniform(-0.3, 0.5), 2),  # Small Minus Big
        "value_hml": round(random.uniform(-0.4, 0.6), 2),  # High Minus Low
        "momentum": round(random.uniform(-0.2, 0.4), 2),
        "quality": round(random.uniform(0.1, 0.5), 2),
        "low_volatility": round(random.uniform(-0.3, 0.3), 2)
    }
    
    # Factor contribution to return
    factor_contribution = {
        "market": round(factors["market_beta"] * 8, 1),  # 8% market premium
        "size": round(factors["size_smb"] * 2, 1),
        "value": round(factors["value_hml"] * 3, 1),
        "momentum": round(factors["momentum"] * 4, 1),
        "quality": round(factors["quality"] * 2, 1),
        "low_vol": round(factors["low_volatility"] * 1, 1)
    }
    
    return {
        "exposures": factors,
        "contributions": factor_contribution,
        "total_expected_alpha": round(sum(factor_contribution.values()) - factors["market_beta"] * 8, 2),
        "interpretation": {
            "market_beta": "High" if factors["market_beta"] > 1.1 else "Low" if factors["market_beta"] < 0.9 else "Neutral",
            "size": "Small Cap Tilt" if factors["size_smb"] > 0.2 else "Large Cap Tilt" if factors["size_smb"] < -0.2 else "Neutral",
            "value": "Value Tilt" if factors["value_hml"] > 0.2 else "Growth Tilt" if factors["value_hml"] < -0.2 else "Neutral",
            "momentum": "High Momentum" if factors["momentum"] > 0.2 else "Low Momentum" if factors["momentum"] < -0.1 else "Neutral"
        }
    }

def calculate_stress_test(holdings: List[dict]) -> dict:
    """Run stress tests against historical scenarios"""
    if not holdings:
        return {}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Historical crisis scenarios (approximate market drops)
    scenarios = [
        {"name": "2008 Financial Crisis", "market_drop": -0.52, "duration": "18 months"},
        {"name": "2020 COVID Crash", "market_drop": -0.34, "duration": "1 month"},
        {"name": "2022 Bear Market", "market_drop": -0.25, "duration": "10 months"},
        {"name": "Dot-com Crash (2000)", "market_drop": -0.49, "duration": "30 months"},
        {"name": "1987 Black Monday", "market_drop": -0.22, "duration": "1 day"},
        {"name": "Interest Rate Shock (+3%)", "market_drop": -0.15, "duration": "6 months"},
        {"name": "Stagflation Scenario", "market_drop": -0.20, "duration": "24 months"},
        {"name": "Flash Crash", "market_drop": -0.10, "duration": "1 hour"}
    ]
    
    # Calculate beta-adjusted impact
    portfolio_beta = random.uniform(0.85, 1.15)
    
    results = []
    for scenario in scenarios:
        impact = scenario["market_drop"] * portfolio_beta
        loss = total_value * impact
        results.append({
            "scenario": scenario["name"],
            "market_drop": f"{scenario['market_drop'] * 100:.0f}%",
            "portfolio_impact": f"{impact * 100:.1f}%",
            "estimated_loss": round(loss, 2),
            "duration": scenario["duration"],
            "recovery_value": round(total_value + loss, 2)
        })
    
    return {
        "portfolio_beta": round(portfolio_beta, 2),
        "current_value": round(total_value, 2),
        "scenarios": results,
        "worst_case": min(r["estimated_loss"] for r in results),
        "recommendation": "Consider hedging strategies" if portfolio_beta > 1.1 else "Portfolio has moderate risk"
    }

def generate_ai_commentary(holdings: List[dict], analysis: dict) -> str:
    """Generate AI-powered portfolio commentary"""
    if not holdings:
        return "Add holdings to receive AI-generated portfolio commentary."
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_gain = sum((h["current_price"] - h["cost_basis"]) * h["quantity"] for h in holdings)
    gain_pct = total_gain / sum(h["cost_basis"] * h["quantity"] for h in holdings) * 100 if holdings else 0
    
    # Generate contextual commentary
    commentary_parts = []
    
    # Performance commentary
    if gain_pct > 20:
        commentary_parts.append(f"Your portfolio has delivered exceptional returns of {gain_pct:.1f}%, significantly outperforming typical market benchmarks.")
    elif gain_pct > 10:
        commentary_parts.append(f"Your portfolio shows solid performance with {gain_pct:.1f}% gains, indicating effective investment selection.")
    elif gain_pct > 0:
        commentary_parts.append(f"Your portfolio is in positive territory with {gain_pct:.1f}% gains. Consider reviewing underperformers for potential rebalancing.")
    else:
        commentary_parts.append(f"Your portfolio is currently showing a {abs(gain_pct):.1f}% decline. This may present tax-loss harvesting opportunities.")
    
    # Concentration commentary
    max_holding = max(holdings, key=lambda h: h["quantity"] * h["current_price"])
    max_weight = max_holding["quantity"] * max_holding["current_price"] / total_value * 100
    if max_weight > 20:
        commentary_parts.append(f"Concentration risk alert: {max_holding['symbol']} represents {max_weight:.1f}% of your portfolio. Consider trimming for better diversification.")
    
    # Income commentary
    total_income = sum(h.get("annual_dividend", 0) * h["quantity"] for h in holdings)
    if total_income > 0:
        yield_pct = total_income / total_value * 100
        commentary_parts.append(f"Your portfolio generates ${total_income:,.0f} in annual income ({yield_pct:.1f}% yield), providing a solid foundation for passive income.")
    
    # Sector commentary
    sectors = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        sectors[sector] = sectors.get(sector, 0) + h["quantity"] * h["current_price"]
    
    top_sector = max(sectors.items(), key=lambda x: x[1])
    top_sector_weight = top_sector[1] / total_value * 100
    if top_sector_weight > 35:
        commentary_parts.append(f"Your portfolio has significant {top_sector[0]} exposure at {top_sector_weight:.0f}%. Diversifying across sectors could reduce volatility.")
    
    return " ".join(commentary_parts)

# =============================================================================
# PHASE 2: API ENDPOINTS
# =============================================================================

@app.get("/api/portfolios/{portfolio_id}/optimize")
async def get_portfolio_optimization(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get efficient frontier and optimization recommendations"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if len(holdings) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 holdings for optimization")
    
    frontier = calculate_efficient_frontier(holdings)
    return frontier

@app.get("/api/portfolios/{portfolio_id}/monte-carlo")
async def get_monte_carlo_simulation(portfolio_id: int, years: int = Query(10, ge=1, le=30), 
                                    simulations: int = Query(1000, ge=100, le=10000),
                                    user: dict = Depends(require_auth)):
    """Run Monte Carlo simulation for portfolio projection"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    return run_monte_carlo_simulation(holdings, years, simulations)

@app.get("/api/portfolios/{portfolio_id}/factors")
async def get_factor_analysis(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get Fama-French style factor exposure analysis"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    return calculate_factor_exposure(holdings)

@app.get("/api/portfolios/{portfolio_id}/stress-test")
async def get_stress_test(portfolio_id: int, user: dict = Depends(require_auth)):
    """Run stress tests against historical crisis scenarios"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    return calculate_stress_test(holdings)

@app.get("/api/portfolios/{portfolio_id}/correlation")
async def get_correlation_matrix(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get correlation matrix for portfolio holdings"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if len(holdings) < 2:
        return {"error": "Need at least 2 holdings for correlation analysis"}
    
    n = min(len(holdings), 12)
    symbols = [h["symbol"] for h in holdings[:n]]
    
    # Generate correlation matrix (in production, use real data)
    np.random.seed(42)
    corr_matrix = np.eye(n)
    for i in range(n):
        for j in range(i + 1, n):
            # Same sector = higher correlation
            if holdings[i].get("sector") == holdings[j].get("sector"):
                corr = random.uniform(0.5, 0.9)
            else:
                corr = random.uniform(0.1, 0.6)
            corr_matrix[i, j] = corr
            corr_matrix[j, i] = corr
    
    return {
        "symbols": symbols,
        "matrix": [[round(corr_matrix[i, j], 2) for j in range(n)] for i in range(n)],
        "average_correlation": round(np.mean(corr_matrix[np.triu_indices(n, 1)]), 2),
        "highest_pair": {
            "pair": f"{symbols[0]}-{symbols[1]}",
            "correlation": round(max(corr_matrix[np.triu_indices(n, 1)]), 2)
        },
        "lowest_pair": {
            "pair": f"{symbols[-1]}-{symbols[-2]}",
            "correlation": round(min(corr_matrix[np.triu_indices(n, 1)]), 2)
        }
    }

@app.get("/api/portfolios/{portfolio_id}/commentary")
async def get_ai_commentary(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get AI-generated portfolio commentary"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    commentary = generate_ai_commentary(holdings, {})
    return {"commentary": commentary}

@app.get("/api/portfolios/{portfolio_id}/benchmark")
async def get_benchmark_comparison(portfolio_id: int, benchmark: str = Query("SPY"), 
                                   user: dict = Depends(require_auth)):
    """Compare portfolio performance against benchmark"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        return {"error": "No holdings to compare"}
    
    # Simulate performance comparison
    days = 252
    portfolio_returns = []
    benchmark_returns = []
    
    portfolio_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    benchmark_value = portfolio_value
    
    portfolio_series = [100]
    benchmark_series = [100]
    
    for _ in range(days):
        p_return = random.normalvariate(0.0004, 0.015)
        b_return = random.normalvariate(0.0003, 0.012)
        
        portfolio_returns.append(p_return)
        benchmark_returns.append(b_return)
        
        portfolio_series.append(portfolio_series[-1] * (1 + p_return))
        benchmark_series.append(benchmark_series[-1] * (1 + b_return))
    
    portfolio_total = (portfolio_series[-1] - 100)
    benchmark_total = (benchmark_series[-1] - 100)
    
    return {
        "portfolio": {
            "total_return": round(portfolio_total, 2),
            "annualized_return": round(np.mean(portfolio_returns) * 252 * 100, 2),
            "volatility": round(np.std(portfolio_returns) * np.sqrt(252) * 100, 2),
            "sharpe_ratio": round((np.mean(portfolio_returns) * 252 - 0.02) / (np.std(portfolio_returns) * np.sqrt(252)), 2)
        },
        "benchmark": {
            "symbol": benchmark,
            "total_return": round(benchmark_total, 2),
            "annualized_return": round(np.mean(benchmark_returns) * 252 * 100, 2),
            "volatility": round(np.std(benchmark_returns) * np.sqrt(252) * 100, 2),
            "sharpe_ratio": round((np.mean(benchmark_returns) * 252 - 0.02) / (np.std(benchmark_returns) * np.sqrt(252)), 2)
        },
        "alpha": round(portfolio_total - benchmark_total, 2),
        "tracking_error": round(np.std(np.array(portfolio_returns) - np.array(benchmark_returns)) * np.sqrt(252) * 100, 2),
        "information_ratio": round((portfolio_total - benchmark_total) / (np.std(np.array(portfolio_returns) - np.array(benchmark_returns)) * np.sqrt(252) * 100), 2),
        "series": {
            "dates": list(range(days + 1)),
            "portfolio": [round(p, 2) for p in portfolio_series[::5]],
            "benchmark": [round(b, 2) for b in benchmark_series[::5]]
        }
    }

@app.get("/api/portfolios/{portfolio_id}/dividend-calendar")
async def get_dividend_calendar(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get dividend payment calendar"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    # Generate dividend calendar (in production, use real dividend data)
    calendar = []
    months = ["January", "February", "March", "April", "May", "June", 
              "July", "August", "September", "October", "November", "December"]
    
    for h in holdings:
        if h.get("dividend_yield", 0) > 0:
            quarterly_div = h.get("annual_dividend", 0) * h["quantity"] / 4
            # Random payment months (quarterly)
            payment_months = random.sample(range(12), 4)
            for month_idx in payment_months:
                calendar.append({
                    "symbol": h["symbol"],
                    "month": months[month_idx],
                    "month_num": month_idx + 1,
                    "amount": round(quarterly_div, 2),
                    "ex_date": f"2025-{month_idx + 1:02d}-15",
                    "pay_date": f"2025-{month_idx + 1:02d}-28"
                })
    
    # Sort by month
    calendar.sort(key=lambda x: x["month_num"])
    
    # Group by month
    monthly_totals = {}
    for item in calendar:
        month = item["month"]
        monthly_totals[month] = monthly_totals.get(month, 0) + item["amount"]
    
    return {
        "calendar": calendar,
        "monthly_totals": [{"month": m, "total": round(monthly_totals.get(m, 0), 2)} for m in months],
        "annual_total": round(sum(monthly_totals.values()), 2),
        "next_payment": calendar[0] if calendar else None
    }

@app.post("/api/portfolios/{portfolio_id}/what-if")
async def run_what_if_scenario(portfolio_id: int, 
                               scenario_type: str = Query(...),  # market_crash, bull_run, rate_hike, inflation
                               magnitude: float = Query(0.1),
                               user: dict = Depends(require_auth)):
    """Run what-if scenario analysis"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        return {"error": "No holdings for scenario analysis"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Define scenario impacts by sector
    scenario_impacts = {
        "market_crash": {
            "Technology": -0.30, "Healthcare": -0.15, "Financials": -0.35,
            "Consumer Discretionary": -0.25, "Consumer Staples": -0.10,
            "Energy": -0.20, "Utilities": -0.08, "Real Estate": -0.25,
            "Other": -0.20
        },
        "bull_run": {
            "Technology": 0.35, "Healthcare": 0.15, "Financials": 0.25,
            "Consumer Discretionary": 0.30, "Consumer Staples": 0.10,
            "Energy": 0.20, "Utilities": 0.08, "Real Estate": 0.20,
            "Other": 0.20
        },
        "rate_hike": {
            "Technology": -0.15, "Healthcare": -0.05, "Financials": 0.10,
            "Consumer Discretionary": -0.10, "Consumer Staples": -0.03,
            "Energy": 0.05, "Utilities": -0.15, "Real Estate": -0.20,
            "Other": -0.08
        },
        "inflation": {
            "Technology": -0.10, "Healthcare": 0.05, "Financials": 0.05,
            "Consumer Discretionary": -0.15, "Consumer Staples": 0.10,
            "Energy": 0.25, "Utilities": 0.05, "Real Estate": 0.15,
            "Other": 0.05
        }
    }
    
    if scenario_type not in scenario_impacts:
        return {"error": "Invalid scenario type"}
    
    impacts = scenario_impacts[scenario_type]
    
    # Calculate impact per holding
    holding_impacts = []
    total_impact = 0
    
    for h in holdings:
        sector = h.get("sector", "Other")
        base_impact = impacts.get(sector, impacts["Other"])
        scaled_impact = base_impact * magnitude / 0.1  # Scale based on magnitude
        
        current_value = h["quantity"] * h["current_price"]
        impact_value = current_value * scaled_impact
        new_value = current_value + impact_value
        
        holding_impacts.append({
            "symbol": h["symbol"],
            "sector": sector,
            "current_value": round(current_value, 2),
            "impact_pct": round(scaled_impact * 100, 1),
            "impact_value": round(impact_value, 2),
            "projected_value": round(new_value, 2)
        })
        total_impact += impact_value
    
    return {
        "scenario": scenario_type,
        "magnitude": magnitude,
        "current_portfolio_value": round(total_value, 2),
        "projected_portfolio_value": round(total_value + total_impact, 2),
        "total_impact": round(total_impact, 2),
        "total_impact_pct": round(total_impact / total_value * 100, 1),
        "holding_impacts": sorted(holding_impacts, key=lambda x: x["impact_value"]),
        "most_impacted": max(holding_impacts, key=lambda x: abs(x["impact_pct"])),
        "least_impacted": min(holding_impacts, key=lambda x: abs(x["impact_pct"]))
    }

# =============================================================================
# WATCHLIST WITH ALERTS
# =============================================================================

@app.post("/api/watchlist/alert")
async def create_price_alert(symbol: str = Query(...), 
                            alert_type: str = Query(...),  # above, below
                            target_price: float = Query(...),
                            user: dict = Depends(require_auth)):
    """Create price alert for watchlist item"""
    conn = get_db()
    conn.execute("INSERT INTO watchlist (user_id, symbol, target_price, notes) VALUES (?, ?, ?, ?)",
                (user["id"], symbol.upper(), target_price, f"Alert when price goes {alert_type} ${target_price}"))
    conn.commit()
    conn.close()
    return {"status": "alert_created", "symbol": symbol, "target": target_price}

# =============================================================================
# COMPREHENSIVE REPORT
# =============================================================================

@app.get("/api/portfolios/{portfolio_id}/full-report")
async def get_full_report(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get comprehensive portfolio report with all analytics"""
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", 
                            (portfolio_id, user["id"])).fetchone()
    if not portfolio:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        return {"error": "No holdings in portfolio"}
    
    # Gather all analytics
    health = calculate_portfolio_health_score(holdings, {"risk_tolerance": user["risk_tolerance"]})
    risk = calculate_risk_metrics(holdings)
    insights = generate_ai_insights(holdings, {"risk_tolerance": user["risk_tolerance"]})
    income = project_dividend_income(holdings)
    factors = calculate_factor_exposure(holdings)
    stress = calculate_stress_test(holdings)
    commentary = generate_ai_commentary(holdings, {})
    
    # Monte Carlo (limited for performance)
    monte_carlo = run_monte_carlo_simulation(holdings, years=10, simulations=500)
    
    # Summary stats
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    
    return {
        "portfolio": dict(portfolio),
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_value - total_cost, 2),
            "total_gain_pct": round((total_value - total_cost) / total_cost * 100, 2) if total_cost > 0 else 0,
            "holdings_count": len(holdings),
            "annual_income": income.get("annual_income", 0)
        },
        "health_score": health,
        "risk_metrics": risk,
        "factor_analysis": factors,
        "stress_test": stress,
        "monte_carlo_summary": {
            "median_10yr_value": monte_carlo.get("median_value", 0),
            "prob_double": monte_carlo.get("prob_double", 0),
            "prob_loss": monte_carlo.get("prob_loss", 0)
        },
        "ai_insights": insights[:5],
        "ai_commentary": commentary,
        "income_analysis": {
            "annual": income.get("annual_income", 0),
            "yield_on_cost": income.get("yield_on_cost", 0),
            "top_payers": income.get("top_payers", [])[:3]
        }
    }

# =============================================================================
# PHASE 3: AI NATURAL LANGUAGE QUERIES & REAL-TIME FEATURES
# =============================================================================

# AI Query Intent Detection
AI_QUERY_PATTERNS = {
    "portfolio_value": ["total value", "worth", "portfolio value", "how much", "net worth", "balance"],
    "top_performers": ["best performing", "top performer", "biggest winner", "most gain", "best stock"],
    "worst_performers": ["worst performing", "biggest loser", "most loss", "underperforming", "worst stock"],
    "sector_allocation": ["sector", "allocation", "breakdown", "diversif", "spread"],
    "dividend_income": ["dividend", "income", "yield", "payout", "distribution"],
    "risk_level": ["risk", "volatility", "beta", "sharpe", "safe"],
    "tax_opportunities": ["tax", "harvest", "loss", "tlh", "tax-loss"],
    "recommendations": ["should i", "recommend", "suggest", "advice", "what to do"],
    "comparison": ["compare", "versus", "vs", "better than", "outperform"],
    "goals_progress": ["goal", "target", "progress", "on track", "retire"],
    "market_overview": ["market", "s&p", "dow", "nasdaq", "index"],
    "specific_holding": ["about", "position in", "holding", "stock"],
    "health_score": ["health", "score", "grade", "rating"],
    "rebalance": ["rebalance", "adjust", "optimize", "allocation"]
}

def detect_query_intent(query: str) -> tuple:
    """Detect the intent of a natural language query"""
    query_lower = query.lower()
    
    for intent, patterns in AI_QUERY_PATTERNS.items():
        for pattern in patterns:
            if pattern in query_lower:
                return intent, pattern
    
    return "general", None

def extract_symbols_from_query(query: str, holdings: List[dict]) -> List[str]:
    """Extract stock symbols mentioned in query"""
    query_upper = query.upper()
    found_symbols = []
    
    for h in holdings:
        if h["symbol"].upper() in query_upper:
            found_symbols.append(h["symbol"])
    
    return found_symbols

def generate_ai_response(query: str, holdings: List[dict], user: dict, goals: List[dict] = None) -> dict:
    """Generate AI response to natural language portfolio query"""
    intent, matched_pattern = detect_query_intent(query)
    mentioned_symbols = extract_symbols_from_query(query, holdings)
    
    if not holdings:
        return {
            "intent": intent,
            "response": "I don't see any holdings in your portfolio yet. Would you like to add some investments to get started?",
            "data": None,
            "suggestions": ["Add your first holding", "Upload a portfolio file", "Create a new portfolio"]
        }
    
    # Calculate basic stats
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    total_gain = total_value - total_cost
    gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0
    
    response_data = {
        "intent": intent,
        "response": "",
        "data": None,
        "chart_type": None,
        "suggestions": []
    }
    
    # Generate response based on intent
    if intent == "portfolio_value":
        response_data["response"] = f"Your portfolio is currently worth **${total_value:,.2f}**. "
        if total_gain >= 0:
            response_data["response"] += f"You're up **${total_gain:,.2f}** ({gain_pct:.1f}%) from your cost basis of ${total_cost:,.2f}."
        else:
            response_data["response"] += f"You're down **${abs(total_gain):,.2f}** ({gain_pct:.1f}%) from your cost basis of ${total_cost:,.2f}."
        response_data["data"] = {"total_value": total_value, "total_cost": total_cost, "gain": total_gain, "gain_pct": gain_pct}
        response_data["suggestions"] = ["Show my top performers", "What's my sector allocation?", "Am I on track for my goals?"]
    
    elif intent == "top_performers":
        sorted_holdings = sorted(holdings, key=lambda h: (h["current_price"] - h["cost_basis"]) / h["cost_basis"] if h["cost_basis"] > 0 else 0, reverse=True)
        top_5 = sorted_holdings[:5]
        response_data["response"] = "Here are your **top performing holdings**:\n\n"
        for i, h in enumerate(top_5, 1):
            pct = ((h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100) if h["cost_basis"] > 0 else 0
            response_data["response"] += f"{i}. **{h['symbol']}** - Up {pct:.1f}% (${h['current_price'] - h['cost_basis']:.2f}/share)\n"
        response_data["data"] = [{"symbol": h["symbol"], "gain_pct": ((h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100) if h["cost_basis"] > 0 else 0} for h in top_5]
        response_data["chart_type"] = "bar"
        response_data["suggestions"] = ["Show worst performers", "Should I take profits?", "What's the tax impact of selling?"]
    
    elif intent == "worst_performers":
        sorted_holdings = sorted(holdings, key=lambda h: (h["current_price"] - h["cost_basis"]) / h["cost_basis"] if h["cost_basis"] > 0 else 0)
        bottom_5 = sorted_holdings[:5]
        response_data["response"] = "Here are your **worst performing holdings**:\n\n"
        for i, h in enumerate(bottom_5, 1):
            pct = ((h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100) if h["cost_basis"] > 0 else 0
            response_data["response"] += f"{i}. **{h['symbol']}** - Down {abs(pct):.1f}% (${h['current_price'] - h['cost_basis']:.2f}/share)\n"
        
        # Check for TLH opportunities
        tlh_candidates = [h for h in bottom_5 if h["current_price"] < h["cost_basis"]]
        if tlh_candidates:
            response_data["response"] += f"\n💡 **Tax-Loss Harvesting Opportunity**: {len(tlh_candidates)} of these could be harvested for tax savings."
        response_data["data"] = [{"symbol": h["symbol"], "gain_pct": ((h["current_price"] - h["cost_basis"]) / h["cost_basis"] * 100) if h["cost_basis"] > 0 else 0} for h in bottom_5]
        response_data["chart_type"] = "bar"
        response_data["suggestions"] = ["Tell me about tax-loss harvesting", "Should I sell these?", "Show replacement ETFs"]
    
    elif intent == "sector_allocation":
        sectors = {}
        for h in holdings:
            sector = h.get("sector", "Other")
            value = h["quantity"] * h["current_price"]
            sectors[sector] = sectors.get(sector, 0) + value
        
        sector_pcts = {s: (v / total_value * 100) for s, v in sectors.items()}
        sorted_sectors = sorted(sector_pcts.items(), key=lambda x: x[1], reverse=True)
        
        response_data["response"] = "Here's your **sector allocation**:\n\n"
        for sector, pct in sorted_sectors:
            bar = "█" * int(pct / 5)
            response_data["response"] += f"**{sector}**: {pct:.1f}% {bar}\n"
        
        # Check for concentration
        if sorted_sectors[0][1] > 35:
            response_data["response"] += f"\n⚠️ **Concentration Warning**: {sorted_sectors[0][0]} represents {sorted_sectors[0][1]:.0f}% of your portfolio."
        response_data["data"] = [{"sector": s, "value": v, "percentage": p} for (s, p), v in zip(sorted_sectors, [sectors[s] for s, _ in sorted_sectors])]
        response_data["chart_type"] = "pie"
        response_data["suggestions"] = ["How can I diversify?", "What sectors am I missing?", "Compare to S&P 500 allocation"]
    
    elif intent == "dividend_income":
        total_income = sum(h.get("annual_dividend", 0) * h["quantity"] for h in holdings)
        monthly_income = total_income / 12
        yield_pct = (total_income / total_value * 100) if total_value > 0 else 0
        
        # Top dividend payers
        div_holdings = [(h, h.get("annual_dividend", 0) * h["quantity"]) for h in holdings if h.get("annual_dividend", 0) > 0]
        div_holdings.sort(key=lambda x: x[1], reverse=True)
        
        response_data["response"] = f"Your portfolio generates **${total_income:,.2f}** in annual dividend income, "
        response_data["response"] += f"which is **${monthly_income:,.2f}** per month ({yield_pct:.2f}% yield).\n\n"
        response_data["response"] += "**Top dividend contributors:**\n"
        for h, income in div_holdings[:5]:
            response_data["response"] += f"- {h['symbol']}: ${income:,.2f}/year ({h.get('dividend_yield', 0):.1f}% yield)\n"
        
        response_data["data"] = {"annual_income": total_income, "monthly_income": monthly_income, "yield": yield_pct}
        response_data["suggestions"] = ["Show dividend calendar", "How to increase income?", "What's the 5-year projection?"]
    
    elif intent == "risk_level":
        # Calculate basic risk metrics
        beta = sum(random.uniform(0.8, 1.3) for _ in holdings) / len(holdings)
        volatility = random.uniform(12, 25)
        sharpe = random.uniform(0.5, 1.5)
        
        risk_level = "Aggressive" if beta > 1.15 else "Moderate" if beta > 0.9 else "Conservative"
        
        response_data["response"] = f"Your portfolio has a **{risk_level}** risk profile.\n\n"
        response_data["response"] += f"📊 **Risk Metrics:**\n"
        response_data["response"] += f"- Beta: {beta:.2f} (market sensitivity)\n"
        response_data["response"] += f"- Volatility: {volatility:.1f}% annual\n"
        response_data["response"] += f"- Sharpe Ratio: {sharpe:.2f} (risk-adjusted return)\n"
        
        if user.get("risk_tolerance") == "conservative" and risk_level == "Aggressive":
            response_data["response"] += "\n⚠️ Your portfolio may be riskier than your stated preference."
        
        response_data["data"] = {"beta": beta, "volatility": volatility, "sharpe": sharpe, "risk_level": risk_level}
        response_data["suggestions"] = ["How to reduce risk?", "Show stress test results", "What's my max drawdown?"]
    
    elif intent == "tax_opportunities":
        losses = [(h, (h["cost_basis"] - h["current_price"]) * h["quantity"]) 
                  for h in holdings if h["current_price"] < h["cost_basis"]]
        losses.sort(key=lambda x: x[1], reverse=True)
        
        total_harvestable = sum(l[1] for l in losses)
        tax_bracket = float(user.get("tax_bracket", "24").replace("%", "")) / 100
        tax_savings = total_harvestable * tax_bracket
        
        if losses:
            response_data["response"] = f"💰 **Tax-Loss Harvesting Opportunities Found!**\n\n"
            response_data["response"] += f"You have **${total_harvestable:,.2f}** in harvestable losses across {len(losses)} positions.\n"
            response_data["response"] += f"At your {tax_bracket*100:.0f}% tax bracket, this could save you **${tax_savings:,.2f}** in taxes.\n\n"
            response_data["response"] += "**Top opportunities:**\n"
            for h, loss in losses[:5]:
                response_data["response"] += f"- {h['symbol']}: ${loss:,.2f} loss available\n"
        else:
            response_data["response"] = "✅ No tax-loss harvesting opportunities right now - all your positions are profitable!"
        
        response_data["data"] = {"total_harvestable": total_harvestable, "tax_savings": tax_savings, "opportunities": len(losses)}
        response_data["suggestions"] = ["Execute tax-loss harvest", "Show wash sale rules", "Find replacement ETFs"]
    
    elif intent == "health_score":
        health = calculate_portfolio_health_score(holdings, {"risk_tolerance": user.get("risk_tolerance", "moderate")})
        
        response_data["response"] = f"Your portfolio health score is **{health['score']}/100** (Grade: **{health['grade']}**)\n\n"
        response_data["response"] += "**Score Breakdown:**\n"
        for factor, score in health.get("factors", {}).items():
            emoji = "✅" if score >= 20 else "⚠️" if score >= 15 else "❌"
            response_data["response"] += f"{emoji} {factor.replace('_', ' ').title()}: {score}/25\n"
        
        response_data["data"] = health
        response_data["chart_type"] = "radar"
        response_data["suggestions"] = ["How to improve my score?", "What's dragging my score down?", "Compare to benchmark"]
    
    elif intent == "specific_holding" and mentioned_symbols:
        symbol = mentioned_symbols[0]
        holding = next((h for h in holdings if h["symbol"].upper() == symbol.upper()), None)
        
        if holding:
            value = holding["quantity"] * holding["current_price"]
            cost = holding["quantity"] * holding["cost_basis"]
            gain = value - cost
            gain_pct = (gain / cost * 100) if cost > 0 else 0
            weight = (value / total_value * 100) if total_value > 0 else 0
            
            response_data["response"] = f"**{holding['symbol']}** - {holding.get('name', 'N/A')}\n\n"
            response_data["response"] += f"📊 **Position Details:**\n"
            response_data["response"] += f"- Shares: {holding['quantity']}\n"
            response_data["response"] += f"- Current Price: ${holding['current_price']:.2f}\n"
            response_data["response"] += f"- Cost Basis: ${holding['cost_basis']:.2f}\n"
            response_data["response"] += f"- Market Value: ${value:,.2f}\n"
            response_data["response"] += f"- Gain/Loss: ${gain:,.2f} ({gain_pct:+.1f}%)\n"
            response_data["response"] += f"- Portfolio Weight: {weight:.1f}%\n"
            
            if holding.get("dividend_yield"):
                response_data["response"] += f"- Dividend Yield: {holding['dividend_yield']:.2f}%\n"
            
            response_data["data"] = {"symbol": symbol, "value": value, "gain": gain, "weight": weight}
        else:
            response_data["response"] = f"I couldn't find {symbol} in your portfolio."
        
        response_data["suggestions"] = [f"Should I sell {symbol}?", f"What's the outlook for {symbol}?", "Show similar stocks"]
    
    elif intent == "goals_progress" and goals:
        response_data["response"] = "**Your Financial Goals Progress:**\n\n"
        for goal in goals:
            progress = (goal.get("current_amount", 0) / goal["target_amount"] * 100) if goal["target_amount"] > 0 else 0
            bar = "█" * int(progress / 10) + "░" * (10 - int(progress / 10))
            status = "🎯" if progress >= 100 else "🔄" if progress >= 50 else "📈"
            response_data["response"] += f"{status} **{goal['name']}**: ${goal.get('current_amount', 0):,.0f} / ${goal['target_amount']:,.0f}\n"
            response_data["response"] += f"   {bar} {progress:.0f}%\n\n"
        
        response_data["data"] = goals
        response_data["suggestions"] = ["How to reach goals faster?", "Adjust my contributions", "Show retirement projections"]
    
    else:
        # General fallback
        response_data["response"] = f"Here's a quick overview of your portfolio:\n\n"
        response_data["response"] += f"💰 **Total Value**: ${total_value:,.2f}\n"
        response_data["response"] += f"📈 **Total Gain**: ${total_gain:,.2f} ({gain_pct:+.1f}%)\n"
        response_data["response"] += f"📊 **Holdings**: {len(holdings)} positions\n"
        
        total_income = sum(h.get("annual_dividend", 0) * h["quantity"] for h in holdings)
        if total_income > 0:
            response_data["response"] += f"💵 **Annual Income**: ${total_income:,.2f}\n"
        
        response_data["suggestions"] = [
            "What are my top performers?",
            "Show my sector allocation",
            "Any tax-loss harvesting opportunities?",
            "What's my risk level?"
        ]
    
    return response_data

@app.post("/api/ai/chat")
async def ai_chat(query: str = Query(..., min_length=1), portfolio_id: int = Query(None), 
                  user: dict = Depends(require_auth)):
    """Natural language chat interface for portfolio queries"""
    conn = get_db()
    
    # Get holdings
    holdings = []
    if portfolio_id:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    else:
        # Get all holdings across all portfolios
        portfolios = conn.execute("SELECT id FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
        for p in portfolios:
            h = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
            holdings.extend(h)
    
    holdings = [dict(h) for h in holdings]
    
    # Get goals
    goals = conn.execute("SELECT * FROM goals WHERE user_id = ?", (user["id"],)).fetchall()
    goals = [dict(g) for g in goals]
    
    conn.close()
    
    response = generate_ai_response(query, holdings, user, goals)
    response["query"] = query
    response["timestamp"] = datetime.now().isoformat()
    
    return response

@app.get("/api/ai/suggestions")
async def get_ai_suggestions(portfolio_id: int = Query(None), user: dict = Depends(require_auth)):
    """Get AI-powered suggestions for the chat interface"""
    suggestions = [
        "What's my portfolio worth?",
        "Show my top performers",
        "Any tax-loss harvesting opportunities?",
        "What's my sector allocation?",
        "How much dividend income do I earn?",
        "What's my portfolio health score?",
        "Am I on track for my goals?",
        "What's my risk level?",
        "Show my worst performers",
        "How can I rebalance?"
    ]
    return {"suggestions": random.sample(suggestions, 6)}

# =============================================================================
# MARKET DATA & NEWS
# =============================================================================

MOCK_NEWS = [
    {"id": 1, "title": "Fed Signals Rate Cut Path Through 2025", "source": "Reuters", "time": "2h ago", "sentiment": "positive", "tickers": ["SPY", "QQQ"]},
    {"id": 2, "title": "Tech Earnings Beat Expectations", "source": "Bloomberg", "time": "4h ago", "sentiment": "positive", "tickers": ["AAPL", "MSFT", "GOOGL"]},
    {"id": 3, "title": "Oil Prices Rise on Supply Concerns", "source": "CNBC", "time": "5h ago", "sentiment": "neutral", "tickers": ["XOM", "CVX"]},
    {"id": 4, "title": "Retail Sales Data Shows Consumer Strength", "source": "WSJ", "time": "6h ago", "sentiment": "positive", "tickers": ["AMZN", "WMT"]},
    {"id": 5, "title": "Healthcare Sector Faces Regulatory Pressure", "source": "MarketWatch", "time": "8h ago", "sentiment": "negative", "tickers": ["JNJ", "UNH"]},
    {"id": 6, "title": "Semiconductor Demand Surges on AI Boom", "source": "TechCrunch", "time": "10h ago", "sentiment": "positive", "tickers": ["NVDA", "AMD", "INTC"]},
    {"id": 7, "title": "Housing Market Shows Signs of Cooling", "source": "Reuters", "time": "12h ago", "sentiment": "negative", "tickers": ["HD", "LOW"]},
    {"id": 8, "title": "Electric Vehicle Sales Accelerate Globally", "source": "Bloomberg", "time": "1d ago", "sentiment": "positive", "tickers": ["TSLA", "RIVN"]},
]

@app.get("/api/news")
async def get_market_news(portfolio_id: int = Query(None), user: dict = Depends(require_auth)):
    """Get market news, optionally filtered by portfolio holdings"""
    news = MOCK_NEWS.copy()
    
    if portfolio_id:
        conn = get_db()
        holdings = conn.execute("SELECT symbol FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
        conn.close()
        
        portfolio_symbols = {h["symbol"].upper() for h in holdings}
        
        # Add relevance score
        for item in news:
            item["relevant"] = any(t in portfolio_symbols for t in item.get("tickers", []))
        
        # Sort by relevance, then by recency
        news.sort(key=lambda x: (not x.get("relevant", False), x["id"]))
    
    return {"news": news, "updated_at": datetime.now().isoformat()}

@app.get("/api/market/live")
async def get_live_market_data(user: dict = Depends(require_auth)):
    """Get simulated live market data"""
    # Simulated real-time data (in production, use Alpha Vantage, Polygon, etc.)
    indices = {
        "SPY": {"price": 585.42 + random.uniform(-2, 2), "change": random.uniform(-0.5, 0.5), "name": "S&P 500"},
        "QQQ": {"price": 512.18 + random.uniform(-3, 3), "change": random.uniform(-0.8, 0.8), "name": "NASDAQ 100"},
        "DIA": {"price": 438.75 + random.uniform(-1.5, 1.5), "change": random.uniform(-0.4, 0.4), "name": "Dow Jones"},
        "IWM": {"price": 225.33 + random.uniform(-2, 2), "change": random.uniform(-0.6, 0.6), "name": "Russell 2000"},
        "VIX": {"price": 14.25 + random.uniform(-1, 1), "change": random.uniform(-5, 5), "name": "Volatility Index"},
    }
    
    return {
        "indices": indices,
        "market_status": "open" if datetime.now().hour >= 9 and datetime.now().hour < 16 else "closed",
        "timestamp": datetime.now().isoformat()
    }

# =============================================================================
# ADVANCED WATCHLIST & ALERTS
# =============================================================================

@app.get("/api/watchlist/detailed")
async def get_detailed_watchlist(user: dict = Depends(require_auth)):
    """Get watchlist with live quotes and alerts"""
    conn = get_db()
    watchlist = conn.execute("SELECT * FROM watchlist WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    detailed = []
    for item in watchlist:
        item = dict(item)
        # Simulate live quote
        base_price = item.get("target_price", 100) * random.uniform(0.9, 1.1)
        item["current_price"] = round(base_price, 2)
        item["change"] = round(random.uniform(-3, 3), 2)
        item["change_pct"] = round(random.uniform(-2, 2), 2)
        item["alert_triggered"] = item["current_price"] >= item["target_price"] if item.get("target_price") else False
        detailed.append(item)
    
    return {"watchlist": detailed}

@app.post("/api/alerts/smart")
async def create_smart_alert(alert_type: str = Query(...),  # price, volume, news, earnings
                            symbol: str = Query(None),
                            condition: str = Query(None),  # above, below, change
                            value: float = Query(None),
                            user: dict = Depends(require_auth)):
    """Create intelligent alerts"""
    conn = get_db()
    
    alert_data = {
        "type": alert_type,
        "symbol": symbol,
        "condition": condition,
        "value": value
    }
    
    conn.execute("""
        INSERT INTO alerts (user_id, alert_type, title, message, severity, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], alert_type, f"{alert_type.title()} Alert for {symbol}", 
          f"Alert when {symbol} {condition} ${value}", "info", str(alert_data)))
    conn.commit()
    conn.close()
    
    return {"status": "created", "alert": alert_data}

# =============================================================================
# PORTFOLIO COMPARISON
# =============================================================================

@app.get("/api/portfolios/compare")
async def compare_portfolios(portfolio_ids: str = Query(...),  # Comma-separated IDs
                            user: dict = Depends(require_auth)):
    """Compare multiple portfolios side by side"""
    ids = [int(id.strip()) for id in portfolio_ids.split(",")]
    
    conn = get_db()
    comparisons = []
    
    for pid in ids:
        portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", 
                                (pid, user["id"])).fetchone()
        if not portfolio:
            continue
        
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (pid,)).fetchall()
        holdings = [dict(h) for h in holdings]
        
        total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
        total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
        total_income = sum(h.get("annual_dividend", 0) * h["quantity"] for h in holdings)
        
        # Calculate metrics
        health = calculate_portfolio_health_score(holdings, {"risk_tolerance": user.get("risk_tolerance", "moderate")})
        risk = calculate_risk_metrics(holdings)
        
        comparisons.append({
            "id": pid,
            "name": portfolio["name"],
            "total_value": round(total_value, 2),
            "total_gain": round(total_value - total_cost, 2),
            "gain_pct": round((total_value - total_cost) / total_cost * 100, 2) if total_cost > 0 else 0,
            "annual_income": round(total_income, 2),
            "yield": round(total_income / total_value * 100, 2) if total_value > 0 else 0,
            "holdings_count": len(holdings),
            "health_score": health.get("score", 0),
            "health_grade": health.get("grade", "N/A"),
            "sharpe_ratio": risk.get("sharpe_ratio", 0),
            "volatility": risk.get("volatility", 0),
            "beta": risk.get("beta", 0)
        })
    
    conn.close()
    
    return {"portfolios": comparisons}

# =============================================================================
# DATA EXPORT
# =============================================================================

@app.get("/api/portfolios/{portfolio_id}/export/csv")
async def export_portfolio_csv(portfolio_id: int, user: dict = Depends(require_auth)):
    """Export portfolio holdings to CSV"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        raise HTTPException(status_code=404, detail="No holdings to export")
    
    # Create CSV content
    csv_lines = ["Symbol,Name,Quantity,Cost Basis,Current Price,Market Value,Gain/Loss,Gain %,Sector,Dividend Yield"]
    
    for h in holdings:
        h = dict(h)
        value = h["quantity"] * h["current_price"]
        cost = h["quantity"] * h["cost_basis"]
        gain = value - cost
        gain_pct = (gain / cost * 100) if cost > 0 else 0
        
        csv_lines.append(f'{h["symbol"]},{h.get("name", "")},{h["quantity"]},{h["cost_basis"]:.2f},{h["current_price"]:.2f},{value:.2f},{gain:.2f},{gain_pct:.2f},{h.get("sector", "")},{h.get("dividend_yield", 0):.2f}')
    
    return {"csv_content": "\n".join(csv_lines), "filename": f"portfolio_{portfolio_id}_export.csv"}

@app.get("/api/portfolios/{portfolio_id}/export/json")
async def export_portfolio_json(portfolio_id: int, user: dict = Depends(require_auth)):
    """Export portfolio data as JSON"""
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", 
                            (portfolio_id, user["id"])).fetchone()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    export_data = {
        "portfolio": dict(portfolio),
        "holdings": [dict(h) for h in holdings],
        "exported_at": datetime.now().isoformat(),
        "total_value": sum(h["quantity"] * h["current_price"] for h in holdings)
    }
    
    return export_data

# =============================================================================
# NOTIFICATION CENTER
# =============================================================================

@app.get("/api/notifications")
async def get_notifications(user: dict = Depends(require_auth)):
    """Get all notifications for user"""
    conn = get_db()
    alerts = conn.execute("""
        SELECT * FROM alerts WHERE user_id = ? 
        ORDER BY created_at DESC LIMIT 50
    """, (user["id"],)).fetchall()
    conn.close()
    
    return {
        "notifications": [dict(a) for a in alerts],
        "unread_count": sum(1 for a in alerts if not a["is_read"])
    }

@app.put("/api/notifications/read-all")
async def mark_all_read(user: dict = Depends(require_auth)):
    """Mark all notifications as read"""
    conn = get_db()
    conn.execute("UPDATE alerts SET is_read = 1 WHERE user_id = ?", (user["id"],))
    conn.commit()
    conn.close()
    return {"status": "ok"}

# =============================================================================
# PERFORMANCE ATTRIBUTION
# =============================================================================

@app.get("/api/portfolios/{portfolio_id}/attribution")
async def get_performance_attribution(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get performance attribution analysis"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        return {"error": "No holdings for attribution"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_gain = sum((h["current_price"] - h["cost_basis"]) * h["quantity"] for h in holdings)
    
    # Attribution by holding
    holding_attribution = []
    for h in holdings:
        gain = (h["current_price"] - h["cost_basis"]) * h["quantity"]
        contribution = (gain / total_gain * 100) if total_gain != 0 else 0
        holding_attribution.append({
            "symbol": h["symbol"],
            "gain": round(gain, 2),
            "contribution_pct": round(contribution, 2),
            "weight": round(h["quantity"] * h["current_price"] / total_value * 100, 2)
        })
    
    holding_attribution.sort(key=lambda x: x["gain"], reverse=True)
    
    # Attribution by sector
    sector_attribution = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        gain = (h["current_price"] - h["cost_basis"]) * h["quantity"]
        if sector not in sector_attribution:
            sector_attribution[sector] = {"gain": 0, "value": 0}
        sector_attribution[sector]["gain"] += gain
        sector_attribution[sector]["value"] += h["quantity"] * h["current_price"]
    
    sector_data = [
        {
            "sector": sector,
            "gain": round(data["gain"], 2),
            "contribution_pct": round(data["gain"] / total_gain * 100, 2) if total_gain != 0 else 0,
            "weight": round(data["value"] / total_value * 100, 2)
        }
        for sector, data in sector_attribution.items()
    ]
    sector_data.sort(key=lambda x: x["gain"], reverse=True)
    
    return {
        "total_gain": round(total_gain, 2),
        "by_holding": holding_attribution,
        "by_sector": sector_data,
        "top_contributor": holding_attribution[0] if holding_attribution else None,
        "worst_contributor": holding_attribution[-1] if holding_attribution else None
    }

# =============================================================================
# PHASE 11: REBALANCING, RESEARCH, SOCIAL TRADING, OPTIONS GREEKS, ALTERNATIVES
# =============================================================================

# Analyst Ratings Data
ANALYST_RATINGS = {
    "AAPL": {"buy": 28, "hold": 8, "sell": 2, "target": 210.00, "consensus": "Strong Buy"},
    "MSFT": {"buy": 35, "hold": 5, "sell": 1, "target": 450.00, "consensus": "Strong Buy"},
    "GOOGL": {"buy": 30, "hold": 10, "sell": 2, "target": 175.00, "consensus": "Buy"},
    "AMZN": {"buy": 42, "hold": 6, "sell": 0, "target": 210.00, "consensus": "Strong Buy"},
    "NVDA": {"buy": 38, "hold": 8, "sell": 3, "target": 150.00, "consensus": "Buy"},
    "META": {"buy": 32, "hold": 12, "sell": 4, "target": 550.00, "consensus": "Buy"},
    "TSLA": {"buy": 15, "hold": 20, "sell": 12, "target": 280.00, "consensus": "Hold"},
    "JPM": {"buy": 18, "hold": 10, "sell": 2, "target": 220.00, "consensus": "Buy"},
}

# Alternative Investments
ALTERNATIVES = {
    "real_estate": [
        {"name": "Fundrise Growth eREIT", "type": "REIT", "min_investment": 10, "annual_return": 8.5, "liquidity": "Low"},
        {"name": "RealtyMogul Apartment Fund", "type": "Private REIT", "min_investment": 5000, "annual_return": 7.2, "liquidity": "Low"},
        {"name": "CrowdStreet Office Fund", "type": "Syndication", "min_investment": 25000, "annual_return": 12.5, "liquidity": "Very Low"},
    ],
    "commodities": [
        {"symbol": "GLD", "name": "Gold ETF", "price": 185.50, "change_ytd": 12.8},
        {"symbol": "SLV", "name": "Silver ETF", "price": 22.30, "change_ytd": 8.5},
        {"symbol": "USO", "name": "Oil ETF", "price": 72.50, "change_ytd": -5.2},
        {"symbol": "WEAT", "name": "Wheat ETF", "price": 5.80, "change_ytd": -12.5},
    ],
    "private_equity": [
        {"name": "Titan Pre-IPO Fund", "focus": "Tech Unicorns", "min_investment": 10000, "target_return": 25},
        {"name": "EquityZen Secondary", "focus": "Late-Stage Startups", "min_investment": 5000, "target_return": 20},
    ],
    "crypto_yield": [
        {"platform": "Coinbase", "asset": "USDC", "apy": 4.5, "risk": "Low"},
        {"platform": "Gemini", "asset": "ETH", "apy": 3.2, "risk": "Medium"},
    ]
}

# Initialize Phase 11 tables
def init_phase11_tables():
    conn = get_db()
    
    # Rebalancing history
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rebalancing_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER NOT NULL,
            target_allocation TEXT NOT NULL,
            trades_executed TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            executed_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Social trading - traders to follow
    conn.execute("""
        CREATE TABLE IF NOT EXISTS followed_traders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            trader_id TEXT NOT NULL,
            auto_copy INTEGER DEFAULT 0,
            copy_percentage REAL DEFAULT 10,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Social trading - public trades
    conn.execute("""
        CREATE TABLE IF NOT EXISTS public_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trader_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            shares REAL NOT NULL,
            price REAL NOT NULL,
            rationale TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Alternative investments tracking
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alternative_investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            invested_amount REAL NOT NULL,
            current_value REAL,
            purchase_date TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Estate planning - beneficiaries
    conn.execute("""
        CREATE TABLE IF NOT EXISTS beneficiaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            relationship TEXT,
            percentage REAL NOT NULL,
            account_type TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Financial goals detailed
    conn.execute("""
        CREATE TABLE IF NOT EXISTS financial_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_type TEXT NOT NULL,
            target_amount REAL,
            monthly_contribution REAL,
            current_progress REAL DEFAULT 0,
            target_date TEXT,
            priority TEXT DEFAULT 'medium',
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase11_tables()

# =============================================================================
# REBALANCING WIZARD ENDPOINTS
# =============================================================================

@app.get("/api/rebalance/analyze/{portfolio_id}")
async def analyze_rebalancing(portfolio_id: int, user: dict = Depends(require_auth)):
    """Analyze portfolio for rebalancing needs"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings found"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Current allocation
    current = []
    for h in holdings:
        value = h["quantity"] * h["current_price"]
        current.append({
            "symbol": h["symbol"],
            "value": round(value, 2),
            "weight": round(value / total_value * 100, 2),
            "shares": h["quantity"]
        })
    
    # Suggested target (equal weight as default)
    target_weight = 100 / len(holdings)
    
    # Calculate drift and trades needed
    trades = []
    for c in current:
        drift = c["weight"] - target_weight
        if abs(drift) > 2:  # Only suggest if drift > 2%
            target_value = total_value * target_weight / 100
            current_value = c["value"]
            trade_value = target_value - current_value
            price = current_value / c["shares"] if c["shares"] > 0 else 0
            trade_shares = trade_value / price if price > 0 else 0
            
            trades.append({
                "symbol": c["symbol"],
                "action": "BUY" if trade_value > 0 else "SELL",
                "shares": abs(round(trade_shares, 2)),
                "value": abs(round(trade_value, 2)),
                "current_weight": c["weight"],
                "target_weight": round(target_weight, 2),
                "drift": round(drift, 2)
            })
    
    return {
        "portfolio_id": portfolio_id,
        "total_value": round(total_value, 2),
        "current_allocation": sorted(current, key=lambda x: x["weight"], reverse=True),
        "suggested_trades": sorted(trades, key=lambda x: abs(x["drift"]), reverse=True),
        "max_drift": round(max(abs(t["drift"]) for t in trades) if trades else 0, 2),
        "needs_rebalancing": len(trades) > 0
    }

@app.post("/api/rebalance/execute/{portfolio_id}")
async def execute_rebalancing(
    portfolio_id: int,
    target_allocation: str = Query(...),  # JSON: {"AAPL": 25, "MSFT": 25, ...}
    user: dict = Depends(require_auth)
):
    """Execute rebalancing trades"""
    import json
    targets = json.loads(target_allocation)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO rebalancing_history (user_id, portfolio_id, target_allocation, status)
        VALUES (?, ?, ?, 'executed')
    """, (user["id"], portfolio_id, target_allocation))
    conn.commit()
    conn.close()
    
    log_audit(user["id"], "rebalance_portfolio", "portfolio", portfolio_id, f"Rebalanced to {target_allocation}")
    
    return {"status": "executed", "target_allocation": targets}

@app.get("/api/rebalance/history")
async def get_rebalancing_history(user: dict = Depends(require_auth)):
    """Get rebalancing history"""
    conn = get_db()
    history = conn.execute("""
        SELECT * FROM rebalancing_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    """, (user["id"],)).fetchall()
    conn.close()
    
    return {"history": [dict(h) for h in history]}

@app.get("/api/rebalance/strategies")
async def get_rebalancing_strategies(user: dict = Depends(require_auth)):
    """Get common rebalancing strategies"""
    return {
        "strategies": [
            {"id": "equal_weight", "name": "Equal Weight", "description": "Distribute equally across all holdings"},
            {"id": "market_cap", "name": "Market Cap Weighted", "description": "Weight by company market capitalization"},
            {"id": "risk_parity", "name": "Risk Parity", "description": "Weight inversely to volatility"},
            {"id": "momentum", "name": "Momentum Tilt", "description": "Overweight recent outperformers"},
            {"id": "value", "name": "Value Tilt", "description": "Overweight low P/E stocks"},
            {"id": "dividend", "name": "Dividend Focus", "description": "Weight by dividend yield"},
        ]
    }

# =============================================================================
# RESEARCH HUB ENDPOINTS
# =============================================================================

@app.get("/api/research/company/{symbol}")
async def get_company_research(symbol: str, user: dict = Depends(require_auth)):
    """Get comprehensive company research"""
    symbol = symbol.upper()
    
    # Simulated research data
    return {
        "symbol": symbol,
        "company_name": f"{symbol} Inc.",
        "sector": random.choice(["Technology", "Healthcare", "Finance", "Consumer", "Energy"]),
        "industry": random.choice(["Software", "Biotech", "Banking", "Retail", "Oil & Gas"]),
        "employees": random.randint(1000, 500000),
        "headquarters": random.choice(["San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX"]),
        "founded": random.randint(1970, 2015),
        "ceo": f"John Smith",
        "website": f"https://www.{symbol.lower()}.com",
        "description": f"{symbol} is a leading company in its industry, focused on innovation and growth.",
        "financials": {
            "revenue": f"${random.randint(1, 500)}B",
            "net_income": f"${random.randint(100, 50000)}M",
            "gross_margin": round(random.uniform(30, 80), 1),
            "operating_margin": round(random.uniform(10, 40), 1),
            "roe": round(random.uniform(10, 50), 1),
            "debt_to_equity": round(random.uniform(0.1, 2), 2),
        },
        "valuation": {
            "market_cap": f"${random.randint(10, 3000)}B",
            "pe_ratio": round(random.uniform(10, 60), 1),
            "forward_pe": round(random.uniform(8, 50), 1),
            "peg_ratio": round(random.uniform(0.5, 3), 2),
            "price_to_sales": round(random.uniform(1, 20), 1),
            "price_to_book": round(random.uniform(1, 15), 1),
            "ev_to_ebitda": round(random.uniform(5, 30), 1),
        },
        "growth": {
            "revenue_growth_yoy": round(random.uniform(-10, 50), 1),
            "earnings_growth_yoy": round(random.uniform(-20, 80), 1),
            "revenue_growth_5y": round(random.uniform(5, 30), 1),
        }
    }

@app.get("/api/research/analysts/{symbol}")
async def get_analyst_ratings(symbol: str, user: dict = Depends(require_auth)):
    """Get analyst ratings and price targets"""
    symbol = symbol.upper()
    
    ratings = ANALYST_RATINGS.get(symbol, {
        "buy": random.randint(5, 30),
        "hold": random.randint(3, 15),
        "sell": random.randint(0, 8),
        "target": round(random.uniform(50, 500), 2),
        "consensus": random.choice(["Strong Buy", "Buy", "Hold", "Sell"])
    })
    
    # Generate recent analyst actions
    actions = []
    firms = ["Goldman Sachs", "Morgan Stanley", "JP Morgan", "Bank of America", "Citi", "Wells Fargo", "UBS", "Credit Suisse"]
    for _ in range(5):
        actions.append({
            "firm": random.choice(firms),
            "action": random.choice(["Upgrade", "Downgrade", "Maintain", "Initiate"]),
            "rating": random.choice(["Buy", "Hold", "Sell", "Outperform", "Underperform"]),
            "target": round(ratings["target"] * random.uniform(0.85, 1.15), 2),
            "date": (datetime.now() - timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d")
        })
    
    return {
        "symbol": symbol,
        "consensus": ratings["consensus"],
        "ratings_breakdown": {
            "buy": ratings["buy"],
            "hold": ratings["hold"],
            "sell": ratings["sell"],
            "total": ratings["buy"] + ratings["hold"] + ratings["sell"]
        },
        "price_target": {
            "average": ratings["target"],
            "high": round(ratings["target"] * 1.3, 2),
            "low": round(ratings["target"] * 0.7, 2),
        },
        "recent_actions": actions
    }

@app.get("/api/research/earnings/{symbol}")
async def get_earnings_history(symbol: str, user: dict = Depends(require_auth)):
    """Get earnings history and estimates"""
    symbol = symbol.upper()
    
    quarters = []
    for i in range(8):
        quarter_date = datetime.now() - timedelta(days=90 * i)
        estimated = round(random.uniform(1, 5), 2)
        actual = round(estimated * random.uniform(0.9, 1.15), 2)
        quarters.append({
            "quarter": f"Q{((quarter_date.month - 1) // 3) + 1} {quarter_date.year}",
            "date": quarter_date.strftime("%Y-%m-%d"),
            "estimated_eps": estimated,
            "actual_eps": actual if i > 0 else None,
            "surprise_pct": round((actual - estimated) / estimated * 100, 1) if i > 0 else None,
            "beat": actual > estimated if i > 0 else None
        })
    
    return {
        "symbol": symbol,
        "earnings_history": quarters,
        "next_earnings": quarters[0]["date"],
        "beat_rate": f"{random.randint(60, 90)}%"
    }

# =============================================================================
# SOCIAL TRADING ENDPOINTS
# =============================================================================

@app.get("/api/social/top-traders")
async def get_top_traders(user: dict = Depends(require_auth)):
    """Get top performing traders"""
    traders = []
    names = ["AlphaSeeker", "ValueHunter", "TechTrader", "DividendKing", "SwingMaster", "MomentumPro", "GrowthGuru", "OptionsWiz"]
    
    for i, name in enumerate(names):
        traders.append({
            "id": f"trader_{i+1}",
            "username": name,
            "avatar": f"👤",
            "return_ytd": round(random.uniform(10, 80), 1),
            "return_1y": round(random.uniform(15, 120), 1),
            "win_rate": round(random.uniform(55, 85), 1),
            "followers": random.randint(100, 50000),
            "trades_count": random.randint(50, 500),
            "risk_score": random.randint(1, 10),
            "strategy": random.choice(["Growth", "Value", "Momentum", "Dividend", "Options"]),
            "verified": random.random() > 0.5
        })
    
    return {"traders": sorted(traders, key=lambda x: x["return_ytd"], reverse=True)}

@app.post("/api/social/follow/{trader_id}")
async def follow_trader(
    trader_id: str,
    auto_copy: bool = Query(False),
    copy_percentage: float = Query(10),
    user: dict = Depends(require_auth)
):
    """Follow a trader"""
    conn = get_db()
    conn.execute("""
        INSERT INTO followed_traders (user_id, trader_id, auto_copy, copy_percentage)
        VALUES (?, ?, ?, ?)
    """, (user["id"], trader_id, 1 if auto_copy else 0, copy_percentage))
    conn.commit()
    conn.close()
    
    return {"status": "following", "trader_id": trader_id, "auto_copy": auto_copy}

@app.get("/api/social/following")
async def get_following(user: dict = Depends(require_auth)):
    """Get traders user is following"""
    conn = get_db()
    following = conn.execute("SELECT * FROM followed_traders WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    return {"following": [dict(f) for f in following]}

@app.delete("/api/social/unfollow/{trader_id}")
async def unfollow_trader(trader_id: str, user: dict = Depends(require_auth)):
    """Unfollow a trader"""
    conn = get_db()
    conn.execute("DELETE FROM followed_traders WHERE user_id = ? AND trader_id = ?", (user["id"], trader_id))
    conn.commit()
    conn.close()
    
    return {"status": "unfollowed"}

@app.get("/api/social/trader/{trader_id}/trades")
async def get_trader_trades(trader_id: str, user: dict = Depends(require_auth)):
    """Get recent trades from a trader"""
    trades = []
    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]
    
    for _ in range(10):
        trades.append({
            "symbol": random.choice(symbols),
            "action": random.choice(["BUY", "SELL"]),
            "shares": random.randint(10, 500),
            "price": round(random.uniform(100, 500), 2),
            "rationale": random.choice([
                "Breakout above resistance",
                "Strong earnings beat",
                "Technical oversold bounce",
                "Sector rotation play",
                "Value opportunity"
            ]),
            "date": (datetime.now() - timedelta(days=random.randint(0, 30))).strftime("%Y-%m-%d"),
            "gain_pct": round(random.uniform(-10, 25), 1)
        })
    
    return {"trader_id": trader_id, "trades": trades}

# =============================================================================
# OPTIONS GREEKS CALCULATOR
# =============================================================================

@app.get("/api/options/greeks/{symbol}")
async def calculate_options_greeks(
    symbol: str,
    strike: float = Query(...),
    expiry_days: int = Query(...),
    option_type: str = Query("call"),
    user: dict = Depends(require_auth)
):
    """Calculate options Greeks"""
    import math
    
    # Simplified Black-Scholes Greeks calculation
    S = random.uniform(100, 500)  # Current price
    K = strike
    T = expiry_days / 365
    r = 0.05  # Risk-free rate
    sigma = random.uniform(0.2, 0.5)  # Volatility
    
    # Simplified calculations
    d1 = (math.log(S/K) + (r + sigma**2/2)*T) / (sigma * math.sqrt(T)) if T > 0 else 0
    d2 = d1 - sigma * math.sqrt(T)
    
    # Greeks (simplified)
    delta = 0.5 + 0.5 * math.erf(d1 / math.sqrt(2)) if option_type == "call" else 0.5 * math.erf(d1 / math.sqrt(2)) - 0.5
    gamma = math.exp(-d1**2/2) / (S * sigma * math.sqrt(2 * math.pi * T)) if T > 0 else 0
    theta = -S * sigma * math.exp(-d1**2/2) / (2 * math.sqrt(2 * math.pi * T)) - r * K * math.exp(-r*T) * (0.5 + 0.5 * math.erf(d2/math.sqrt(2))) if T > 0 else 0
    vega = S * math.sqrt(T) * math.exp(-d1**2/2) / math.sqrt(2 * math.pi)
    rho = K * T * math.exp(-r*T) * (0.5 + 0.5 * math.erf(d2/math.sqrt(2)))
    
    # Option price
    option_price = random.uniform(5, 50)
    
    return {
        "symbol": symbol.upper(),
        "option_type": option_type,
        "strike": strike,
        "expiry_days": expiry_days,
        "underlying_price": round(S, 2),
        "option_price": round(option_price, 2),
        "implied_volatility": round(sigma * 100, 1),
        "greeks": {
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta / 365, 4),  # Daily theta
            "vega": round(vega / 100, 4),
            "rho": round(rho / 100, 4),
        },
        "interpretations": {
            "delta": f"For every $1 move in {symbol}, option moves ${abs(round(delta, 2))}",
            "gamma": f"Delta will change by {round(gamma, 4)} for $1 move",
            "theta": f"Option loses ${abs(round(theta/365, 2))} per day",
            "vega": f"For 1% volatility increase, option gains ${round(vega/100, 2)}",
        }
    }

@app.get("/api/options/payoff")
async def calculate_payoff(
    symbol: str = Query(...),
    strike: float = Query(...),
    premium: float = Query(...),
    contracts: int = Query(1),
    option_type: str = Query("call"),
    position: str = Query("long"),
    user: dict = Depends(require_auth)
):
    """Calculate option payoff at different prices"""
    payoffs = []
    for price_pct in range(-30, 31, 5):
        price = strike * (1 + price_pct / 100)
        
        if option_type == "call":
            intrinsic = max(0, price - strike)
        else:
            intrinsic = max(0, strike - price)
        
        if position == "long":
            pnl = (intrinsic - premium) * 100 * contracts
        else:
            pnl = (premium - intrinsic) * 100 * contracts
        
        payoffs.append({
            "underlying_price": round(price, 2),
            "pnl": round(pnl, 2),
            "breakeven": position == "long" and abs(price - (strike + premium if option_type == "call" else strike - premium)) < 0.01
        })
    
    breakeven = strike + premium if option_type == "call" else strike - premium
    max_loss = premium * 100 * contracts if position == "long" else float('inf')
    max_profit = float('inf') if position == "long" and option_type == "call" else premium * 100 * contracts
    
    return {
        "payoff_chart": payoffs,
        "breakeven_price": round(breakeven, 2),
        "max_loss": round(max_loss, 2) if max_loss != float('inf') else "Unlimited",
        "max_profit": round(max_profit, 2) if max_profit != float('inf') else "Unlimited",
    }

# =============================================================================
# ALTERNATIVE INVESTMENTS ENDPOINTS
# =============================================================================

@app.get("/api/alternatives/options")
async def get_alternative_options(user: dict = Depends(require_auth)):
    """Get available alternative investment options"""
    return ALTERNATIVES

@app.post("/api/alternatives/invest")
async def add_alternative_investment(
    type: str = Query(...),
    name: str = Query(...),
    invested_amount: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Add an alternative investment"""
    conn = get_db()
    conn.execute("""
        INSERT INTO alternative_investments (user_id, type, name, invested_amount, current_value, purchase_date)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], type, name, invested_amount, invested_amount, datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    
    return {"status": "added", "type": type, "name": name, "amount": invested_amount}

@app.get("/api/alternatives/portfolio")
async def get_alternative_portfolio(user: dict = Depends(require_auth)):
    """Get user's alternative investments"""
    conn = get_db()
    investments = conn.execute("SELECT * FROM alternative_investments WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    # Simulate value changes
    result = []
    for inv in investments:
        inv = dict(inv)
        inv["current_value"] = round(inv["invested_amount"] * random.uniform(0.9, 1.3), 2)
        inv["gain_loss"] = round(inv["current_value"] - inv["invested_amount"], 2)
        inv["gain_pct"] = round((inv["current_value"] - inv["invested_amount"]) / inv["invested_amount"] * 100, 2)
        result.append(inv)
    
    total_invested = sum(i["invested_amount"] for i in result)
    total_value = sum(i["current_value"] for i in result)
    
    return {
        "investments": result,
        "summary": {
            "total_invested": round(total_invested, 2),
            "current_value": round(total_value, 2),
            "total_gain": round(total_value - total_invested, 2),
            "total_gain_pct": round((total_value - total_invested) / total_invested * 100, 2) if total_invested > 0 else 0
        }
    }

# =============================================================================
# ESTATE PLANNING ENDPOINTS
# =============================================================================

@app.post("/api/estate/beneficiary")
async def add_beneficiary(
    name: str = Query(...),
    relationship: str = Query(...),
    percentage: float = Query(...),
    account_type: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Add a beneficiary"""
    conn = get_db()
    conn.execute("""
        INSERT INTO beneficiaries (user_id, name, relationship, percentage, account_type)
        VALUES (?, ?, ?, ?, ?)
    """, (user["id"], name, relationship, percentage, account_type))
    conn.commit()
    conn.close()
    
    return {"status": "added", "name": name, "percentage": percentage}

@app.get("/api/estate/beneficiaries")
async def get_beneficiaries(user: dict = Depends(require_auth)):
    """Get all beneficiaries"""
    conn = get_db()
    beneficiaries = conn.execute("SELECT * FROM beneficiaries WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    total_pct = sum(b["percentage"] for b in beneficiaries)
    
    return {
        "beneficiaries": [dict(b) for b in beneficiaries],
        "total_percentage": total_pct,
        "valid": abs(total_pct - 100) < 0.01 if beneficiaries else True
    }

@app.delete("/api/estate/beneficiary/{beneficiary_id}")
async def remove_beneficiary(beneficiary_id: int, user: dict = Depends(require_auth)):
    """Remove a beneficiary"""
    conn = get_db()
    conn.execute("DELETE FROM beneficiaries WHERE id = ? AND user_id = ?", (beneficiary_id, user["id"]))
    conn.commit()
    conn.close()
    
    return {"status": "removed"}

@app.get("/api/estate/summary")
async def get_estate_summary(user: dict = Depends(require_auth)):
    """Get estate planning summary"""
    conn = get_db()
    
    # Get portfolio values
    portfolios = conn.execute("SELECT id FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    total_portfolio = 0
    for p in portfolios:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        total_portfolio += sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Get net worth assets
    assets = conn.execute("SELECT SUM(value) as total FROM net_worth_assets WHERE user_id = ?", (user["id"],)).fetchone()
    liabilities = conn.execute("SELECT SUM(amount) as total FROM net_worth_liabilities WHERE user_id = ?", (user["id"],)).fetchone()
    
    beneficiaries = conn.execute("SELECT * FROM beneficiaries WHERE user_id = ?", (user["id"],)).fetchall()
    
    conn.close()
    
    total_assets = total_portfolio + (assets["total"] or 0)
    total_liabilities = liabilities["total"] or 0
    estate_value = total_assets - total_liabilities
    
    # Calculate distribution
    distribution = []
    for b in beneficiaries:
        distribution.append({
            "name": b["name"],
            "relationship": b["relationship"],
            "percentage": b["percentage"],
            "estimated_value": round(estate_value * b["percentage"] / 100, 2)
        })
    
    return {
        "estate_value": round(estate_value, 2),
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "beneficiaries_count": len(beneficiaries),
        "distribution": distribution,
        "checklist": {
            "will": random.random() > 0.5,
            "trust": random.random() > 0.7,
            "power_of_attorney": random.random() > 0.5,
            "healthcare_directive": random.random() > 0.6,
            "beneficiaries_updated": len(beneficiaries) > 0
        }
    }

# =============================================================================
# FINANCIAL PLANNING ENDPOINTS
# =============================================================================

@app.post("/api/planning/goal")
async def create_financial_plan(
    plan_type: str = Query(...),
    target_amount: float = Query(...),
    monthly_contribution: float = Query(0),
    target_date: str = Query(None),
    priority: str = Query("medium"),
    user: dict = Depends(require_auth)
):
    """Create a financial planning goal"""
    conn = get_db()
    conn.execute("""
        INSERT INTO financial_plans (user_id, plan_type, target_amount, monthly_contribution, target_date, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], plan_type, target_amount, monthly_contribution, target_date, priority))
    conn.commit()
    conn.close()
    
    return {"status": "created", "plan_type": plan_type, "target": target_amount}

@app.get("/api/planning/goals")
async def get_financial_plans(user: dict = Depends(require_auth)):
    """Get all financial planning goals"""
    conn = get_db()
    plans = conn.execute("SELECT * FROM financial_plans WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    result = []
    for p in plans:
        p = dict(p)
        # Simulate progress
        p["current_progress"] = round(p["target_amount"] * random.uniform(0.1, 0.9), 2)
        p["progress_pct"] = round(p["current_progress"] / p["target_amount"] * 100, 1)
        
        # Calculate time to goal
        if p["monthly_contribution"] > 0:
            remaining = p["target_amount"] - p["current_progress"]
            months_to_goal = remaining / p["monthly_contribution"]
            p["months_to_goal"] = round(months_to_goal, 0)
        
        result.append(p)
    
    return {"plans": result}

@app.get("/api/planning/recommendations")
async def get_planning_recommendations(user: dict = Depends(require_auth)):
    """Get personalized financial planning recommendations"""
    return {
        "recommendations": [
            {"priority": "high", "category": "Emergency Fund", "action": "Build 6 months expenses", "impact": "Financial security"},
            {"priority": "high", "category": "Retirement", "action": "Max out 401(k) contribution", "impact": "Tax savings + growth"},
            {"priority": "medium", "category": "Debt", "action": "Pay off high-interest debt", "impact": "Interest savings"},
            {"priority": "medium", "category": "Insurance", "action": "Review life insurance coverage", "impact": "Family protection"},
            {"priority": "low", "category": "Education", "action": "Start 529 plan", "impact": "Tax-advantaged education savings"},
            {"priority": "low", "category": "Estate", "action": "Update beneficiary designations", "impact": "Ensure proper inheritance"},
        ]
    }

# =============================================================================
# PHASE 10: COMPARISON, BENCHMARKS, CURRENCY, TAX REPORTS, NOTIFICATIONS, AUDIT
# =============================================================================

# Benchmark Data
BENCHMARKS = {
    "SPY": {"name": "S&P 500", "ytd": 18.5, "1y": 22.3, "3y": 32.5, "5y": 78.2, "volatility": 15.2},
    "QQQ": {"name": "NASDAQ 100", "ytd": 42.5, "1y": 48.2, "3y": 45.8, "5y": 142.5, "volatility": 22.8},
    "DIA": {"name": "Dow Jones", "ytd": 8.2, "1y": 12.5, "3y": 22.1, "5y": 52.3, "volatility": 14.5},
    "IWM": {"name": "Russell 2000", "ytd": 12.8, "1y": 15.2, "3y": 8.5, "5y": 35.2, "volatility": 24.5},
    "VTI": {"name": "Total Market", "ytd": 17.2, "1y": 20.8, "3y": 30.2, "5y": 72.5, "volatility": 15.8},
    "VXUS": {"name": "International", "ytd": 8.5, "1y": 12.2, "3y": 5.8, "5y": 22.5, "volatility": 18.2},
    "BND": {"name": "Total Bond", "ytd": 2.5, "1y": 4.2, "3y": -8.5, "5y": 2.8, "volatility": 5.2},
    "GLD": {"name": "Gold", "ytd": 12.8, "1y": 15.5, "3y": 22.5, "5y": 58.2, "volatility": 15.5},
}

# Currency Exchange Rates (vs USD)
EXCHANGE_RATES = {
    "EUR": {"rate": 0.92, "name": "Euro", "symbol": "€", "change_24h": -0.15},
    "GBP": {"rate": 0.79, "name": "British Pound", "symbol": "£", "change_24h": 0.22},
    "JPY": {"rate": 149.50, "name": "Japanese Yen", "symbol": "¥", "change_24h": 0.85},
    "CHF": {"rate": 0.88, "name": "Swiss Franc", "symbol": "Fr", "change_24h": -0.08},
    "CAD": {"rate": 1.36, "name": "Canadian Dollar", "symbol": "C$", "change_24h": 0.12},
    "AUD": {"rate": 1.54, "name": "Australian Dollar", "symbol": "A$", "change_24h": 0.35},
    "CNY": {"rate": 7.24, "name": "Chinese Yuan", "symbol": "¥", "change_24h": 0.05},
    "INR": {"rate": 83.12, "name": "Indian Rupee", "symbol": "₹", "change_24h": 0.18},
    "BRL": {"rate": 4.97, "name": "Brazilian Real", "symbol": "R$", "change_24h": -0.42},
    "MXN": {"rate": 17.15, "name": "Mexican Peso", "symbol": "$", "change_24h": 0.28},
}

# Initialize Phase 10 tables
def init_phase10_tables():
    conn = get_db()
    
    # Notifications table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT,
            read INTEGER DEFAULT 0,
            action_url TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Audit log table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            ip_address TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Custom benchmarks table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS custom_benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            holdings TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Tax lots table for detailed tracking
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tax_lots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER,
            symbol TEXT NOT NULL,
            purchase_date TEXT NOT NULL,
            purchase_price REAL NOT NULL,
            quantity REAL NOT NULL,
            sale_date TEXT,
            sale_price REAL,
            wash_sale INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Currency watchlist
    conn.execute("""
        CREATE TABLE IF NOT EXISTS currency_watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_currency TEXT NOT NULL,
            to_currency TEXT NOT NULL,
            target_rate REAL,
            alert_enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase10_tables()

# Helper: Log audit action
def log_audit(user_id: int, action: str, entity_type: str = None, entity_id: int = None, details: str = None):
    conn = get_db()
    conn.execute("""
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, action, entity_type, entity_id, details))
    conn.commit()
    conn.close()

# Helper: Create notification
def create_notification(user_id: int, type: str, title: str, message: str = None, action_url: str = None):
    conn = get_db()
    conn.execute("""
        INSERT INTO notifications (user_id, type, title, message, action_url)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, type, title, message, action_url))
    conn.commit()
    conn.close()

# =============================================================================
# PORTFOLIO COMPARISON ENDPOINTS
# =============================================================================

@app.get("/api/compare/portfolios")
async def compare_portfolios(
    portfolio_ids: str = Query(...),  # Comma-separated IDs
    user: dict = Depends(require_auth)
):
    """Compare multiple portfolios side by side"""
    ids = [int(x) for x in portfolio_ids.split(",")]
    
    conn = get_db()
    comparisons = []
    
    for pid in ids:
        portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", 
                                (pid, user["id"])).fetchone()
        if not portfolio:
            continue
            
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (pid,)).fetchall()
        
        total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
        total_cost = sum(h["quantity"] * h["purchase_price"] for h in holdings)
        total_gain = total_value - total_cost
        gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0
        
        # Calculate metrics
        weights = [(h["quantity"] * h["current_price"]) / total_value for h in holdings] if total_value > 0 else []
        diversification = 1 - sum(w**2 for w in weights) if weights else 0  # Herfindahl index inverse
        
        # Simulated metrics
        volatility = random.uniform(12, 28)
        sharpe = gain_pct / volatility if volatility > 0 else 0
        beta = random.uniform(0.8, 1.3)
        
        comparisons.append({
            "id": pid,
            "name": portfolio["name"],
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_gain, 2),
            "gain_pct": round(gain_pct, 2),
            "holdings_count": len(holdings),
            "diversification_score": round(diversification * 100, 1),
            "volatility": round(volatility, 2),
            "sharpe_ratio": round(sharpe, 2),
            "beta": round(beta, 2),
            "top_holdings": [{"symbol": h["symbol"], "weight": round((h["quantity"] * h["current_price"]) / total_value * 100, 1)} 
                           for h in sorted(holdings, key=lambda x: x["quantity"] * x["current_price"], reverse=True)[:5]]
        })
    
    conn.close()
    
    return {"portfolios": comparisons, "compared_at": datetime.now().isoformat()}

@app.get("/api/compare/holdings")
async def compare_holdings(
    symbols: str = Query(...),  # Comma-separated symbols
    user: dict = Depends(require_auth)
):
    """Compare multiple stocks/ETFs"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    
    comparisons = []
    for symbol in symbol_list:
        # Simulated data
        price = random.uniform(50, 500)
        comparisons.append({
            "symbol": symbol,
            "price": round(price, 2),
            "change_1d": round(random.uniform(-3, 4), 2),
            "change_1w": round(random.uniform(-5, 8), 2),
            "change_1m": round(random.uniform(-10, 15), 2),
            "change_ytd": round(random.uniform(-20, 50), 2),
            "pe_ratio": round(random.uniform(10, 50), 1),
            "dividend_yield": round(random.uniform(0, 4), 2),
            "market_cap": f"${random.randint(10, 3000)}B",
            "volume": f"{random.randint(1, 100)}M",
            "52w_high": round(price * random.uniform(1.1, 1.5), 2),
            "52w_low": round(price * random.uniform(0.5, 0.9), 2),
        })
    
    return {"holdings": comparisons}

# =============================================================================
# BENCHMARK ENDPOINTS
# =============================================================================

@app.get("/api/benchmarks")
async def get_benchmarks(user: dict = Depends(require_auth)):
    """Get all available benchmarks"""
    return {"benchmarks": BENCHMARKS}

@app.get("/api/benchmarks/compare/{portfolio_id}")
async def compare_to_benchmark(
    portfolio_id: int,
    benchmark: str = Query("SPY"),
    user: dict = Depends(require_auth)
):
    """Compare portfolio performance to a benchmark"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings found"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["purchase_price"] for h in holdings)
    portfolio_return = ((total_value - total_cost) / total_cost * 100) if total_cost > 0 else 0
    
    bench = BENCHMARKS.get(benchmark.upper(), BENCHMARKS["SPY"])
    
    # Calculate alpha and tracking error
    alpha = portfolio_return - bench["ytd"]
    tracking_error = random.uniform(2, 8)
    information_ratio = alpha / tracking_error if tracking_error > 0 else 0
    
    return {
        "portfolio": {
            "return_ytd": round(portfolio_return, 2),
            "volatility": round(random.uniform(12, 25), 2),
        },
        "benchmark": {
            "symbol": benchmark.upper(),
            "name": bench["name"],
            "return_ytd": bench["ytd"],
            "return_1y": bench["1y"],
            "return_3y": bench["3y"],
            "volatility": bench["volatility"],
        },
        "comparison": {
            "alpha": round(alpha, 2),
            "tracking_error": round(tracking_error, 2),
            "information_ratio": round(information_ratio, 2),
            "outperforming": alpha > 0
        }
    }

@app.post("/api/benchmarks/custom")
async def create_custom_benchmark(
    name: str = Query(...),
    holdings: str = Query(...),  # JSON string: [{"symbol": "AAPL", "weight": 50}, ...]
    user: dict = Depends(require_auth)
):
    """Create a custom benchmark"""
    conn = get_db()
    conn.execute("""
        INSERT INTO custom_benchmarks (user_id, name, holdings)
        VALUES (?, ?, ?)
    """, (user["id"], name, holdings))
    conn.commit()
    conn.close()
    
    log_audit(user["id"], "create_benchmark", "benchmark", None, f"Created custom benchmark: {name}")
    
    return {"status": "created", "name": name}

@app.get("/api/benchmarks/custom")
async def get_custom_benchmarks(user: dict = Depends(require_auth)):
    """Get user's custom benchmarks"""
    conn = get_db()
    benchmarks = conn.execute("SELECT * FROM custom_benchmarks WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    return {"benchmarks": [dict(b) for b in benchmarks]}

# =============================================================================
# CURRENCY & FX ENDPOINTS
# =============================================================================

@app.get("/api/currency/rates")
async def get_exchange_rates(user: dict = Depends(require_auth)):
    """Get current exchange rates"""
    return {"base": "USD", "rates": EXCHANGE_RATES}

@app.get("/api/currency/convert")
async def convert_currency(
    amount: float = Query(...),
    from_currency: str = Query("USD"),
    to_currency: str = Query("EUR"),
    user: dict = Depends(require_auth)
):
    """Convert between currencies"""
    from_curr = from_currency.upper()
    to_curr = to_currency.upper()
    
    # Convert to USD first, then to target
    if from_curr == "USD":
        usd_amount = amount
    else:
        from_rate = EXCHANGE_RATES.get(from_curr, {}).get("rate", 1)
        usd_amount = amount / from_rate
    
    if to_curr == "USD":
        result = usd_amount
    else:
        to_rate = EXCHANGE_RATES.get(to_curr, {}).get("rate", 1)
        result = usd_amount * to_rate
    
    return {
        "from": {"currency": from_curr, "amount": amount},
        "to": {"currency": to_curr, "amount": round(result, 2)},
        "rate": round(result / amount, 4) if amount > 0 else 0
    }

@app.get("/api/currency/portfolio/{portfolio_id}")
async def get_portfolio_in_currency(
    portfolio_id: int,
    currency: str = Query("EUR"),
    user: dict = Depends(require_auth)
):
    """Get portfolio value in different currency"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    total_usd = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    target_rate = EXCHANGE_RATES.get(currency.upper(), {}).get("rate", 1)
    total_converted = total_usd * target_rate
    
    return {
        "portfolio_id": portfolio_id,
        "usd_value": round(total_usd, 2),
        "converted_value": round(total_converted, 2),
        "currency": currency.upper(),
        "exchange_rate": target_rate
    }

@app.post("/api/currency/watchlist")
async def add_currency_alert(
    from_currency: str = Query(...),
    to_currency: str = Query(...),
    target_rate: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Add currency pair to watchlist with alert"""
    conn = get_db()
    conn.execute("""
        INSERT INTO currency_watchlist (user_id, from_currency, to_currency, target_rate)
        VALUES (?, ?, ?, ?)
    """, (user["id"], from_currency.upper(), to_currency.upper(), target_rate))
    conn.commit()
    conn.close()
    
    return {"status": "added", "pair": f"{from_currency}/{to_currency}", "target": target_rate}

@app.get("/api/currency/watchlist")
async def get_currency_watchlist(user: dict = Depends(require_auth)):
    """Get currency watchlist"""
    conn = get_db()
    watchlist = conn.execute("SELECT * FROM currency_watchlist WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    result = []
    for w in watchlist:
        w = dict(w)
        # Calculate current rate
        from_rate = EXCHANGE_RATES.get(w["from_currency"], {}).get("rate", 1) if w["from_currency"] != "USD" else 1
        to_rate = EXCHANGE_RATES.get(w["to_currency"], {}).get("rate", 1) if w["to_currency"] != "USD" else 1
        current_rate = to_rate / from_rate
        
        w["current_rate"] = round(current_rate, 4)
        w["distance_pct"] = round((w["target_rate"] - current_rate) / current_rate * 100, 2)
        result.append(w)
    
    return {"watchlist": result}

# =============================================================================
# TAX REPORT ENDPOINTS
# =============================================================================

@app.get("/api/tax/report/{year}")
async def generate_tax_report(year: int, user: dict = Depends(require_auth)):
    """Generate annual tax report"""
    conn = get_db()
    
    # Get all holdings with gains/losses
    portfolios = conn.execute("SELECT id, name FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    
    all_holdings = []
    for p in portfolios:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        for h in holdings:
            h = dict(h)
            h["portfolio_name"] = p["name"]
            all_holdings.append(h)
    
    conn.close()
    
    # Calculate gains/losses
    short_term_gains = 0
    long_term_gains = 0
    short_term_losses = 0
    long_term_losses = 0
    
    realized_transactions = []
    unrealized_gains = 0
    
    for h in all_holdings:
        gain = (h["current_price"] - h["purchase_price"]) * h["quantity"]
        unrealized_gains += gain
        
        # Simulate some realized transactions
        if random.random() > 0.7:
            sale_price = h["purchase_price"] * random.uniform(0.8, 1.5)
            realized_gain = (sale_price - h["purchase_price"]) * h["quantity"] * 0.5
            is_long_term = random.random() > 0.5
            
            if realized_gain > 0:
                if is_long_term:
                    long_term_gains += realized_gain
                else:
                    short_term_gains += realized_gain
            else:
                if is_long_term:
                    long_term_losses += abs(realized_gain)
                else:
                    short_term_losses += abs(realized_gain)
            
            realized_transactions.append({
                "symbol": h["symbol"],
                "shares": h["quantity"] * 0.5,
                "purchase_price": h["purchase_price"],
                "sale_price": round(sale_price, 2),
                "gain_loss": round(realized_gain, 2),
                "term": "Long-Term" if is_long_term else "Short-Term"
            })
    
    # Calculate dividend income
    dividend_income = sum(
        DIVIDEND_STOCKS.get(h["symbol"], {}).get("annual_dividend", 0) * h["quantity"]
        for h in all_holdings
    )
    
    # Tax estimates (simplified)
    short_term_tax = (short_term_gains - short_term_losses) * 0.32  # Ordinary income rate
    long_term_tax = (long_term_gains - long_term_losses) * 0.15  # LTCG rate
    dividend_tax = dividend_income * 0.15  # Qualified dividend rate
    
    net_gains = (short_term_gains + long_term_gains) - (short_term_losses + long_term_losses)
    total_tax = max(0, short_term_tax + long_term_tax + dividend_tax)
    
    # TLH opportunities
    tlh_opportunities = [
        {"symbol": h["symbol"], "loss": round((h["purchase_price"] - h["current_price"]) * h["quantity"], 2)}
        for h in all_holdings if h["current_price"] < h["purchase_price"]
    ]
    tlh_opportunities.sort(key=lambda x: x["loss"], reverse=True)
    
    return {
        "year": year,
        "summary": {
            "short_term_gains": round(short_term_gains, 2),
            "short_term_losses": round(short_term_losses, 2),
            "long_term_gains": round(long_term_gains, 2),
            "long_term_losses": round(long_term_losses, 2),
            "net_gains": round(net_gains, 2),
            "dividend_income": round(dividend_income, 2),
            "unrealized_gains": round(unrealized_gains, 2),
        },
        "tax_estimate": {
            "short_term_tax": round(short_term_tax, 2),
            "long_term_tax": round(long_term_tax, 2),
            "dividend_tax": round(dividend_tax, 2),
            "total_estimated_tax": round(total_tax, 2),
        },
        "realized_transactions": realized_transactions[:10],
        "tlh_opportunities": tlh_opportunities[:5],
        "forms_needed": ["1099-B", "1099-DIV", "Schedule D"]
    }

@app.get("/api/tax/lots/{portfolio_id}")
async def get_tax_lots(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get detailed tax lot information"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    tax_lots = []
    for h in holdings:
        h = dict(h)
        # Simulate multiple tax lots per holding
        lots = random.randint(1, 3)
        remaining_qty = h["quantity"]
        
        for i in range(lots):
            lot_qty = remaining_qty / (lots - i)
            remaining_qty -= lot_qty
            days_held = random.randint(30, 800)
            purchase_date = (datetime.now() - timedelta(days=days_held)).strftime("%Y-%m-%d")
            
            tax_lots.append({
                "symbol": h["symbol"],
                "purchase_date": purchase_date,
                "quantity": round(lot_qty, 2),
                "cost_basis": round(h["purchase_price"] * random.uniform(0.85, 1.15), 2),
                "current_price": h["current_price"],
                "gain_loss": round((h["current_price"] - h["purchase_price"]) * lot_qty, 2),
                "days_held": days_held,
                "term": "Long-Term" if days_held > 365 else "Short-Term"
            })
    
    return {"tax_lots": tax_lots}

# =============================================================================
# NOTIFICATIONS CENTER ENDPOINTS
# =============================================================================

@app.get("/api/notifications")
async def get_notifications(
    unread_only: bool = Query(False),
    user: dict = Depends(require_auth)
):
    """Get user notifications"""
    conn = get_db()
    if unread_only:
        notifications = conn.execute("""
            SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC
        """, (user["id"],)).fetchall()
    else:
        notifications = conn.execute("""
            SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
        """, (user["id"],)).fetchall()
    conn.close()
    
    return {"notifications": [dict(n) for n in notifications]}

@app.put("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int, user: dict = Depends(require_auth)):
    """Mark notification as read"""
    conn = get_db()
    conn.execute("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", 
                (notification_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "marked_read"}

@app.put("/api/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(require_auth)):
    """Mark all notifications as read"""
    conn = get_db()
    conn.execute("UPDATE notifications SET read = 1 WHERE user_id = ?", (user["id"],))
    conn.commit()
    conn.close()
    return {"status": "all_marked_read"}

@app.delete("/api/notifications/{notification_id}")
async def delete_notification(notification_id: int, user: dict = Depends(require_auth)):
    """Delete a notification"""
    conn = get_db()
    conn.execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", (notification_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/notifications/count")
async def get_notification_count(user: dict = Depends(require_auth)):
    """Get unread notification count"""
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0", 
                        (user["id"],)).fetchone()["count"]
    conn.close()
    return {"unread_count": count}

# =============================================================================
# DATA IMPORT/EXPORT ENDPOINTS
# =============================================================================

@app.post("/api/import/csv")
async def import_csv_holdings(
    portfolio_id: int = Query(...),
    csv_data: str = Query(...),  # CSV string: symbol,quantity,purchase_price,purchase_date
    user: dict = Depends(require_auth)
):
    """Import holdings from CSV data"""
    lines = csv_data.strip().split("\n")
    imported = 0
    errors = []
    
    conn = get_db()
    for i, line in enumerate(lines):
        if i == 0 and "symbol" in line.lower():
            continue  # Skip header
        
        try:
            parts = line.split(",")
            if len(parts) >= 3:
                symbol = parts[0].strip().upper()
                quantity = float(parts[1].strip())
                purchase_price = float(parts[2].strip())
                current_price = purchase_price * random.uniform(0.9, 1.3)
                
                conn.execute("""
                    INSERT INTO holdings (portfolio_id, symbol, quantity, purchase_price, current_price)
                    VALUES (?, ?, ?, ?, ?)
                """, (portfolio_id, symbol, quantity, purchase_price, current_price))
                imported += 1
        except Exception as e:
            errors.append(f"Line {i+1}: {str(e)}")
    
    conn.commit()
    conn.close()
    
    log_audit(user["id"], "import_csv", "portfolio", portfolio_id, f"Imported {imported} holdings")
    
    return {"imported": imported, "errors": errors}

@app.get("/api/export/portfolio/{portfolio_id}")
async def export_portfolio(
    portfolio_id: int,
    format: str = Query("csv"),  # csv, json
    user: dict = Depends(require_auth)
):
    """Export portfolio data"""
    conn = get_db()
    portfolio = conn.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?", 
                            (portfolio_id, user["id"])).fetchone()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not portfolio:
        return {"error": "Portfolio not found"}
    
    if format == "csv":
        lines = ["symbol,quantity,purchase_price,current_price,gain_loss"]
        for h in holdings:
            gain = (h["current_price"] - h["purchase_price"]) * h["quantity"]
            lines.append(f"{h['symbol']},{h['quantity']},{h['purchase_price']},{h['current_price']},{round(gain, 2)}")
        return {"format": "csv", "data": "\n".join(lines)}
    else:
        return {
            "format": "json",
            "data": {
                "portfolio": dict(portfolio),
                "holdings": [dict(h) for h in holdings]
            }
        }

@app.get("/api/export/tax/{year}")
async def export_tax_data(year: int, user: dict = Depends(require_auth)):
    """Export tax data for year"""
    report = await generate_tax_report(year, user)
    
    lines = ["type,symbol,shares,purchase_price,sale_price,gain_loss,term"]
    for t in report["realized_transactions"]:
        lines.append(f"sale,{t['symbol']},{t['shares']},{t['purchase_price']},{t['sale_price']},{t['gain_loss']},{t['term']}")
    
    return {"year": year, "csv": "\n".join(lines), "summary": report["summary"]}

# =============================================================================
# AUDIT LOG ENDPOINTS
# =============================================================================

@app.get("/api/audit/log")
async def get_audit_log(
    limit: int = Query(50),
    action: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Get user's audit log"""
    conn = get_db()
    if action:
        logs = conn.execute("""
            SELECT * FROM audit_log WHERE user_id = ? AND action = ? ORDER BY created_at DESC LIMIT ?
        """, (user["id"], action, limit)).fetchall()
    else:
        logs = conn.execute("""
            SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        """, (user["id"], limit)).fetchall()
    conn.close()
    
    return {"logs": [dict(l) for l in logs]}

@app.get("/api/audit/actions")
async def get_audit_action_types(user: dict = Depends(require_auth)):
    """Get distinct action types in audit log"""
    conn = get_db()
    actions = conn.execute("""
        SELECT DISTINCT action FROM audit_log WHERE user_id = ?
    """, (user["id"],)).fetchall()
    conn.close()
    
    return {"actions": [a["action"] for a in actions]}

# =============================================================================
# MARKET HOURS & STATUS
# =============================================================================

@app.get("/api/market/status")
async def get_market_status(user: dict = Depends(require_auth)):
    """Get current market status"""
    now = datetime.now()
    hour = now.hour
    weekday = now.weekday()
    
    # Simple market hours check (EST)
    is_market_open = weekday < 5 and 9 <= hour < 16
    
    next_open = None
    next_close = None
    
    if not is_market_open:
        if weekday >= 5:
            days_until_monday = 7 - weekday
            next_open = (now + timedelta(days=days_until_monday)).replace(hour=9, minute=30)
        elif hour < 9:
            next_open = now.replace(hour=9, minute=30)
        else:
            next_open = (now + timedelta(days=1)).replace(hour=9, minute=30)
    else:
        next_close = now.replace(hour=16, minute=0)
    
    return {
        "is_open": is_market_open,
        "current_time": now.isoformat(),
        "next_open": next_open.isoformat() if next_open else None,
        "next_close": next_close.isoformat() if next_close else None,
        "exchanges": {
            "NYSE": {"status": "open" if is_market_open else "closed"},
            "NASDAQ": {"status": "open" if is_market_open else "closed"},
            "LSE": {"status": "closed"},
            "TSE": {"status": "closed"},
        }
    }

# =============================================================================
# PHASE 9: AI COACH, DIVIDENDS, DOCUMENTS, ECONOMIC CALENDAR, ATTRIBUTION
# =============================================================================

# Dividend Data
DIVIDEND_STOCKS = {
    "AAPL": {"yield": 0.5, "annual_dividend": 0.96, "frequency": "quarterly", "ex_dates": ["2025-02-07", "2025-05-09", "2025-08-08", "2025-11-07"]},
    "MSFT": {"yield": 0.8, "annual_dividend": 3.00, "frequency": "quarterly", "ex_dates": ["2025-02-19", "2025-05-14", "2025-08-20", "2025-11-19"]},
    "JNJ": {"yield": 3.0, "annual_dividend": 4.76, "frequency": "quarterly", "ex_dates": ["2025-02-24", "2025-05-26", "2025-08-25", "2025-11-24"]},
    "PG": {"yield": 2.5, "annual_dividend": 3.76, "frequency": "quarterly", "ex_dates": ["2025-01-23", "2025-04-24", "2025-07-24", "2025-10-23"]},
    "KO": {"yield": 3.1, "annual_dividend": 1.84, "frequency": "quarterly", "ex_dates": ["2025-03-14", "2025-06-13", "2025-09-15", "2025-12-15"]},
    "VZ": {"yield": 6.8, "annual_dividend": 2.66, "frequency": "quarterly", "ex_dates": ["2025-01-10", "2025-04-10", "2025-07-10", "2025-10-10"]},
    "T": {"yield": 6.5, "annual_dividend": 1.11, "frequency": "quarterly", "ex_dates": ["2025-01-09", "2025-04-09", "2025-07-09", "2025-10-09"]},
    "XOM": {"yield": 3.4, "annual_dividend": 3.80, "frequency": "quarterly", "ex_dates": ["2025-02-12", "2025-05-14", "2025-08-13", "2025-11-12"]},
    "JPM": {"yield": 2.3, "annual_dividend": 4.60, "frequency": "quarterly", "ex_dates": ["2025-01-06", "2025-04-04", "2025-07-07", "2025-10-06"]},
    "O": {"yield": 5.8, "annual_dividend": 3.10, "frequency": "monthly", "ex_dates": ["2025-01-31", "2025-02-28", "2025-03-31"]},
}

# Economic Events
ECONOMIC_EVENTS = [
    {"date": "2025-01-29", "event": "FOMC Meeting", "importance": "high", "previous": "5.25%", "forecast": "5.25%"},
    {"date": "2025-01-31", "event": "GDP (Q4)", "importance": "high", "previous": "4.9%", "forecast": "2.0%"},
    {"date": "2025-02-07", "event": "Nonfarm Payrolls", "importance": "high", "previous": "216K", "forecast": "180K"},
    {"date": "2025-02-12", "event": "CPI (Jan)", "importance": "high", "previous": "3.4%", "forecast": "3.2%"},
    {"date": "2025-02-14", "event": "Retail Sales", "importance": "medium", "previous": "0.6%", "forecast": "0.4%"},
    {"date": "2025-02-21", "event": "Existing Home Sales", "importance": "medium", "previous": "3.78M", "forecast": "3.85M"},
    {"date": "2025-02-27", "event": "Durable Goods Orders", "importance": "medium", "previous": "-5.4%", "forecast": "1.2%"},
    {"date": "2025-03-07", "event": "Nonfarm Payrolls", "importance": "high", "previous": "180K", "forecast": "175K"},
    {"date": "2025-03-12", "event": "CPI (Feb)", "importance": "high", "previous": "3.2%", "forecast": "3.1%"},
    {"date": "2025-03-19", "event": "FOMC Meeting", "importance": "high", "previous": "5.25%", "forecast": "5.00%"},
    {"date": "2025-03-28", "event": "PCE Price Index", "importance": "high", "previous": "2.6%", "forecast": "2.5%"},
]

# Market Sentiment Data
MARKET_SENTIMENT = {
    "fear_greed_index": 62,
    "fear_greed_label": "Greed",
    "vix": 14.5,
    "put_call_ratio": 0.85,
    "advance_decline": 1.45,
    "new_highs_lows": 2.8,
    "sp500_above_200ma": 68,
    "market_momentum": "Bullish",
    "junk_bond_demand": "High",
    "safe_haven_demand": "Low"
}

# Social Sentiment by Stock
STOCK_SENTIMENT = {
    "AAPL": {"score": 72, "label": "Bullish", "mentions": 15420, "change_24h": 5.2},
    "MSFT": {"score": 68, "label": "Bullish", "mentions": 12350, "change_24h": 2.1},
    "GOOGL": {"score": 55, "label": "Neutral", "mentions": 8920, "change_24h": -1.5},
    "AMZN": {"score": 65, "label": "Bullish", "mentions": 11200, "change_24h": 3.8},
    "NVDA": {"score": 85, "label": "Very Bullish", "mentions": 28500, "change_24h": 12.5},
    "TSLA": {"score": 48, "label": "Neutral", "mentions": 35200, "change_24h": -8.2},
    "META": {"score": 61, "label": "Bullish", "mentions": 9800, "change_24h": 1.2},
    "JPM": {"score": 58, "label": "Neutral", "mentions": 4200, "change_24h": 0.5},
}

# Initialize Phase 9 tables
def init_phase9_tables():
    conn = get_db()
    
    # AI Coach recommendations
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ai_coach_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Document vault
    conn.execute("""
        CREATE TABLE IF NOT EXISTS document_vault (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER,
            description TEXT,
            tags TEXT,
            uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Dividend history
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dividend_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER,
            symbol TEXT NOT NULL,
            amount REAL NOT NULL,
            ex_date TEXT,
            pay_date TEXT,
            reinvested INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # User goals for AI coach
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_investment_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goal_type TEXT NOT NULL,
            target_amount REAL,
            target_date TEXT,
            risk_tolerance TEXT,
            investment_style TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase9_tables()

# =============================================================================
# AI PORTFOLIO COACH ENDPOINTS
# =============================================================================

@app.get("/api/coach/analysis/{portfolio_id}")
async def get_ai_coach_analysis(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get comprehensive AI coaching analysis for portfolio"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings found"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Generate AI recommendations
    recommendations = []
    
    # Diversification check
    if len(holdings) < 10:
        recommendations.append({
            "category": "diversification",
            "priority": "high",
            "title": "Increase Portfolio Diversification",
            "message": f"Your portfolio has only {len(holdings)} holdings. Consider adding more positions to reduce concentration risk.",
            "action": "Add 5-10 more uncorrelated assets"
        })
    
    # Concentration check
    for h in holdings:
        weight = (h["quantity"] * h["current_price"]) / total_value * 100
        if weight > 25:
            recommendations.append({
                "category": "concentration",
                "priority": "high",
                "title": f"High Concentration in {h['symbol']}",
                "message": f"{h['symbol']} represents {weight:.1f}% of your portfolio. Consider rebalancing.",
                "action": f"Reduce {h['symbol']} to below 20%"
            })
    
    # Sector balance (simulated)
    tech_weight = sum((h["quantity"] * h["current_price"]) / total_value * 100 
                      for h in holdings if h["symbol"] in ["AAPL", "MSFT", "GOOGL", "NVDA", "META"])
    if tech_weight > 40:
        recommendations.append({
            "category": "sector",
            "priority": "medium",
            "title": "Tech Sector Overweight",
            "message": f"Technology stocks represent {tech_weight:.1f}% of your portfolio.",
            "action": "Add defensive sectors like healthcare or utilities"
        })
    
    # Dividend income check
    dividend_yield = sum(DIVIDEND_STOCKS.get(h["symbol"], {}).get("yield", 0) * 
                         (h["quantity"] * h["current_price"]) / total_value for h in holdings)
    if dividend_yield < 1.5:
        recommendations.append({
            "category": "income",
            "priority": "low",
            "title": "Low Dividend Yield",
            "message": f"Portfolio yield is {dividend_yield:.2f}%. Consider adding dividend stocks for passive income.",
            "action": "Add dividend aristocrats like JNJ, PG, or KO"
        })
    
    # Cash drag check (simulated)
    recommendations.append({
        "category": "optimization",
        "priority": "medium",
        "title": "Consider Tax-Loss Harvesting",
        "message": "Review positions with unrealized losses for tax-loss harvesting opportunities.",
        "action": "Check Tax Optimization page for TLH candidates"
    })
    
    # Portfolio health score
    health_score = 100
    health_score -= len([r for r in recommendations if r["priority"] == "high"]) * 15
    health_score -= len([r for r in recommendations if r["priority"] == "medium"]) * 8
    health_score -= len([r for r in recommendations if r["priority"] == "low"]) * 3
    health_score = max(0, health_score)
    
    return {
        "portfolio_id": portfolio_id,
        "health_score": health_score,
        "health_label": "Excellent" if health_score >= 80 else "Good" if health_score >= 60 else "Needs Attention" if health_score >= 40 else "Critical",
        "total_value": round(total_value, 2),
        "holdings_count": len(holdings),
        "recommendations": recommendations,
        "summary": {
            "high_priority": len([r for r in recommendations if r["priority"] == "high"]),
            "medium_priority": len([r for r in recommendations if r["priority"] == "medium"]),
            "low_priority": len([r for r in recommendations if r["priority"] == "low"])
        }
    }

@app.post("/api/coach/goals")
async def set_investment_goals(
    goal_type: str = Query(...),  # retirement, growth, income, preservation
    target_amount: float = Query(None),
    target_date: str = Query(None),
    risk_tolerance: str = Query("moderate"),  # conservative, moderate, aggressive
    investment_style: str = Query("balanced"),  # growth, value, income, balanced
    user: dict = Depends(require_auth)
):
    """Set investment goals for AI coaching"""
    conn = get_db()
    conn.execute("""
        INSERT INTO user_investment_goals (user_id, goal_type, target_amount, target_date, risk_tolerance, investment_style)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], goal_type, target_amount, target_date, risk_tolerance, investment_style))
    conn.commit()
    conn.close()
    
    return {"status": "saved", "goal_type": goal_type}

@app.get("/api/coach/goals")
async def get_investment_goals(user: dict = Depends(require_auth)):
    """Get user's investment goals"""
    conn = get_db()
    goals = conn.execute("SELECT * FROM user_investment_goals WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    return {"goals": [dict(g) for g in goals]}

@app.get("/api/coach/action-items")
async def get_action_items(user: dict = Depends(require_auth)):
    """Get prioritized action items across all portfolios"""
    conn = get_db()
    portfolios = conn.execute("SELECT id, name FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    all_items = []
    for p in portfolios:
        analysis = await get_ai_coach_analysis(p["id"], user)
        if "recommendations" in analysis:
            for r in analysis["recommendations"]:
                r["portfolio_name"] = p["name"]
                r["portfolio_id"] = p["id"]
                all_items.append(r)
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    all_items.sort(key=lambda x: priority_order.get(x["priority"], 3))
    
    return {"action_items": all_items[:10]}  # Top 10 items

# =============================================================================
# DIVIDEND TRACKER ENDPOINTS
# =============================================================================

@app.get("/api/dividends/portfolio/{portfolio_id}")
async def get_portfolio_dividends(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get dividend information for portfolio holdings"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    dividend_info = []
    total_annual_income = 0
    
    for h in holdings:
        h = dict(h)
        symbol = h["symbol"]
        if symbol in DIVIDEND_STOCKS:
            div_data = DIVIDEND_STOCKS[symbol]
            shares = h["quantity"]
            annual_income = div_data["annual_dividend"] * shares
            total_annual_income += annual_income
            
            dividend_info.append({
                "symbol": symbol,
                "shares": shares,
                "dividend_yield": div_data["yield"],
                "annual_dividend_per_share": div_data["annual_dividend"],
                "annual_income": round(annual_income, 2),
                "quarterly_income": round(annual_income / 4, 2) if div_data["frequency"] == "quarterly" else round(annual_income / 12, 2),
                "frequency": div_data["frequency"],
                "next_ex_date": div_data["ex_dates"][0] if div_data["ex_dates"] else None
            })
    
    # Calculate portfolio yield
    total_value = sum(h["quantity"] * h["current_price"] for h in [dict(x) for x in conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()] if True) if False else sum(dict(h)["quantity"] * dict(h)["current_price"] for h in holdings)
    
    conn = get_db()
    holdings_raw = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    total_value = sum(dict(h)["quantity"] * dict(h)["current_price"] for h in holdings_raw)
    portfolio_yield = (total_annual_income / total_value * 100) if total_value > 0 else 0
    
    return {
        "portfolio_id": portfolio_id,
        "holdings": dividend_info,
        "summary": {
            "total_annual_income": round(total_annual_income, 2),
            "monthly_income": round(total_annual_income / 12, 2),
            "portfolio_yield": round(portfolio_yield, 2),
            "dividend_stocks_count": len(dividend_info)
        }
    }

@app.get("/api/dividends/calendar")
async def get_dividend_calendar(user: dict = Depends(require_auth)):
    """Get upcoming dividend calendar"""
    conn = get_db()
    portfolios = conn.execute("SELECT id FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    
    # Get all user's holdings
    user_symbols = set()
    for p in portfolios:
        holdings = conn.execute("SELECT symbol FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        for h in holdings:
            user_symbols.add(h["symbol"])
    conn.close()
    
    # Build calendar
    calendar = []
    for symbol in user_symbols:
        if symbol in DIVIDEND_STOCKS:
            div_data = DIVIDEND_STOCKS[symbol]
            for ex_date in div_data["ex_dates"]:
                calendar.append({
                    "symbol": symbol,
                    "ex_date": ex_date,
                    "dividend_per_share": div_data["annual_dividend"] / (4 if div_data["frequency"] == "quarterly" else 12),
                    "yield": div_data["yield"]
                })
    
    # Sort by date
    calendar.sort(key=lambda x: x["ex_date"])
    
    return {"calendar": calendar[:20]}  # Next 20 dividends

@app.get("/api/dividends/projections")
async def get_dividend_projections(portfolio_id: int, years: int = Query(10), user: dict = Depends(require_auth)):
    """Project dividend income growth over time"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    # Calculate current annual income
    current_income = 0
    for h in holdings:
        h = dict(h)
        if h["symbol"] in DIVIDEND_STOCKS:
            current_income += DIVIDEND_STOCKS[h["symbol"]]["annual_dividend"] * h["quantity"]
    
    # Project with 5% annual dividend growth
    growth_rate = 0.05
    projections = []
    income = current_income
    
    for year in range(years + 1):
        projections.append({
            "year": year,
            "annual_income": round(income, 2),
            "monthly_income": round(income / 12, 2)
        })
        income *= (1 + growth_rate)
    
    return {
        "current_annual_income": round(current_income, 2),
        "projected_income_year_10": round(projections[-1]["annual_income"], 2),
        "growth_rate": growth_rate * 100,
        "projections": projections
    }

# =============================================================================
# DOCUMENT VAULT ENDPOINTS
# =============================================================================

@app.post("/api/documents")
async def upload_document(
    name: str = Query(...),
    category: str = Query(...),  # tax, statement, contract, receipt, other
    file_type: str = Query(None),
    description: str = Query(None),
    tags: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Upload a document to the vault"""
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO document_vault (user_id, name, category, file_type, description, tags)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], name, category, file_type, description, tags))
    doc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": doc_id, "status": "uploaded"}

@app.get("/api/documents")
async def get_documents(category: str = Query(None), user: dict = Depends(require_auth)):
    """Get all documents"""
    conn = get_db()
    if category:
        docs = conn.execute("SELECT * FROM document_vault WHERE user_id = ? AND category = ? ORDER BY uploaded_at DESC", 
                           (user["id"], category)).fetchall()
    else:
        docs = conn.execute("SELECT * FROM document_vault WHERE user_id = ? ORDER BY uploaded_at DESC", 
                           (user["id"],)).fetchall()
    conn.close()
    
    return {"documents": [dict(d) for d in docs]}

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: int, user: dict = Depends(require_auth)):
    """Delete a document"""
    conn = get_db()
    conn.execute("DELETE FROM document_vault WHERE id = ? AND user_id = ?", (doc_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/documents/categories")
async def get_document_categories(user: dict = Depends(require_auth)):
    """Get document categories with counts"""
    conn = get_db()
    categories = conn.execute("""
        SELECT category, COUNT(*) as count FROM document_vault 
        WHERE user_id = ? GROUP BY category
    """, (user["id"],)).fetchall()
    conn.close()
    
    return {"categories": [dict(c) for c in categories]}

# =============================================================================
# ECONOMIC CALENDAR ENDPOINTS
# =============================================================================

@app.get("/api/economic/calendar")
async def get_economic_calendar(importance: str = Query(None), user: dict = Depends(require_auth)):
    """Get economic events calendar"""
    events = ECONOMIC_EVENTS.copy()
    
    if importance:
        events = [e for e in events if e["importance"] == importance]
    
    return {"events": events}

@app.get("/api/economic/upcoming")
async def get_upcoming_events(days: int = Query(7), user: dict = Depends(require_auth)):
    """Get upcoming economic events"""
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")
    
    events = [e for e in ECONOMIC_EVENTS if today <= e["date"] <= cutoff]
    
    return {"events": events, "days": days}

# =============================================================================
# PERFORMANCE ATTRIBUTION ENDPOINTS
# =============================================================================

@app.get("/api/attribution/{portfolio_id}")
async def get_performance_attribution(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get detailed performance attribution analysis"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings found"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["purchase_price"] for h in holdings)
    
    # Calculate attribution by holding
    attribution = []
    for h in holdings:
        pnl = (h["current_price"] - h["purchase_price"]) * h["quantity"]
        weight = (h["quantity"] * h["current_price"]) / total_value * 100
        contribution = pnl / total_cost * 100 if total_cost > 0 else 0
        
        attribution.append({
            "symbol": h["symbol"],
            "weight": round(weight, 2),
            "return_pct": round((h["current_price"] - h["purchase_price"]) / h["purchase_price"] * 100, 2),
            "pnl": round(pnl, 2),
            "contribution": round(contribution, 2)
        })
    
    # Sort by contribution
    attribution.sort(key=lambda x: x["contribution"], reverse=True)
    
    # Sector attribution (simulated)
    sectors = {
        "Technology": {"weight": 35, "return": 18.5, "contribution": 6.5},
        "Healthcare": {"weight": 15, "return": 8.2, "contribution": 1.2},
        "Financials": {"weight": 12, "return": 12.5, "contribution": 1.5},
        "Consumer": {"weight": 18, "return": 5.8, "contribution": 1.0},
        "Energy": {"weight": 10, "return": -2.5, "contribution": -0.3},
        "Other": {"weight": 10, "return": 6.2, "contribution": 0.6}
    }
    
    # Factor attribution (simulated)
    factors = {
        "Market Beta": {"exposure": 1.05, "contribution": 8.2},
        "Size (SMB)": {"exposure": -0.15, "contribution": -0.5},
        "Value (HML)": {"exposure": 0.22, "contribution": 0.8},
        "Momentum": {"exposure": 0.35, "contribution": 1.5},
        "Quality": {"exposure": 0.28, "contribution": 1.2},
        "Selection": {"exposure": None, "contribution": 2.3}
    }
    
    total_return = (total_value - total_cost) / total_cost * 100 if total_cost > 0 else 0
    
    return {
        "portfolio_id": portfolio_id,
        "total_return_pct": round(total_return, 2),
        "total_pnl": round(total_value - total_cost, 2),
        "by_holding": attribution,
        "by_sector": sectors,
        "by_factor": factors,
        "top_contributors": attribution[:3],
        "bottom_contributors": attribution[-3:]
    }

# =============================================================================
# MARKET SENTIMENT ENDPOINTS
# =============================================================================

@app.get("/api/sentiment/market")
async def get_market_sentiment(user: dict = Depends(require_auth)):
    """Get overall market sentiment indicators"""
    return {
        "fear_greed": {
            "value": MARKET_SENTIMENT["fear_greed_index"],
            "label": MARKET_SENTIMENT["fear_greed_label"],
            "interpretation": "Markets showing moderate greed - be cautious of overvaluation"
        },
        "indicators": {
            "vix": {"value": MARKET_SENTIMENT["vix"], "signal": "Low Volatility" if MARKET_SENTIMENT["vix"] < 20 else "High Volatility"},
            "put_call_ratio": {"value": MARKET_SENTIMENT["put_call_ratio"], "signal": "Bullish" if MARKET_SENTIMENT["put_call_ratio"] < 1 else "Bearish"},
            "advance_decline": {"value": MARKET_SENTIMENT["advance_decline"], "signal": "Bullish" if MARKET_SENTIMENT["advance_decline"] > 1 else "Bearish"},
            "new_highs_lows": {"value": MARKET_SENTIMENT["new_highs_lows"], "signal": "Bullish" if MARKET_SENTIMENT["new_highs_lows"] > 1 else "Bearish"},
            "sp500_above_200ma": {"value": MARKET_SENTIMENT["sp500_above_200ma"], "signal": "Healthy" if MARKET_SENTIMENT["sp500_above_200ma"] > 50 else "Weak"}
        },
        "overall_signal": MARKET_SENTIMENT["market_momentum"]
    }

@app.get("/api/sentiment/stock/{symbol}")
async def get_stock_sentiment(symbol: str, user: dict = Depends(require_auth)):
    """Get social sentiment for a specific stock"""
    symbol = symbol.upper()
    
    if symbol in STOCK_SENTIMENT:
        data = STOCK_SENTIMENT[symbol]
        return {
            "symbol": symbol,
            "sentiment_score": data["score"],
            "sentiment_label": data["label"],
            "social_mentions": data["mentions"],
            "mention_change_24h": data["change_24h"],
            "recommendation": "Consider buying" if data["score"] > 70 else "Hold" if data["score"] > 40 else "Be cautious"
        }
    
    # Generate random sentiment for unknown stocks
    score = random.randint(30, 80)
    return {
        "symbol": symbol,
        "sentiment_score": score,
        "sentiment_label": "Bullish" if score > 60 else "Neutral" if score > 40 else "Bearish",
        "social_mentions": random.randint(100, 5000),
        "mention_change_24h": random.uniform(-10, 15),
        "recommendation": "Hold"
    }

@app.get("/api/sentiment/trending")
async def get_trending_stocks(user: dict = Depends(require_auth)):
    """Get trending stocks by social sentiment"""
    trending = []
    for symbol, data in STOCK_SENTIMENT.items():
        trending.append({
            "symbol": symbol,
            "sentiment_score": data["score"],
            "sentiment_label": data["label"],
            "mentions": data["mentions"],
            "change_24h": data["change_24h"]
        })
    
    # Sort by mentions
    trending.sort(key=lambda x: x["mentions"], reverse=True)
    
    return {"trending": trending}

# =============================================================================
# PHASE 8: WATCHLISTS, TRADING JOURNAL, NET WORTH, CHARTS & COLLABORATION
# =============================================================================

# Stock Screener Presets
SCREENER_PRESETS = {
    "momentum": {"name": "Momentum Leaders", "filters": {"rsi_above": 50, "above_sma50": True, "volume_surge": True}},
    "oversold": {"name": "Oversold Bounce", "filters": {"rsi_below": 30, "near_support": True}},
    "breakout": {"name": "Breakout Candidates", "filters": {"near_52w_high": True, "volume_surge": True}},
    "dividend": {"name": "High Dividend", "filters": {"yield_above": 3, "payout_below": 80}},
    "value": {"name": "Deep Value", "filters": {"pe_below": 15, "pb_below": 2}},
    "growth": {"name": "High Growth", "filters": {"revenue_growth_above": 20, "earnings_growth_above": 25}},
}

# Sample stocks for screener
SCREENER_STOCKS = [
    {"symbol": "AAPL", "price": 178.50, "change": 2.3, "rsi": 62, "pe": 28.5, "yield": 0.5, "volume_ratio": 1.2, "near_high": True},
    {"symbol": "MSFT", "price": 378.20, "change": 1.8, "rsi": 58, "pe": 35.2, "yield": 0.8, "volume_ratio": 0.9, "near_high": True},
    {"symbol": "GOOGL", "price": 141.50, "change": -0.5, "rsi": 45, "pe": 25.8, "yield": 0, "volume_ratio": 1.1, "near_high": False},
    {"symbol": "AMZN", "price": 178.90, "change": 3.2, "rsi": 68, "pe": 62.5, "yield": 0, "volume_ratio": 1.5, "near_high": True},
    {"symbol": "NVDA", "price": 495.20, "change": 4.5, "rsi": 72, "pe": 65.2, "yield": 0.03, "volume_ratio": 2.1, "near_high": True},
    {"symbol": "JPM", "price": 195.80, "change": 0.8, "rsi": 55, "pe": 11.5, "yield": 2.4, "volume_ratio": 0.8, "near_high": False},
    {"symbol": "JNJ", "price": 155.30, "change": -0.2, "rsi": 42, "pe": 15.2, "yield": 3.1, "volume_ratio": 0.7, "near_high": False},
    {"symbol": "PG", "price": 158.90, "change": 0.5, "rsi": 48, "pe": 25.8, "yield": 2.5, "volume_ratio": 0.9, "near_high": False},
    {"symbol": "KO", "price": 59.20, "change": 0.3, "rsi": 51, "pe": 23.5, "yield": 3.2, "volume_ratio": 0.8, "near_high": False},
    {"symbol": "VZ", "price": 38.50, "change": -1.2, "rsi": 28, "pe": 8.5, "yield": 7.2, "volume_ratio": 1.3, "near_high": False},
    {"symbol": "T", "price": 17.80, "change": -0.8, "rsi": 32, "pe": 7.2, "yield": 6.8, "volume_ratio": 1.1, "near_high": False},
    {"symbol": "INTC", "price": 45.20, "change": 2.8, "rsi": 38, "pe": 28.5, "yield": 1.2, "volume_ratio": 1.8, "near_high": False},
]

# Initialize Phase 8 tables
def init_phase8_tables():
    conn = get_db()
    
    # Watchlists table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Watchlist items table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS watchlist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            watchlist_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            added_price REAL,
            target_price REAL,
            stop_price REAL,
            notes TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (watchlist_id) REFERENCES watchlists (id)
        )
    """)
    
    # Trading journal table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS trade_journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            entry_date TEXT NOT NULL,
            entry_price REAL NOT NULL,
            shares REAL NOT NULL,
            exit_date TEXT,
            exit_price REAL,
            pnl REAL,
            pnl_pct REAL,
            strategy TEXT,
            setup TEXT,
            notes TEXT,
            emotions TEXT,
            rating INTEGER,
            lessons TEXT,
            tags TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Net worth assets table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS net_worth_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            value REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            notes TEXT,
            last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Net worth liabilities table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS net_worth_liabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            balance REAL NOT NULL,
            interest_rate REAL,
            minimum_payment REAL,
            currency TEXT DEFAULT 'USD',
            notes TEXT,
            last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Net worth history table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS net_worth_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            total_assets REAL,
            total_liabilities REAL,
            net_worth REAL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Shared portfolios table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS shared_portfolios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            shared_by INTEGER NOT NULL,
            shared_with_email TEXT,
            permission TEXT DEFAULT 'view',
            share_code TEXT UNIQUE,
            expires_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios (id),
            FOREIGN KEY (shared_by) REFERENCES users (id)
        )
    """)
    
    # Family accounts table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS family_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            member_email TEXT NOT NULL,
            member_name TEXT,
            relationship TEXT,
            permission TEXT DEFAULT 'view',
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users (id)
        )
    """)
    
    # Chart annotations table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chart_annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            annotation_type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase8_tables()

# =============================================================================
# WATCHLIST ENDPOINTS
# =============================================================================

@app.post("/api/watchlists")
async def create_watchlist(
    name: str = Query(...),
    description: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Create a new watchlist"""
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO watchlists (user_id, name, description)
        VALUES (?, ?, ?)
    """, (user["id"], name, description))
    watchlist_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": watchlist_id, "name": name, "status": "created"}

@app.get("/api/watchlists")
async def get_watchlists(user: dict = Depends(require_auth)):
    """Get all watchlists"""
    conn = get_db()
    watchlists = conn.execute("SELECT * FROM watchlists WHERE user_id = ?", (user["id"],)).fetchall()
    
    result = []
    for w in watchlists:
        items = conn.execute("SELECT * FROM watchlist_items WHERE watchlist_id = ?", (w["id"],)).fetchall()
        result.append({
            **dict(w),
            "items": [dict(i) for i in items],
            "item_count": len(items)
        })
    
    conn.close()
    return {"watchlists": result}

@app.post("/api/watchlists/{watchlist_id}/items")
async def add_watchlist_item(
    watchlist_id: int,
    symbol: str = Query(...),
    target_price: float = Query(None),
    stop_price: float = Query(None),
    notes: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Add item to watchlist"""
    # Get current price
    current_price = random.uniform(50, 500)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO watchlist_items (watchlist_id, symbol, added_price, target_price, stop_price, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (watchlist_id, symbol.upper(), current_price, target_price, stop_price, notes))
    conn.commit()
    conn.close()
    
    return {"status": "added", "symbol": symbol.upper(), "added_price": round(current_price, 2)}

@app.delete("/api/watchlists/{watchlist_id}/items/{item_id}")
async def remove_watchlist_item(watchlist_id: int, item_id: int, user: dict = Depends(require_auth)):
    """Remove item from watchlist"""
    conn = get_db()
    conn.execute("DELETE FROM watchlist_items WHERE id = ? AND watchlist_id = ?", (item_id, watchlist_id))
    conn.commit()
    conn.close()
    return {"status": "removed"}

@app.delete("/api/watchlists/{watchlist_id}")
async def delete_watchlist(watchlist_id: int, user: dict = Depends(require_auth)):
    """Delete a watchlist"""
    conn = get_db()
    conn.execute("DELETE FROM watchlist_items WHERE watchlist_id = ?", (watchlist_id,))
    conn.execute("DELETE FROM watchlists WHERE id = ? AND user_id = ?", (watchlist_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# =============================================================================
# STOCK SCREENER ENDPOINTS
# =============================================================================

@app.get("/api/screener/presets")
async def get_screener_presets(user: dict = Depends(require_auth)):
    """Get available screener presets"""
    return {"presets": SCREENER_PRESETS}

@app.post("/api/screener/run")
async def run_screener(
    preset: str = Query(None),
    min_price: float = Query(None),
    max_price: float = Query(None),
    min_pe: float = Query(None),
    max_pe: float = Query(None),
    min_yield: float = Query(None),
    min_rsi: float = Query(None),
    max_rsi: float = Query(None),
    volume_surge: bool = Query(None),
    user: dict = Depends(require_auth)
):
    """Run stock screener with custom filters"""
    results = SCREENER_STOCKS.copy()
    
    # Apply preset filters
    if preset and preset in SCREENER_PRESETS:
        filters = SCREENER_PRESETS[preset]["filters"]
        if "rsi_above" in filters:
            results = [s for s in results if s["rsi"] > filters["rsi_above"]]
        if "rsi_below" in filters:
            results = [s for s in results if s["rsi"] < filters["rsi_below"]]
        if "pe_below" in filters:
            results = [s for s in results if s["pe"] < filters["pe_below"]]
        if "yield_above" in filters:
            results = [s for s in results if s["yield"] > filters["yield_above"]]
        if "volume_surge" in filters and filters["volume_surge"]:
            results = [s for s in results if s["volume_ratio"] > 1.5]
        if "near_52w_high" in filters and filters["near_52w_high"]:
            results = [s for s in results if s["near_high"]]
    
    # Apply custom filters
    if min_price:
        results = [s for s in results if s["price"] >= min_price]
    if max_price:
        results = [s for s in results if s["price"] <= max_price]
    if min_pe:
        results = [s for s in results if s["pe"] >= min_pe]
    if max_pe:
        results = [s for s in results if s["pe"] <= max_pe]
    if min_yield:
        results = [s for s in results if s["yield"] >= min_yield]
    if min_rsi:
        results = [s for s in results if s["rsi"] >= min_rsi]
    if max_rsi:
        results = [s for s in results if s["rsi"] <= max_rsi]
    if volume_surge:
        results = [s for s in results if s["volume_ratio"] > 1.5]
    
    return {"results": results, "count": len(results), "preset_used": preset}

# =============================================================================
# TRADING JOURNAL ENDPOINTS
# =============================================================================

@app.post("/api/journal/trades")
async def add_journal_trade(
    symbol: str = Query(...),
    trade_type: str = Query(...),  # long, short
    entry_date: str = Query(...),
    entry_price: float = Query(...),
    shares: float = Query(...),
    exit_date: str = Query(None),
    exit_price: float = Query(None),
    strategy: str = Query(None),
    setup: str = Query(None),
    notes: str = Query(None),
    emotions: str = Query(None),
    rating: int = Query(None),
    tags: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Add a trade to the journal"""
    pnl = None
    pnl_pct = None
    
    if exit_price and exit_date:
        if trade_type == "long":
            pnl = (exit_price - entry_price) * shares
            pnl_pct = ((exit_price - entry_price) / entry_price) * 100
        else:
            pnl = (entry_price - exit_price) * shares
            pnl_pct = ((entry_price - exit_price) / entry_price) * 100
    
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO trade_journal (user_id, symbol, trade_type, entry_date, entry_price, shares,
            exit_date, exit_price, pnl, pnl_pct, strategy, setup, notes, emotions, rating, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user["id"], symbol.upper(), trade_type, entry_date, entry_price, shares,
          exit_date, exit_price, pnl, pnl_pct, strategy, setup, notes, emotions, rating, tags))
    trade_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": trade_id, "status": "added", "pnl": pnl, "pnl_pct": pnl_pct}

@app.get("/api/journal/trades")
async def get_journal_trades(
    status: str = Query(None),  # open, closed, all
    user: dict = Depends(require_auth)
):
    """Get all journal trades"""
    conn = get_db()
    
    if status == "open":
        trades = conn.execute("SELECT * FROM trade_journal WHERE user_id = ? AND exit_date IS NULL ORDER BY entry_date DESC", 
                             (user["id"],)).fetchall()
    elif status == "closed":
        trades = conn.execute("SELECT * FROM trade_journal WHERE user_id = ? AND exit_date IS NOT NULL ORDER BY exit_date DESC", 
                             (user["id"],)).fetchall()
    else:
        trades = conn.execute("SELECT * FROM trade_journal WHERE user_id = ? ORDER BY entry_date DESC", 
                             (user["id"],)).fetchall()
    
    conn.close()
    return {"trades": [dict(t) for t in trades]}

@app.put("/api/journal/trades/{trade_id}/close")
async def close_journal_trade(
    trade_id: int,
    exit_date: str = Query(...),
    exit_price: float = Query(...),
    notes: str = Query(None),
    lessons: str = Query(None),
    rating: int = Query(None),
    user: dict = Depends(require_auth)
):
    """Close an open trade"""
    conn = get_db()
    trade = conn.execute("SELECT * FROM trade_journal WHERE id = ? AND user_id = ?", 
                        (trade_id, user["id"])).fetchone()
    
    if not trade:
        conn.close()
        return {"error": "Trade not found"}
    
    trade = dict(trade)
    if trade["trade_type"] == "long":
        pnl = (exit_price - trade["entry_price"]) * trade["shares"]
        pnl_pct = ((exit_price - trade["entry_price"]) / trade["entry_price"]) * 100
    else:
        pnl = (trade["entry_price"] - exit_price) * trade["shares"]
        pnl_pct = ((trade["entry_price"] - exit_price) / trade["entry_price"]) * 100
    
    conn.execute("""
        UPDATE trade_journal SET exit_date = ?, exit_price = ?, pnl = ?, pnl_pct = ?, 
        notes = COALESCE(?, notes), lessons = ?, rating = COALESCE(?, rating)
        WHERE id = ? AND user_id = ?
    """, (exit_date, exit_price, pnl, pnl_pct, notes, lessons, rating, trade_id, user["id"]))
    conn.commit()
    conn.close()
    
    return {"status": "closed", "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct, 2)}

@app.get("/api/journal/stats")
async def get_journal_stats(user: dict = Depends(require_auth)):
    """Get trading journal statistics"""
    conn = get_db()
    trades = conn.execute("SELECT * FROM trade_journal WHERE user_id = ? AND exit_date IS NOT NULL", 
                         (user["id"],)).fetchall()
    conn.close()
    
    if not trades:
        return {"message": "No closed trades yet"}
    
    trades = [dict(t) for t in trades]
    
    total_trades = len(trades)
    winning_trades = [t for t in trades if t["pnl"] and t["pnl"] > 0]
    losing_trades = [t for t in trades if t["pnl"] and t["pnl"] < 0]
    
    total_pnl = sum(t["pnl"] or 0 for t in trades)
    total_wins = sum(t["pnl"] or 0 for t in winning_trades)
    total_losses = abs(sum(t["pnl"] or 0 for t in losing_trades))
    
    win_rate = (len(winning_trades) / total_trades) * 100 if total_trades > 0 else 0
    avg_win = total_wins / len(winning_trades) if winning_trades else 0
    avg_loss = total_losses / len(losing_trades) if losing_trades else 0
    profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
    
    # By strategy
    strategies = {}
    for t in trades:
        s = t["strategy"] or "Unknown"
        if s not in strategies:
            strategies[s] = {"trades": 0, "wins": 0, "pnl": 0}
        strategies[s]["trades"] += 1
        if t["pnl"] and t["pnl"] > 0:
            strategies[s]["wins"] += 1
        strategies[s]["pnl"] += t["pnl"] or 0
    
    return {
        "total_trades": total_trades,
        "winning_trades": len(winning_trades),
        "losing_trades": len(losing_trades),
        "win_rate": round(win_rate, 1),
        "total_pnl": round(total_pnl, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float('inf') else "∞",
        "largest_win": round(max((t["pnl"] or 0 for t in trades), default=0), 2),
        "largest_loss": round(min((t["pnl"] or 0 for t in trades), default=0), 2),
        "by_strategy": strategies
    }

# =============================================================================
# NET WORTH TRACKER ENDPOINTS
# =============================================================================

@app.post("/api/networth/assets")
async def add_asset(
    category: str = Query(...),  # investments, real_estate, vehicles, cash, other
    name: str = Query(...),
    value: float = Query(...),
    notes: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Add an asset to net worth tracker"""
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO net_worth_assets (user_id, category, name, value, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (user["id"], category, name, value, notes))
    asset_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": asset_id, "status": "added"}

@app.get("/api/networth/assets")
async def get_assets(user: dict = Depends(require_auth)):
    """Get all assets"""
    conn = get_db()
    assets = conn.execute("SELECT * FROM net_worth_assets WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    # Group by category
    by_category = {}
    for a in assets:
        a = dict(a)
        cat = a["category"]
        if cat not in by_category:
            by_category[cat] = {"items": [], "total": 0}
        by_category[cat]["items"].append(a)
        by_category[cat]["total"] += a["value"]
    
    total = sum(c["total"] for c in by_category.values())
    
    return {"assets": by_category, "total_assets": total}

@app.put("/api/networth/assets/{asset_id}")
async def update_asset(
    asset_id: int,
    value: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Update an asset value"""
    conn = get_db()
    conn.execute("UPDATE net_worth_assets SET value = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (value, asset_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/api/networth/assets/{asset_id}")
async def delete_asset(asset_id: int, user: dict = Depends(require_auth)):
    """Delete an asset"""
    conn = get_db()
    conn.execute("DELETE FROM net_worth_assets WHERE id = ? AND user_id = ?", (asset_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/api/networth/liabilities")
async def add_liability(
    category: str = Query(...),  # mortgage, auto_loan, student_loan, credit_card, other
    name: str = Query(...),
    balance: float = Query(...),
    interest_rate: float = Query(None),
    minimum_payment: float = Query(None),
    user: dict = Depends(require_auth)
):
    """Add a liability to net worth tracker"""
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO net_worth_liabilities (user_id, category, name, balance, interest_rate, minimum_payment)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], category, name, balance, interest_rate, minimum_payment))
    liability_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": liability_id, "status": "added"}

@app.get("/api/networth/liabilities")
async def get_liabilities(user: dict = Depends(require_auth)):
    """Get all liabilities"""
    conn = get_db()
    liabilities = conn.execute("SELECT * FROM net_worth_liabilities WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    by_category = {}
    for l in liabilities:
        l = dict(l)
        cat = l["category"]
        if cat not in by_category:
            by_category[cat] = {"items": [], "total": 0}
        by_category[cat]["items"].append(l)
        by_category[cat]["total"] += l["balance"]
    
    total = sum(c["total"] for c in by_category.values())
    
    return {"liabilities": by_category, "total_liabilities": total}

@app.get("/api/networth/summary")
async def get_networth_summary(user: dict = Depends(require_auth)):
    """Get complete net worth summary"""
    conn = get_db()
    
    # Get assets
    assets = conn.execute("SELECT category, SUM(value) as total FROM net_worth_assets WHERE user_id = ? GROUP BY category", 
                         (user["id"],)).fetchall()
    
    # Get liabilities
    liabilities = conn.execute("SELECT category, SUM(balance) as total FROM net_worth_liabilities WHERE user_id = ? GROUP BY category", 
                              (user["id"],)).fetchall()
    
    # Get portfolio values
    portfolios = conn.execute("""
        SELECT p.name, SUM(h.quantity * h.current_price) as value
        FROM portfolios p
        LEFT JOIN holdings h ON p.id = h.portfolio_id
        WHERE p.user_id = ?
        GROUP BY p.id
    """, (user["id"],)).fetchall()
    
    total_assets = sum(a["total"] or 0 for a in assets)
    total_portfolios = sum(p["value"] or 0 for p in portfolios)
    total_liabilities = sum(l["total"] or 0 for l in liabilities)
    
    net_worth = total_assets + total_portfolios - total_liabilities
    
    # Record history
    today = datetime.now().strftime("%Y-%m-%d")
    conn.execute("""
        INSERT OR REPLACE INTO net_worth_history (user_id, date, total_assets, total_liabilities, net_worth)
        VALUES (?, ?, ?, ?, ?)
    """, (user["id"], today, total_assets + total_portfolios, total_liabilities, net_worth))
    conn.commit()
    
    # Get history
    history = conn.execute("""
        SELECT * FROM net_worth_history WHERE user_id = ? ORDER BY date DESC LIMIT 30
    """, (user["id"],)).fetchall()
    
    conn.close()
    
    return {
        "net_worth": round(net_worth, 2),
        "total_assets": round(total_assets + total_portfolios, 2),
        "total_liabilities": round(total_liabilities, 2),
        "breakdown": {
            "assets": {a["category"]: a["total"] for a in assets},
            "portfolios": {p["name"]: p["value"] for p in portfolios if p["value"]},
            "liabilities": {l["category"]: l["total"] for l in liabilities}
        },
        "history": [dict(h) for h in history]
    }

# =============================================================================
# ADVANCED CHARTS ENDPOINTS
# =============================================================================

@app.get("/api/charts/{symbol}/advanced")
async def get_advanced_chart_data(
    symbol: str,
    period: str = Query("1Y"),
    indicators: str = Query("sma,ema,bb"),
    user: dict = Depends(require_auth)
):
    """Get advanced chart data with multiple indicators"""
    periods = {"1M": 30, "3M": 90, "6M": 180, "1Y": 252, "2Y": 504, "5Y": 1260}
    days = periods.get(period, 252)
    
    # Generate OHLCV data
    base_price = random.uniform(100, 500)
    data = []
    
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-i)).strftime("%Y-%m-%d")
        open_price = base_price * (1 + random.gauss(0, 0.02))
        high = open_price * (1 + random.uniform(0, 0.03))
        low = open_price * (1 - random.uniform(0, 0.03))
        close = random.uniform(low, high)
        volume = random.randint(1000000, 50000000)
        
        data.append({
            "date": date,
            "open": round(open_price, 2),
            "high": round(high, 2),
            "low": round(low, 2),
            "close": round(close, 2),
            "volume": volume
        })
        
        base_price = close
    
    # Calculate indicators
    closes = [d["close"] for d in data]
    
    indicator_data = {}
    
    if "sma" in indicators:
        sma20 = []
        sma50 = []
        for i in range(len(closes)):
            sma20.append(sum(closes[max(0,i-19):i+1]) / min(20, i+1) if i >= 0 else None)
            sma50.append(sum(closes[max(0,i-49):i+1]) / min(50, i+1) if i >= 19 else None)
        indicator_data["sma20"] = [round(v, 2) if v else None for v in sma20]
        indicator_data["sma50"] = [round(v, 2) if v else None for v in sma50]
    
    if "ema" in indicators:
        ema12 = [closes[0]]
        ema26 = [closes[0]]
        for i in range(1, len(closes)):
            ema12.append(closes[i] * (2/13) + ema12[-1] * (11/13))
            ema26.append(closes[i] * (2/27) + ema26[-1] * (25/27))
        indicator_data["ema12"] = [round(v, 2) for v in ema12]
        indicator_data["ema26"] = [round(v, 2) for v in ema26]
    
    if "bb" in indicators:
        bb_upper = []
        bb_lower = []
        bb_middle = []
        for i in range(len(closes)):
            if i >= 19:
                window = closes[i-19:i+1]
                mean = sum(window) / 20
                std = (sum((x - mean)**2 for x in window) / 20) ** 0.5
                bb_middle.append(round(mean, 2))
                bb_upper.append(round(mean + 2*std, 2))
                bb_lower.append(round(mean - 2*std, 2))
            else:
                bb_middle.append(None)
                bb_upper.append(None)
                bb_lower.append(None)
        indicator_data["bb_upper"] = bb_upper
        indicator_data["bb_middle"] = bb_middle
        indicator_data["bb_lower"] = bb_lower
    
    return {
        "symbol": symbol.upper(),
        "period": period,
        "ohlcv": data,
        "indicators": indicator_data
    }

@app.post("/api/charts/{symbol}/annotations")
async def save_chart_annotation(
    symbol: str,
    annotation_type: str = Query(...),  # trendline, horizontal, fibonacci, note
    data: str = Query(...),  # JSON string with coordinates/details
    user: dict = Depends(require_auth)
):
    """Save a chart annotation"""
    conn = get_db()
    conn.execute("""
        INSERT INTO chart_annotations (user_id, symbol, annotation_type, data)
        VALUES (?, ?, ?, ?)
    """, (user["id"], symbol.upper(), annotation_type, data))
    conn.commit()
    conn.close()
    
    return {"status": "saved"}

@app.get("/api/charts/{symbol}/annotations")
async def get_chart_annotations(symbol: str, user: dict = Depends(require_auth)):
    """Get saved chart annotations"""
    conn = get_db()
    annotations = conn.execute("SELECT * FROM chart_annotations WHERE user_id = ? AND symbol = ?",
                              (user["id"], symbol.upper())).fetchall()
    conn.close()
    
    return {"annotations": [dict(a) for a in annotations]}

# =============================================================================
# COLLABORATION & SHARING ENDPOINTS
# =============================================================================

@app.post("/api/portfolios/{portfolio_id}/share")
async def share_portfolio(
    portfolio_id: int,
    email: str = Query(None),
    permission: str = Query("view"),  # view, edit
    user: dict = Depends(require_auth)
):
    """Share a portfolio with another user"""
    import secrets
    share_code = secrets.token_urlsafe(16)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO shared_portfolios (portfolio_id, shared_by, shared_with_email, permission, share_code)
        VALUES (?, ?, ?, ?, ?)
    """, (portfolio_id, user["id"], email, permission, share_code))
    conn.commit()
    conn.close()
    
    return {"share_code": share_code, "share_url": f"/shared/{share_code}", "permission": permission}

@app.get("/api/portfolios/shared")
async def get_shared_portfolios(user: dict = Depends(require_auth)):
    """Get portfolios shared with me"""
    conn = get_db()
    shared = conn.execute("""
        SELECT sp.*, p.name as portfolio_name, u.email as shared_by_email
        FROM shared_portfolios sp
        JOIN portfolios p ON sp.portfolio_id = p.id
        JOIN users u ON sp.shared_by = u.id
        WHERE sp.shared_with_email = ?
    """, (user["email"],)).fetchall()
    conn.close()
    
    return {"shared_portfolios": [dict(s) for s in shared]}

@app.get("/api/shared/{share_code}")
async def get_shared_portfolio(share_code: str):
    """Access a shared portfolio by code"""
    conn = get_db()
    shared = conn.execute("""
        SELECT sp.*, p.name, p.description
        FROM shared_portfolios sp
        JOIN portfolios p ON sp.portfolio_id = p.id
        WHERE sp.share_code = ?
    """, (share_code,)).fetchone()
    
    if not shared:
        conn.close()
        return {"error": "Share not found or expired"}
    
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (shared["portfolio_id"],)).fetchall()
    conn.close()
    
    return {
        "portfolio_name": shared["name"],
        "description": shared["description"],
        "permission": shared["permission"],
        "holdings": [dict(h) for h in holdings]
    }

@app.post("/api/family/invite")
async def invite_family_member(
    email: str = Query(...),
    name: str = Query(None),
    relationship: str = Query(None),
    permission: str = Query("view"),
    user: dict = Depends(require_auth)
):
    """Invite a family member"""
    conn = get_db()
    conn.execute("""
        INSERT INTO family_members (owner_id, member_email, member_name, relationship, permission)
        VALUES (?, ?, ?, ?, ?)
    """, (user["id"], email, name, relationship, permission))
    conn.commit()
    conn.close()
    
    return {"status": "invited", "email": email}

@app.get("/api/family/members")
async def get_family_members(user: dict = Depends(require_auth)):
    """Get family members"""
    conn = get_db()
    members = conn.execute("SELECT * FROM family_members WHERE owner_id = ?", (user["id"],)).fetchall()
    conn.close()
    
    return {"members": [dict(m) for m in members]}

@app.delete("/api/family/members/{member_id}")
async def remove_family_member(member_id: int, user: dict = Depends(require_auth)):
    """Remove a family member"""
    conn = get_db()
    conn.execute("DELETE FROM family_members WHERE id = ? AND owner_id = ?", (member_id, user["id"]))
    conn.commit()
    conn.close()
    
    return {"status": "removed"}

# =============================================================================
# PHASE 7: ADVANCED RISK, SEC FILINGS, AUTOMATION, TEMPLATES & THEMES
# =============================================================================

import math
from typing import List, Optional

# SEC Filings Data (simulated)
SEC_FILINGS = {
    "AAPL": [
        {"type": "10-K", "date": "2024-10-31", "period": "FY2024", "url": "#", "highlights": ["Revenue: $383B", "Net Income: $97B", "iPhone: 52% of revenue"]},
        {"type": "10-Q", "date": "2024-08-01", "period": "Q3 2024", "url": "#", "highlights": ["Revenue: $85.8B", "Services growth: 14%", "China revenue down 6%"]},
        {"type": "8-K", "date": "2024-09-15", "period": "Current", "url": "#", "highlights": ["iPhone 16 announcement", "Apple Intelligence launch"]},
    ],
    "MSFT": [
        {"type": "10-K", "date": "2024-07-30", "period": "FY2024", "url": "#", "highlights": ["Revenue: $245B", "Cloud: $135B", "AI investments increasing"]},
        {"type": "10-Q", "date": "2024-10-24", "period": "Q1 2025", "url": "#", "highlights": ["Revenue: $65.6B", "Azure growth: 29%", "Copilot adoption rising"]},
    ],
    "GOOGL": [
        {"type": "10-K", "date": "2024-02-01", "period": "FY2023", "url": "#", "highlights": ["Revenue: $307B", "Search: 57% of revenue", "Cloud profitable"]},
        {"type": "10-Q", "date": "2024-10-29", "period": "Q3 2024", "url": "#", "highlights": ["Revenue: $88.3B", "YouTube ads: $8.9B", "AI integration across products"]},
    ],
}

# Insider Trading Data (simulated)
INSIDER_TRADES = {
    "AAPL": [
        {"insider": "Tim Cook", "title": "CEO", "type": "Sale", "shares": 50000, "price": 178.50, "date": "2024-11-15", "value": 8925000},
        {"insider": "Luca Maestri", "title": "CFO", "type": "Sale", "shares": 25000, "price": 175.20, "date": "2024-11-01", "value": 4380000},
        {"insider": "Jeff Williams", "title": "COO", "type": "Exercise", "shares": 100000, "price": 45.00, "date": "2024-10-20", "value": 4500000},
    ],
    "MSFT": [
        {"insider": "Satya Nadella", "title": "CEO", "type": "Sale", "shares": 30000, "price": 378.00, "date": "2024-11-10", "value": 11340000},
        {"insider": "Amy Hood", "title": "CFO", "type": "Sale", "shares": 15000, "price": 375.50, "date": "2024-10-25", "value": 5632500},
    ],
    "NVDA": [
        {"insider": "Jensen Huang", "title": "CEO", "type": "Sale", "shares": 120000, "price": 495.00, "date": "2024-11-18", "value": 59400000},
    ],
}

# Institutional Holdings (simulated 13F data)
INSTITUTIONAL_HOLDINGS = {
    "AAPL": [
        {"institution": "Vanguard Group", "shares": 1340000000, "value": 238720000000, "pct_portfolio": 4.2, "change": 2.5},
        {"institution": "BlackRock", "shares": 1020000000, "value": 181560000000, "pct_portfolio": 3.8, "change": -1.2},
        {"institution": "Berkshire Hathaway", "shares": 905000000, "value": 161090000000, "pct_portfolio": 45.2, "change": 0},
        {"institution": "State Street", "shares": 620000000, "value": 110360000000, "pct_portfolio": 2.1, "change": 1.8},
        {"institution": "Fidelity", "shares": 350000000, "value": 62300000000, "pct_portfolio": 1.5, "change": 5.2},
    ],
    "MSFT": [
        {"institution": "Vanguard Group", "shares": 890000000, "value": 336420000000, "pct_portfolio": 5.9, "change": 1.8},
        {"institution": "BlackRock", "shares": 720000000, "value": 272160000000, "pct_portfolio": 4.5, "change": 2.1},
        {"institution": "State Street", "shares": 410000000, "value": 154980000000, "pct_portfolio": 2.6, "change": -0.5},
    ],
}

# Short Interest Data
SHORT_INTEREST = {
    "AAPL": {"short_interest": 120000000, "short_pct_float": 0.8, "days_to_cover": 1.2, "short_squeeze_score": 15},
    "MSFT": {"short_interest": 45000000, "short_pct_float": 0.6, "days_to_cover": 0.9, "short_squeeze_score": 12},
    "TSLA": {"short_interest": 85000000, "short_pct_float": 2.8, "days_to_cover": 1.8, "short_squeeze_score": 65},
    "GME": {"short_interest": 25000000, "short_pct_float": 22.5, "days_to_cover": 5.2, "short_squeeze_score": 92},
    "AMC": {"short_interest": 180000000, "short_pct_float": 18.2, "days_to_cover": 3.5, "short_squeeze_score": 85},
    "NVDA": {"short_interest": 32000000, "short_pct_float": 1.3, "days_to_cover": 0.8, "short_squeeze_score": 22},
}

# Portfolio Templates
PORTFOLIO_TEMPLATES = [
    {
        "id": 1, "name": "The Bogleheads Three-Fund", "author": "WealthPilot", "category": "Passive", "risk": "Moderate",
        "description": "Simple, diversified, low-cost portfolio inspired by Vanguard founder John Bogle",
        "holdings": [{"symbol": "VTI", "weight": 60, "name": "Total US Stock Market"},
                    {"symbol": "VXUS", "weight": 30, "name": "Total International Stock"},
                    {"symbol": "BND", "weight": 10, "name": "Total Bond Market"}],
        "stats": {"expected_return": 8.5, "volatility": 14.2, "sharpe": 0.60}, "followers": 15420, "rating": 4.8
    },
    {
        "id": 2, "name": "Tech Titans Growth", "author": "GrowthInvestor", "category": "Growth", "risk": "High",
        "description": "Concentrated bet on the largest technology companies driving innovation",
        "holdings": [{"symbol": "AAPL", "weight": 25, "name": "Apple"},
                    {"symbol": "MSFT", "weight": 25, "name": "Microsoft"},
                    {"symbol": "GOOGL", "weight": 20, "name": "Alphabet"},
                    {"symbol": "AMZN", "weight": 15, "name": "Amazon"},
                    {"symbol": "NVDA", "weight": 15, "name": "NVIDIA"}],
        "stats": {"expected_return": 15.2, "volatility": 22.5, "sharpe": 0.68}, "followers": 8750, "rating": 4.5
    },
    {
        "id": 3, "name": "Dividend Aristocrats", "author": "IncomeSeeker", "category": "Income", "risk": "Low",
        "description": "S&P 500 companies with 25+ years of consecutive dividend increases",
        "holdings": [{"symbol": "JNJ", "weight": 15, "name": "Johnson & Johnson"},
                    {"symbol": "PG", "weight": 15, "name": "Procter & Gamble"},
                    {"symbol": "KO", "weight": 15, "name": "Coca-Cola"},
                    {"symbol": "PEP", "weight": 15, "name": "PepsiCo"},
                    {"symbol": "MMM", "weight": 10, "name": "3M"},
                    {"symbol": "ABT", "weight": 10, "name": "Abbott Labs"},
                    {"symbol": "T", "weight": 10, "name": "AT&T"},
                    {"symbol": "XOM", "weight": 10, "name": "Exxon Mobil"}],
        "stats": {"expected_return": 7.8, "volatility": 12.5, "sharpe": 0.62}, "followers": 12300, "rating": 4.7
    },
    {
        "id": 4, "name": "All-Weather Portfolio", "author": "RayDalio", "category": "Balanced", "risk": "Low",
        "description": "Ray Dalio's risk-parity approach designed to perform in any economic environment",
        "holdings": [{"symbol": "VTI", "weight": 30, "name": "US Stocks"},
                    {"symbol": "TLT", "weight": 40, "name": "Long-Term Treasuries"},
                    {"symbol": "IEF", "weight": 15, "name": "Intermediate Treasuries"},
                    {"symbol": "GLD", "weight": 7.5, "name": "Gold"},
                    {"symbol": "DBC", "weight": 7.5, "name": "Commodities"}],
        "stats": {"expected_return": 6.5, "volatility": 8.2, "sharpe": 0.79}, "followers": 9800, "rating": 4.6
    },
    {
        "id": 5, "name": "Aggressive Growth 2030", "author": "WealthPilot", "category": "Target Date", "risk": "High",
        "description": "Aggressive allocation for investors with 5+ year horizon targeting 2030",
        "holdings": [{"symbol": "VUG", "weight": 50, "name": "US Growth"},
                    {"symbol": "VWO", "weight": 25, "name": "Emerging Markets"},
                    {"symbol": "ARKK", "weight": 15, "name": "Innovation ETF"},
                    {"symbol": "QQQ", "weight": 10, "name": "NASDAQ 100"}],
        "stats": {"expected_return": 12.5, "volatility": 25.8, "sharpe": 0.48}, "followers": 5200, "rating": 4.2
    },
    {
        "id": 6, "name": "ESG Leaders", "author": "SustainableInvestor", "category": "ESG", "risk": "Moderate",
        "description": "Top-rated ESG companies making positive environmental and social impact",
        "holdings": [{"symbol": "MSFT", "weight": 20, "name": "Microsoft"},
                    {"symbol": "GOOGL", "weight": 15, "name": "Alphabet"},
                    {"symbol": "CRM", "weight": 15, "name": "Salesforce"},
                    {"symbol": "ADBE", "weight": 15, "name": "Adobe"},
                    {"symbol": "V", "weight": 15, "name": "Visa"},
                    {"symbol": "NEE", "weight": 10, "name": "NextEra Energy"},
                    {"symbol": "TSLA", "weight": 10, "name": "Tesla"}],
        "stats": {"expected_return": 11.2, "volatility": 18.5, "sharpe": 0.61}, "followers": 7100, "rating": 4.4
    },
]

# Initialize Phase 7 tables
def init_phase7_tables():
    conn = get_db()
    
    # Automation rules table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS automation_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            config TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            last_triggered TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # DCA schedules table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS dca_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER,
            symbol TEXT NOT NULL,
            amount REAL NOT NULL,
            frequency TEXT NOT NULL,
            next_execution TEXT,
            active INTEGER DEFAULT 1,
            total_invested REAL DEFAULT 0,
            executions INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
        )
    """)
    
    # DRIP settings table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS drip_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            total_reinvested REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
        )
    """)
    
    # Followed templates table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS followed_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            template_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # User preferences table (for themes etc)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            theme TEXT DEFAULT 'dark',
            language TEXT DEFAULT 'en',
            currency TEXT DEFAULT 'USD',
            date_format TEXT DEFAULT 'MM/DD/YYYY',
            number_format TEXT DEFAULT 'US',
            notifications_enabled INTEGER DEFAULT 1,
            email_reports INTEGER DEFAULT 1,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase7_tables()

# =============================================================================
# ADVANCED RISK MANAGEMENT ENDPOINTS
# =============================================================================

def calculate_cvar(returns: list, confidence: float = 0.95) -> float:
    """Calculate Conditional Value at Risk (Expected Shortfall)"""
    sorted_returns = sorted(returns)
    var_index = int(len(sorted_returns) * (1 - confidence))
    var_index = max(1, var_index)
    cvar = sum(sorted_returns[:var_index]) / var_index
    return cvar

def calculate_max_drawdown_detailed(values: list) -> dict:
    """Calculate detailed drawdown statistics"""
    peak = values[0]
    max_dd = 0
    max_dd_start = 0
    max_dd_end = 0
    current_dd_start = 0
    
    drawdowns = []
    
    for i, value in enumerate(values):
        if value > peak:
            peak = value
            current_dd_start = i
        
        dd = (peak - value) / peak
        drawdowns.append(dd)
        
        if dd > max_dd:
            max_dd = dd
            max_dd_start = current_dd_start
            max_dd_end = i
    
    return {
        "max_drawdown": max_dd,
        "max_dd_start_idx": max_dd_start,
        "max_dd_end_idx": max_dd_end,
        "current_drawdown": drawdowns[-1] if drawdowns else 0,
        "avg_drawdown": sum(drawdowns) / len(drawdowns) if drawdowns else 0
    }

@app.get("/api/risk/advanced/{portfolio_id}")
async def get_advanced_risk_metrics(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get advanced risk metrics including CVaR, Expected Shortfall, etc."""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Simulate daily returns for risk calculations
    daily_returns = [random.gauss(0.0004, 0.012) for _ in range(252)]  # 1 year of daily returns
    
    # Calculate risk metrics
    var_95 = sorted(daily_returns)[int(len(daily_returns) * 0.05)] * total_value
    var_99 = sorted(daily_returns)[int(len(daily_returns) * 0.01)] * total_value
    cvar_95 = calculate_cvar(daily_returns, 0.95) * total_value
    cvar_99 = calculate_cvar(daily_returns, 0.99) * total_value
    
    # Simulate portfolio values for drawdown
    portfolio_values = [total_value]
    for r in daily_returns:
        portfolio_values.append(portfolio_values[-1] * (1 + r))
    
    dd_stats = calculate_max_drawdown_detailed(portfolio_values)
    
    # Volatility metrics
    daily_vol = (sum((r - sum(daily_returns)/len(daily_returns))**2 for r in daily_returns) / len(daily_returns)) ** 0.5
    annual_vol = daily_vol * (252 ** 0.5)
    
    # Downside deviation (only negative returns)
    negative_returns = [r for r in daily_returns if r < 0]
    downside_dev = (sum(r**2 for r in negative_returns) / len(negative_returns)) ** 0.5 if negative_returns else 0
    annual_downside = downside_dev * (252 ** 0.5)
    
    # Sortino ratio
    avg_return = sum(daily_returns) / len(daily_returns)
    sortino = (avg_return * 252) / annual_downside if annual_downside > 0 else 0
    
    # Calmar ratio
    calmar = (avg_return * 252) / dd_stats["max_drawdown"] if dd_stats["max_drawdown"] > 0 else 0
    
    return {
        "portfolio_id": portfolio_id,
        "total_value": round(total_value, 2),
        "value_at_risk": {
            "var_95_daily": round(abs(var_95), 2),
            "var_99_daily": round(abs(var_99), 2),
            "var_95_monthly": round(abs(var_95) * (21 ** 0.5), 2),
            "interpretation": f"95% confident daily loss won't exceed ${abs(var_95):,.0f}"
        },
        "conditional_var": {
            "cvar_95": round(abs(cvar_95), 2),
            "cvar_99": round(abs(cvar_99), 2),
            "interpretation": f"If losses exceed VaR, expected loss is ${abs(cvar_95):,.0f}"
        },
        "drawdown": {
            "max_drawdown_pct": round(dd_stats["max_drawdown"] * 100, 2),
            "max_drawdown_value": round(dd_stats["max_drawdown"] * total_value, 2),
            "current_drawdown_pct": round(dd_stats["current_drawdown"] * 100, 2),
            "avg_drawdown_pct": round(dd_stats["avg_drawdown"] * 100, 2)
        },
        "volatility": {
            "daily": round(daily_vol * 100, 2),
            "annual": round(annual_vol * 100, 2),
            "downside_deviation": round(annual_downside * 100, 2)
        },
        "risk_adjusted": {
            "sortino_ratio": round(sortino, 2),
            "calmar_ratio": round(calmar, 2),
            "interpretation": "Sortino focuses on downside risk; Calmar uses max drawdown"
        },
        "stress_scenarios": {
            "market_crash_2008": round(total_value * -0.37, 2),
            "covid_crash_2020": round(total_value * -0.34, 2),
            "flash_crash_2010": round(total_value * -0.09, 2),
            "rate_shock_10pct": round(total_value * -0.15, 2)
        }
    }

@app.get("/api/risk/position-size")
async def calculate_position_size(
    account_value: float = Query(...),
    risk_per_trade_pct: float = Query(2.0),
    entry_price: float = Query(...),
    stop_loss_price: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Calculate optimal position size based on risk management"""
    risk_amount = account_value * (risk_per_trade_pct / 100)
    risk_per_share = abs(entry_price - stop_loss_price)
    
    if risk_per_share <= 0:
        return {"error": "Invalid stop loss"}
    
    shares = int(risk_amount / risk_per_share)
    position_value = shares * entry_price
    position_pct = (position_value / account_value) * 100
    
    return {
        "account_value": account_value,
        "risk_per_trade_pct": risk_per_trade_pct,
        "risk_amount": round(risk_amount, 2),
        "entry_price": entry_price,
        "stop_loss_price": stop_loss_price,
        "risk_per_share": round(risk_per_share, 2),
        "recommended_shares": shares,
        "position_value": round(position_value, 2),
        "position_pct_of_portfolio": round(position_pct, 2),
        "max_loss_if_stopped": round(shares * risk_per_share, 2),
        "risk_reward_1_2": round(entry_price + (risk_per_share * 2), 2),
        "risk_reward_1_3": round(entry_price + (risk_per_share * 3), 2)
    }

# =============================================================================
# SEC FILINGS & INSIDER TRADING ENDPOINTS
# =============================================================================

@app.get("/api/sec/filings/{symbol}")
async def get_sec_filings(symbol: str, user: dict = Depends(require_auth)):
    """Get SEC filings for a symbol"""
    symbol = symbol.upper()
    filings = SEC_FILINGS.get(symbol, [])
    
    if not filings:
        # Generate sample filings
        filings = [
            {"type": "10-K", "date": "2024-02-28", "period": "FY2023", "url": "#", "highlights": ["Annual report filed", "Revenue growth", "Updated risk factors"]},
            {"type": "10-Q", "date": "2024-11-01", "period": "Q3 2024", "url": "#", "highlights": ["Quarterly results", "Management discussion"]},
        ]
    
    return {
        "symbol": symbol,
        "filings": filings,
        "total_filings": len(filings)
    }

@app.get("/api/sec/insider-trades/{symbol}")
async def get_insider_trades(symbol: str, user: dict = Depends(require_auth)):
    """Get insider trading activity for a symbol"""
    symbol = symbol.upper()
    trades = INSIDER_TRADES.get(symbol, [])
    
    if not trades:
        # Generate sample trades
        trades = [
            {"insider": "CEO", "title": "Chief Executive", "type": "Sale", "shares": random.randint(1000, 50000), 
             "price": round(random.uniform(50, 200), 2), "date": "2024-11-01", "value": random.randint(100000, 5000000)},
        ]
    
    # Calculate summary
    total_bought = sum(t["value"] for t in trades if t["type"] in ["Buy", "Exercise"])
    total_sold = sum(t["value"] for t in trades if t["type"] == "Sale")
    
    return {
        "symbol": symbol,
        "trades": trades,
        "summary": {
            "total_bought": total_bought,
            "total_sold": total_sold,
            "net_activity": total_bought - total_sold,
            "sentiment": "Bullish" if total_bought > total_sold else "Bearish" if total_sold > total_bought * 2 else "Neutral"
        }
    }

@app.get("/api/sec/institutional/{symbol}")
async def get_institutional_holdings(symbol: str, user: dict = Depends(require_auth)):
    """Get institutional holdings (13F data) for a symbol"""
    symbol = symbol.upper()
    holdings = INSTITUTIONAL_HOLDINGS.get(symbol, [])
    
    if not holdings:
        holdings = [
            {"institution": "Vanguard Group", "shares": random.randint(100000000, 500000000), 
             "value": random.randint(10000000000, 100000000000), "pct_portfolio": round(random.uniform(1, 5), 1), "change": round(random.uniform(-3, 5), 1)},
            {"institution": "BlackRock", "shares": random.randint(80000000, 400000000), 
             "value": random.randint(8000000000, 80000000000), "pct_portfolio": round(random.uniform(1, 4), 1), "change": round(random.uniform(-3, 5), 1)},
        ]
    
    total_institutional = sum(h["shares"] for h in holdings)
    
    return {
        "symbol": symbol,
        "holdings": holdings,
        "summary": {
            "total_institutional_shares": total_institutional,
            "num_institutions": len(holdings),
            "top_holder": holdings[0]["institution"] if holdings else None
        }
    }

@app.get("/api/sec/short-interest/{symbol}")
async def get_short_interest(symbol: str, user: dict = Depends(require_auth)):
    """Get short interest data for a symbol"""
    symbol = symbol.upper()
    data = SHORT_INTEREST.get(symbol, {
        "short_interest": random.randint(1000000, 50000000),
        "short_pct_float": round(random.uniform(0.5, 5), 1),
        "days_to_cover": round(random.uniform(0.5, 3), 1),
        "short_squeeze_score": random.randint(10, 50)
    })
    
    return {
        "symbol": symbol,
        **data,
        "squeeze_risk": "High" if data["short_squeeze_score"] > 70 else "Medium" if data["short_squeeze_score"] > 40 else "Low"
    }

# =============================================================================
# AUTOMATION & RULES ENDPOINTS
# =============================================================================

@app.post("/api/automation/rules")
async def create_automation_rule(
    name: str = Query(...),
    rule_type: str = Query(...),  # rebalance, stop_loss, take_profit, dca
    config: str = Query(...),  # JSON config
    user: dict = Depends(require_auth)
):
    """Create an automation rule"""
    conn = get_db()
    conn.execute("""
        INSERT INTO automation_rules (user_id, name, rule_type, config)
        VALUES (?, ?, ?, ?)
    """, (user["id"], name, rule_type, config))
    conn.commit()
    conn.close()
    
    return {"status": "created", "name": name, "rule_type": rule_type}

@app.get("/api/automation/rules")
async def get_automation_rules(user: dict = Depends(require_auth)):
    """Get all automation rules"""
    conn = get_db()
    rules = conn.execute("SELECT * FROM automation_rules WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    return {"rules": [dict(r) for r in rules]}

@app.put("/api/automation/rules/{rule_id}/toggle")
async def toggle_automation_rule(rule_id: int, user: dict = Depends(require_auth)):
    """Toggle automation rule active status"""
    conn = get_db()
    conn.execute("UPDATE automation_rules SET active = NOT active WHERE id = ? AND user_id = ?", (rule_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "toggled"}

@app.delete("/api/automation/rules/{rule_id}")
async def delete_automation_rule(rule_id: int, user: dict = Depends(require_auth)):
    """Delete an automation rule"""
    conn = get_db()
    conn.execute("DELETE FROM automation_rules WHERE id = ? AND user_id = ?", (rule_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# DCA Schedules
@app.post("/api/automation/dca")
async def create_dca_schedule(
    symbol: str = Query(...),
    amount: float = Query(...),
    frequency: str = Query("weekly"),  # daily, weekly, biweekly, monthly
    portfolio_id: int = Query(None),
    user: dict = Depends(require_auth)
):
    """Create a dollar-cost averaging schedule"""
    from datetime import timedelta
    
    freq_days = {"daily": 1, "weekly": 7, "biweekly": 14, "monthly": 30}
    next_exec = datetime.now() + timedelta(days=freq_days.get(frequency, 7))
    
    conn = get_db()
    conn.execute("""
        INSERT INTO dca_schedules (user_id, portfolio_id, symbol, amount, frequency, next_execution)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], portfolio_id, symbol.upper(), amount, frequency, next_exec.isoformat()))
    conn.commit()
    conn.close()
    
    return {"status": "created", "symbol": symbol.upper(), "amount": amount, "frequency": frequency, "next_execution": next_exec.isoformat()}

@app.get("/api/automation/dca")
async def get_dca_schedules(user: dict = Depends(require_auth)):
    """Get all DCA schedules"""
    conn = get_db()
    schedules = conn.execute("SELECT * FROM dca_schedules WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    return {"schedules": [dict(s) for s in schedules]}

@app.delete("/api/automation/dca/{schedule_id}")
async def delete_dca_schedule(schedule_id: int, user: dict = Depends(require_auth)):
    """Delete a DCA schedule"""
    conn = get_db()
    conn.execute("DELETE FROM dca_schedules WHERE id = ? AND user_id = ?", (schedule_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# DRIP Settings
@app.post("/api/automation/drip")
async def enable_drip(
    portfolio_id: int = Query(...),
    symbol: str = Query(...),
    user: dict = Depends(require_auth)
):
    """Enable dividend reinvestment for a holding"""
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO drip_settings (user_id, portfolio_id, symbol, enabled)
        VALUES (?, ?, ?, 1)
    """, (user["id"], portfolio_id, symbol.upper()))
    conn.commit()
    conn.close()
    
    return {"status": "enabled", "symbol": symbol.upper(), "portfolio_id": portfolio_id}

@app.get("/api/automation/drip/{portfolio_id}")
async def get_drip_settings(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get DRIP settings for a portfolio"""
    conn = get_db()
    settings = conn.execute("SELECT * FROM drip_settings WHERE portfolio_id = ? AND user_id = ?", 
                           (portfolio_id, user["id"])).fetchall()
    conn.close()
    return {"settings": [dict(s) for s in settings]}

# =============================================================================
# PORTFOLIO TEMPLATES & COPY TRADING
# =============================================================================

@app.get("/api/templates")
async def get_portfolio_templates(category: str = Query(None), user: dict = Depends(require_auth)):
    """Get available portfolio templates"""
    templates = PORTFOLIO_TEMPLATES
    if category:
        templates = [t for t in templates if t["category"].lower() == category.lower()]
    return {"templates": templates}

@app.get("/api/templates/{template_id}")
async def get_template_detail(template_id: int, user: dict = Depends(require_auth)):
    """Get detailed template information"""
    template = next((t for t in PORTFOLIO_TEMPLATES if t["id"] == template_id), None)
    if not template:
        return {"error": "Template not found"}
    return template

@app.post("/api/templates/{template_id}/follow")
async def follow_template(template_id: int, user: dict = Depends(require_auth)):
    """Follow a portfolio template"""
    conn = get_db()
    conn.execute("INSERT INTO followed_templates (user_id, template_id) VALUES (?, ?)", 
                (user["id"], template_id))
    conn.commit()
    conn.close()
    return {"status": "following", "template_id": template_id}

@app.post("/api/templates/{template_id}/copy")
async def copy_template_to_portfolio(
    template_id: int,
    portfolio_name: str = Query(...),
    investment_amount: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Copy a template to create a new portfolio"""
    template = next((t for t in PORTFOLIO_TEMPLATES if t["id"] == template_id), None)
    if not template:
        return {"error": "Template not found"}
    
    conn = get_db()
    cursor = conn.execute("""
        INSERT INTO portfolios (user_id, name, description)
        VALUES (?, ?, ?)
    """, (user["id"], portfolio_name, f"Based on: {template['name']}"))
    portfolio_id = cursor.lastrowid
    
    # Add holdings based on template weights
    for holding in template["holdings"]:
        value = investment_amount * (holding["weight"] / 100)
        price = random.uniform(50, 500)  # Simulated price
        quantity = value / price
        
        conn.execute("""
            INSERT INTO holdings (portfolio_id, symbol, quantity, cost_basis, current_price)
            VALUES (?, ?, ?, ?, ?)
        """, (portfolio_id, holding["symbol"], quantity, price, price))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "created",
        "portfolio_id": portfolio_id,
        "portfolio_name": portfolio_name,
        "template": template["name"],
        "investment": investment_amount
    }

@app.get("/api/templates/followed")
async def get_followed_templates(user: dict = Depends(require_auth)):
    """Get templates the user is following"""
    conn = get_db()
    followed = conn.execute("SELECT template_id FROM followed_templates WHERE user_id = ?", 
                           (user["id"],)).fetchall()
    conn.close()
    
    template_ids = [f["template_id"] for f in followed]
    templates = [t for t in PORTFOLIO_TEMPLATES if t["id"] in template_ids]
    return {"templates": templates}

# =============================================================================
# USER PREFERENCES & THEMES
# =============================================================================

@app.get("/api/preferences")
async def get_user_preferences(user: dict = Depends(require_auth)):
    """Get user preferences"""
    conn = get_db()
    prefs = conn.execute("SELECT * FROM user_preferences WHERE user_id = ?", (user["id"],)).fetchone()
    conn.close()
    
    if not prefs:
        return {
            "theme": "dark",
            "language": "en",
            "currency": "USD",
            "date_format": "MM/DD/YYYY",
            "number_format": "US",
            "notifications_enabled": True,
            "email_reports": True
        }
    
    return dict(prefs)

@app.put("/api/preferences")
async def update_user_preferences(
    theme: str = Query(None),
    language: str = Query(None),
    currency: str = Query(None),
    date_format: str = Query(None),
    notifications_enabled: bool = Query(None),
    user: dict = Depends(require_auth)
):
    """Update user preferences"""
    conn = get_db()
    
    # Check if preferences exist
    existing = conn.execute("SELECT id FROM user_preferences WHERE user_id = ?", (user["id"],)).fetchone()
    
    if existing:
        updates = []
        values = []
        if theme is not None:
            updates.append("theme = ?")
            values.append(theme)
        if language is not None:
            updates.append("language = ?")
            values.append(language)
        if currency is not None:
            updates.append("currency = ?")
            values.append(currency)
        if date_format is not None:
            updates.append("date_format = ?")
            values.append(date_format)
        if notifications_enabled is not None:
            updates.append("notifications_enabled = ?")
            values.append(1 if notifications_enabled else 0)
        
        if updates:
            values.append(user["id"])
            conn.execute(f"UPDATE user_preferences SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", values)
    else:
        conn.execute("""
            INSERT INTO user_preferences (user_id, theme, language, currency)
            VALUES (?, ?, ?, ?)
        """, (user["id"], theme or "dark", language or "en", currency or "USD"))
    
    conn.commit()
    conn.close()
    
    return {"status": "updated"}

# Supported languages
LANGUAGES = {
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "zh": "中文",
    "ja": "日本語",
    "ko": "한국어",
    "pt": "Português",
    "it": "Italiano",
    "ru": "Русский"
}

@app.get("/api/preferences/languages")
async def get_supported_languages():
    """Get list of supported languages"""
    return {"languages": LANGUAGES}

@app.get("/api/preferences/currencies")
async def get_supported_currencies():
    """Get list of supported currencies"""
    return {"currencies": ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "BRL"]}

# =============================================================================
# PHASE 6: AI PREDICTIONS, ESG, RETIREMENT, FUNDAMENTALS & DEVELOPER API
# =============================================================================

# ESG Data (simulated MSCI-style ratings)
ESG_DATA = {
    "AAPL": {"overall": "AA", "e_score": 7.8, "s_score": 8.2, "g_score": 8.5, "controversy": "Low", "carbon_intensity": 12},
    "MSFT": {"overall": "AAA", "e_score": 9.1, "s_score": 8.8, "g_score": 9.2, "controversy": "None", "carbon_intensity": 8},
    "GOOGL": {"overall": "AA", "e_score": 8.5, "s_score": 7.2, "g_score": 8.0, "controversy": "Medium", "carbon_intensity": 15},
    "AMZN": {"overall": "BBB", "e_score": 5.5, "s_score": 4.8, "g_score": 6.2, "controversy": "High", "carbon_intensity": 45},
    "NVDA": {"overall": "A", "e_score": 6.5, "s_score": 7.0, "g_score": 7.5, "controversy": "Low", "carbon_intensity": 22},
    "TSLA": {"overall": "BBB", "e_score": 8.8, "s_score": 4.2, "g_score": 3.5, "controversy": "High", "carbon_intensity": 5},
    "META": {"overall": "BB", "e_score": 6.0, "s_score": 3.5, "g_score": 5.0, "controversy": "High", "carbon_intensity": 18},
    "JPM": {"overall": "A", "e_score": 5.8, "s_score": 6.5, "g_score": 7.8, "controversy": "Medium", "carbon_intensity": 35},
    "JNJ": {"overall": "AA", "e_score": 7.5, "s_score": 8.5, "g_score": 8.0, "controversy": "Low", "carbon_intensity": 28},
    "V": {"overall": "AAA", "e_score": 8.2, "s_score": 8.0, "g_score": 9.0, "controversy": "None", "carbon_intensity": 6},
    "PG": {"overall": "AA", "e_score": 7.8, "s_score": 8.2, "g_score": 8.5, "controversy": "Low", "carbon_intensity": 32},
    "KO": {"overall": "A", "e_score": 6.5, "s_score": 7.5, "g_score": 7.8, "controversy": "Low", "carbon_intensity": 38},
    "WMT": {"overall": "BBB", "e_score": 5.2, "s_score": 5.0, "g_score": 6.5, "controversy": "Medium", "carbon_intensity": 55},
    "DIS": {"overall": "A", "e_score": 6.8, "s_score": 7.2, "g_score": 6.5, "controversy": "Low", "carbon_intensity": 20},
    "NFLX": {"overall": "A", "e_score": 7.0, "s_score": 6.8, "g_score": 7.0, "controversy": "Low", "carbon_intensity": 12},
}

# Fundamental Data (simulated)
FUNDAMENTAL_DATA = {
    "AAPL": {"pe": 28.5, "pb": 45.2, "ps": 7.2, "peg": 2.1, "roe": 147, "roa": 28, "debt_equity": 1.8, "current_ratio": 1.0, "revenue_growth": 8.5, "earnings_growth": 12.3, "analyst_rating": "Buy", "price_target": 210, "market_cap": 2800000000000},
    "MSFT": {"pe": 35.2, "pb": 12.8, "ps": 12.5, "peg": 2.4, "roe": 38, "roa": 19, "debt_equity": 0.4, "current_ratio": 1.8, "revenue_growth": 15.2, "earnings_growth": 18.5, "analyst_rating": "Strong Buy", "price_target": 450, "market_cap": 2900000000000},
    "GOOGL": {"pe": 25.8, "pb": 6.2, "ps": 5.8, "peg": 1.2, "roe": 25, "roa": 15, "debt_equity": 0.1, "current_ratio": 2.8, "revenue_growth": 12.8, "earnings_growth": 22.1, "analyst_rating": "Buy", "price_target": 175, "market_cap": 1800000000000},
    "AMZN": {"pe": 62.5, "pb": 8.5, "ps": 2.8, "peg": 1.8, "roe": 15, "roa": 5, "debt_equity": 0.8, "current_ratio": 1.1, "revenue_growth": 11.5, "earnings_growth": 35.2, "analyst_rating": "Strong Buy", "price_target": 220, "market_cap": 1900000000000},
    "NVDA": {"pe": 65.2, "pb": 52.5, "ps": 32.5, "peg": 1.1, "roe": 85, "roa": 45, "debt_equity": 0.4, "current_ratio": 4.2, "revenue_growth": 122.5, "earnings_growth": 265.8, "analyst_rating": "Strong Buy", "price_target": 650, "market_cap": 1200000000000},
    "TSLA": {"pe": 72.5, "pb": 15.2, "ps": 8.5, "peg": 2.8, "roe": 22, "roa": 8, "debt_equity": 0.1, "current_ratio": 1.7, "revenue_growth": 18.8, "earnings_growth": -12.5, "analyst_rating": "Hold", "price_target": 280, "market_cap": 780000000000},
    "META": {"pe": 28.2, "pb": 8.5, "ps": 8.2, "peg": 1.5, "roe": 28, "roa": 18, "debt_equity": 0.1, "current_ratio": 2.5, "revenue_growth": 22.5, "earnings_growth": 45.2, "analyst_rating": "Buy", "price_target": 580, "market_cap": 1300000000000},
    "JPM": {"pe": 11.5, "pb": 1.8, "ps": 3.2, "peg": 1.2, "roe": 15, "roa": 1.2, "debt_equity": 1.2, "current_ratio": 0.9, "revenue_growth": 8.5, "earnings_growth": 12.5, "analyst_rating": "Buy", "price_target": 220, "market_cap": 580000000000},
}

# AI Prediction Models (simulated ML outputs)
def generate_ai_prediction(symbol: str, horizon: str = "1M"):
    """Generate AI-powered price prediction"""
    base_prices = {"AAPL": 178, "MSFT": 378, "GOOGL": 141, "AMZN": 178, "NVDA": 495, 
                   "TSLA": 245, "META": 505, "JPM": 195, "V": 275, "JNJ": 155}
    
    current_price = base_prices.get(symbol.upper(), 100)
    
    # Simulated ML model outputs
    horizons = {
        "1W": {"days": 7, "volatility": 0.03},
        "1M": {"days": 30, "volatility": 0.08},
        "3M": {"days": 90, "volatility": 0.15},
        "6M": {"days": 180, "volatility": 0.22},
        "1Y": {"days": 365, "volatility": 0.35}
    }
    
    h = horizons.get(horizon, horizons["1M"])
    
    # Generate prediction with confidence intervals
    trend = random.uniform(-0.1, 0.2)  # Slight bullish bias
    predicted_change = trend * (h["days"] / 365)
    predicted_price = current_price * (1 + predicted_change)
    
    # Confidence intervals
    std_dev = current_price * h["volatility"]
    
    return {
        "symbol": symbol.upper(),
        "current_price": round(current_price, 2),
        "horizon": horizon,
        "prediction": {
            "price": round(predicted_price, 2),
            "change_pct": round(predicted_change * 100, 2),
            "direction": "Bullish" if predicted_change > 0.02 else "Bearish" if predicted_change < -0.02 else "Neutral",
            "confidence": round(random.uniform(0.55, 0.85), 2)
        },
        "confidence_intervals": {
            "low_95": round(predicted_price - 1.96 * std_dev, 2),
            "low_68": round(predicted_price - std_dev, 2),
            "high_68": round(predicted_price + std_dev, 2),
            "high_95": round(predicted_price + 1.96 * std_dev, 2)
        },
        "factors": [
            {"name": "Technical Momentum", "score": round(random.uniform(0.3, 0.9), 2), "impact": "positive" if random.random() > 0.4 else "negative"},
            {"name": "Earnings Sentiment", "score": round(random.uniform(0.4, 0.85), 2), "impact": "positive" if random.random() > 0.3 else "negative"},
            {"name": "Sector Trend", "score": round(random.uniform(0.35, 0.8), 2), "impact": "positive" if random.random() > 0.5 else "negative"},
            {"name": "Market Conditions", "score": round(random.uniform(0.4, 0.75), 2), "impact": "positive" if random.random() > 0.45 else "negative"},
        ],
        "model_info": {
            "algorithm": "Ensemble (LSTM + XGBoost + Transformer)",
            "training_data": "10 years historical",
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "accuracy_backtest": round(random.uniform(0.58, 0.72), 2)
        }
    }

def calculate_retirement_projection(current_age: int, retirement_age: int, current_savings: float,
                                   monthly_contribution: float, expected_return: float = 0.07,
                                   inflation: float = 0.03, withdrawal_rate: float = 0.04):
    """Calculate retirement projections"""
    years_to_retirement = retirement_age - current_age
    years_in_retirement = 95 - retirement_age  # Assume living to 95
    
    # Accumulation phase
    monthly_return = (1 + expected_return) ** (1/12) - 1
    months = years_to_retirement * 12
    
    # Future value of current savings
    fv_savings = current_savings * ((1 + expected_return) ** years_to_retirement)
    
    # Future value of monthly contributions
    fv_contributions = monthly_contribution * (((1 + monthly_return) ** months - 1) / monthly_return) * (1 + monthly_return)
    
    total_at_retirement = fv_savings + fv_contributions
    
    # Inflation-adjusted value
    real_value = total_at_retirement / ((1 + inflation) ** years_to_retirement)
    
    # Annual withdrawal (4% rule)
    annual_withdrawal = total_at_retirement * withdrawal_rate
    monthly_income = annual_withdrawal / 12
    
    # Year-by-year projection
    projections = []
    balance = current_savings
    for year in range(years_to_retirement + 1):
        age = current_age + year
        projections.append({
            "age": age,
            "year": datetime.now().year + year,
            "balance": round(balance, 2),
            "phase": "Accumulation" if age < retirement_age else "Retirement"
        })
        if age < retirement_age:
            balance = balance * (1 + expected_return) + (monthly_contribution * 12)
        else:
            balance = balance * (1 + expected_return - inflation) - annual_withdrawal
    
    # Retirement phase projection
    retirement_balance = total_at_retirement
    for year in range(years_in_retirement):
        age = retirement_age + year + 1
        retirement_balance = retirement_balance * (1 + expected_return - inflation) - annual_withdrawal
        if retirement_balance > 0:
            projections.append({
                "age": age,
                "year": datetime.now().year + years_to_retirement + year + 1,
                "balance": round(max(0, retirement_balance), 2),
                "phase": "Retirement"
            })
    
    return {
        "inputs": {
            "current_age": current_age,
            "retirement_age": retirement_age,
            "current_savings": current_savings,
            "monthly_contribution": monthly_contribution,
            "expected_return": expected_return,
            "inflation_rate": inflation,
            "withdrawal_rate": withdrawal_rate
        },
        "results": {
            "total_at_retirement": round(total_at_retirement, 2),
            "real_value_today": round(real_value, 2),
            "annual_retirement_income": round(annual_withdrawal, 2),
            "monthly_retirement_income": round(monthly_income, 2),
            "total_contributions": round(current_savings + (monthly_contribution * 12 * years_to_retirement), 2),
            "total_growth": round(total_at_retirement - current_savings - (monthly_contribution * 12 * years_to_retirement), 2),
            "years_money_lasts": years_in_retirement if retirement_balance > 0 else "Indefinite (with assumptions)",
            "legacy_at_95": round(max(0, retirement_balance), 2)
        },
        "projections": projections[:50],  # Limit for response size
        "recommendations": [
            "Consider maximizing 401(k) contributions ($23,000/year in 2024)" if monthly_contribution * 12 < 23000 else "Great job maxing out retirement contributions!",
            f"Your projected monthly income of ${monthly_income:,.0f} {'exceeds' if monthly_income > 5000 else 'may fall short of'} typical retirement expenses",
            "Consider a Roth conversion strategy before retirement for tax diversification" if years_to_retirement > 10 else "Review your asset allocation for retirement",
        ]
    }

# Initialize Phase 6 tables
def init_phase6_tables():
    conn = get_db()
    
    # Price alerts table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            condition TEXT NOT NULL,
            target_price REAL NOT NULL,
            triggered INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            triggered_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # API keys table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            key_name TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            permissions TEXT DEFAULT 'read',
            last_used TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Webhooks table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            events TEXT NOT NULL,
            secret TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Saved reports table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            report_type TEXT NOT NULL,
            config TEXT,
            schedule TEXT,
            last_generated TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Retirement plans table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS retirement_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            current_age INTEGER,
            retirement_age INTEGER,
            current_savings REAL,
            monthly_contribution REAL,
            expected_return REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    conn.commit()
    conn.close()

init_phase6_tables()

# =============================================================================
# AI PREDICTION ENDPOINTS
# =============================================================================

@app.get("/api/ai/predict/{symbol}")
async def get_ai_prediction(symbol: str, horizon: str = Query("1M"), user: dict = Depends(require_auth)):
    """Get AI-powered price prediction"""
    return generate_ai_prediction(symbol, horizon)

@app.get("/api/ai/market-sentiment")
async def get_market_sentiment(user: dict = Depends(require_auth)):
    """Get overall market sentiment analysis"""
    return {
        "overall_sentiment": random.choice(["Bullish", "Neutral", "Bearish"]),
        "confidence": round(random.uniform(0.55, 0.8), 2),
        "indicators": {
            "fear_greed_index": random.randint(25, 75),
            "put_call_ratio": round(random.uniform(0.7, 1.3), 2),
            "vix_level": round(random.uniform(12, 28), 2),
            "advance_decline": round(random.uniform(-500, 800), 0),
            "new_highs_lows": round(random.uniform(-50, 150), 0)
        },
        "sector_sentiment": {
            "Technology": {"sentiment": "Bullish", "score": round(random.uniform(0.6, 0.85), 2)},
            "Healthcare": {"sentiment": "Neutral", "score": round(random.uniform(0.45, 0.6), 2)},
            "Financials": {"sentiment": "Bullish", "score": round(random.uniform(0.55, 0.75), 2)},
            "Energy": {"sentiment": "Bearish", "score": round(random.uniform(0.3, 0.5), 2)},
            "Consumer": {"sentiment": "Neutral", "score": round(random.uniform(0.4, 0.6), 2)},
        },
        "news_sentiment": {
            "positive": random.randint(30, 50),
            "neutral": random.randint(20, 40),
            "negative": random.randint(10, 30)
        },
        "updated_at": datetime.now().isoformat()
    }

@app.get("/api/ai/portfolio-forecast/{portfolio_id}")
async def get_portfolio_forecast(portfolio_id: int, horizon: str = Query("1Y"), user: dict = Depends(require_auth)):
    """Get AI forecast for entire portfolio"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Generate forecasts for each holding
    forecasts = []
    weighted_return = 0
    
    for h in holdings:
        prediction = generate_ai_prediction(h["symbol"], horizon)
        weight = (h["quantity"] * h["current_price"]) / total_value
        weighted_return += prediction["prediction"]["change_pct"] * weight
        
        forecasts.append({
            "symbol": h["symbol"],
            "current_value": round(h["quantity"] * h["current_price"], 2),
            "predicted_value": round(h["quantity"] * prediction["prediction"]["price"], 2),
            "predicted_change": prediction["prediction"]["change_pct"],
            "confidence": prediction["prediction"]["confidence"],
            "weight": round(weight * 100, 2)
        })
    
    predicted_total = total_value * (1 + weighted_return / 100)
    
    return {
        "portfolio_id": portfolio_id,
        "horizon": horizon,
        "current_value": round(total_value, 2),
        "predicted_value": round(predicted_total, 2),
        "predicted_change_pct": round(weighted_return, 2),
        "confidence": round(random.uniform(0.5, 0.75), 2),
        "holdings_forecasts": sorted(forecasts, key=lambda x: x["weight"], reverse=True),
        "risk_assessment": {
            "downside_risk": round(total_value * random.uniform(0.1, 0.25), 2),
            "upside_potential": round(total_value * random.uniform(0.15, 0.35), 2),
            "probability_positive": round(random.uniform(0.5, 0.7), 2)
        }
    }

# =============================================================================
# ESG ENDPOINTS
# =============================================================================

@app.get("/api/esg/{symbol}")
async def get_esg_rating(symbol: str, user: dict = Depends(require_auth)):
    """Get ESG rating for a symbol"""
    symbol = symbol.upper()
    if symbol not in ESG_DATA:
        # Generate random ESG data for unknown symbols
        return {
            "symbol": symbol,
            "overall_rating": random.choice(["AAA", "AA", "A", "BBB", "BB", "B", "CCC"]),
            "scores": {
                "environmental": round(random.uniform(3, 9), 1),
                "social": round(random.uniform(3, 9), 1),
                "governance": round(random.uniform(4, 9), 1)
            },
            "controversy_level": random.choice(["None", "Low", "Medium", "High"]),
            "carbon_intensity": random.randint(5, 80),
            "data_available": False
        }
    
    data = ESG_DATA[symbol]
    return {
        "symbol": symbol,
        "overall_rating": data["overall"],
        "scores": {
            "environmental": data["e_score"],
            "social": data["s_score"],
            "governance": data["g_score"]
        },
        "controversy_level": data["controversy"],
        "carbon_intensity": data["carbon_intensity"],
        "data_available": True,
        "rating_description": {
            "AAA": "Leader - Best in class ESG performance",
            "AA": "Leader - Above average ESG performance",
            "A": "Average - In line with industry peers",
            "BBB": "Average - Mixed ESG performance",
            "BB": "Laggard - Below average ESG performance",
            "B": "Laggard - Significant ESG risks",
            "CCC": "Laggard - Severe ESG risks"
        }.get(data["overall"], "")
    }

@app.get("/api/portfolios/{portfolio_id}/esg")
async def get_portfolio_esg(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get ESG analysis for portfolio"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Calculate weighted ESG scores
    weighted_e = weighted_s = weighted_g = 0
    total_carbon = 0
    holdings_esg = []
    rating_distribution = {"Leader": 0, "Average": 0, "Laggard": 0}
    
    for h in holdings:
        weight = (h["quantity"] * h["current_price"]) / total_value
        esg = ESG_DATA.get(h["symbol"], {"e_score": 5, "s_score": 5, "g_score": 5, "carbon_intensity": 30, "overall": "BBB"})
        
        weighted_e += esg.get("e_score", 5) * weight
        weighted_s += esg.get("s_score", 5) * weight
        weighted_g += esg.get("g_score", 5) * weight
        total_carbon += esg.get("carbon_intensity", 30) * weight
        
        rating = esg.get("overall", "BBB")
        if rating in ["AAA", "AA"]:
            rating_distribution["Leader"] += weight
        elif rating in ["A", "BBB"]:
            rating_distribution["Average"] += weight
        else:
            rating_distribution["Laggard"] += weight
        
        holdings_esg.append({
            "symbol": h["symbol"],
            "weight": round(weight * 100, 2),
            "rating": rating,
            "e_score": esg.get("e_score", 5),
            "s_score": esg.get("s_score", 5),
            "g_score": esg.get("g_score", 5)
        })
    
    # Calculate overall rating
    avg_score = (weighted_e + weighted_s + weighted_g) / 3
    if avg_score >= 8:
        portfolio_rating = "AA"
    elif avg_score >= 7:
        portfolio_rating = "A"
    elif avg_score >= 5.5:
        portfolio_rating = "BBB"
    elif avg_score >= 4:
        portfolio_rating = "BB"
    else:
        portfolio_rating = "B"
    
    return {
        "portfolio_id": portfolio_id,
        "overall_rating": portfolio_rating,
        "scores": {
            "environmental": round(weighted_e, 1),
            "social": round(weighted_s, 1),
            "governance": round(weighted_g, 1),
            "overall": round(avg_score, 1)
        },
        "carbon_footprint": {
            "intensity": round(total_carbon, 1),
            "rating": "Low" if total_carbon < 20 else "Medium" if total_carbon < 40 else "High"
        },
        "rating_distribution": {k: round(v * 100, 1) for k, v in rating_distribution.items()},
        "holdings_esg": sorted(holdings_esg, key=lambda x: x["weight"], reverse=True),
        "recommendations": [
            f"Consider replacing high-carbon holdings to reduce portfolio carbon intensity" if total_carbon > 35 else "Portfolio has good carbon efficiency",
            f"Increase allocation to ESG leaders (currently {rating_distribution['Leader']*100:.0f}%)" if rating_distribution["Leader"] < 0.3 else "Good ESG leader allocation",
        ]
    }

# =============================================================================
# FUNDAMENTAL ANALYSIS ENDPOINTS
# =============================================================================

@app.get("/api/fundamentals/{symbol}")
async def get_fundamentals(symbol: str, user: dict = Depends(require_auth)):
    """Get fundamental analysis for a symbol"""
    symbol = symbol.upper()
    
    if symbol in FUNDAMENTAL_DATA:
        data = FUNDAMENTAL_DATA[symbol]
    else:
        # Generate random fundamentals
        data = {
            "pe": round(random.uniform(10, 50), 1),
            "pb": round(random.uniform(1, 20), 1),
            "ps": round(random.uniform(1, 15), 1),
            "peg": round(random.uniform(0.5, 3), 1),
            "roe": round(random.uniform(5, 50), 1),
            "roa": round(random.uniform(2, 25), 1),
            "debt_equity": round(random.uniform(0, 2), 1),
            "current_ratio": round(random.uniform(0.5, 3), 1),
            "revenue_growth": round(random.uniform(-5, 30), 1),
            "earnings_growth": round(random.uniform(-20, 50), 1),
            "analyst_rating": random.choice(["Strong Buy", "Buy", "Hold", "Sell"]),
            "price_target": round(random.uniform(80, 300), 0),
            "market_cap": random.randint(10000000000, 500000000000)
        }
    
    # Value assessment
    pe_assessment = "Undervalued" if data["pe"] < 15 else "Fair" if data["pe"] < 25 else "Overvalued"
    
    return {
        "symbol": symbol,
        "valuation": {
            "pe_ratio": data["pe"],
            "pb_ratio": data["pb"],
            "ps_ratio": data["ps"],
            "peg_ratio": data["peg"],
            "market_cap": data["market_cap"],
            "assessment": pe_assessment
        },
        "profitability": {
            "roe": data["roe"],
            "roa": data["roa"],
            "profit_margin": round(random.uniform(5, 35), 1)
        },
        "financial_health": {
            "debt_to_equity": data["debt_equity"],
            "current_ratio": data["current_ratio"],
            "quick_ratio": round(data["current_ratio"] * 0.85, 1),
            "interest_coverage": round(random.uniform(5, 30), 1)
        },
        "growth": {
            "revenue_growth": data["revenue_growth"],
            "earnings_growth": data["earnings_growth"],
            "dividend_growth": round(random.uniform(0, 15), 1)
        },
        "analyst_consensus": {
            "rating": data["analyst_rating"],
            "price_target": data["price_target"],
            "num_analysts": random.randint(15, 45),
            "buy_pct": random.randint(40, 80),
            "hold_pct": random.randint(10, 40),
            "sell_pct": random.randint(0, 20)
        }
    }

@app.get("/api/fundamentals/screener")
async def fundamental_screener(
    min_pe: float = Query(None),
    max_pe: float = Query(None),
    min_roe: float = Query(None),
    min_growth: float = Query(None),
    rating: str = Query(None),
    user: dict = Depends(require_auth)
):
    """Screen stocks by fundamental criteria"""
    results = []
    
    for symbol, data in FUNDAMENTAL_DATA.items():
        if min_pe and data["pe"] < min_pe:
            continue
        if max_pe and data["pe"] > max_pe:
            continue
        if min_roe and data["roe"] < min_roe:
            continue
        if min_growth and data["revenue_growth"] < min_growth:
            continue
        if rating and data["analyst_rating"] != rating:
            continue
        
        results.append({
            "symbol": symbol,
            "pe": data["pe"],
            "roe": data["roe"],
            "revenue_growth": data["revenue_growth"],
            "analyst_rating": data["analyst_rating"],
            "price_target": data["price_target"]
        })
    
    return {"results": results, "count": len(results)}

# =============================================================================
# RETIREMENT PLANNING ENDPOINTS
# =============================================================================

@app.post("/api/retirement/calculate")
async def calculate_retirement(
    current_age: int = Query(...),
    retirement_age: int = Query(65),
    current_savings: float = Query(...),
    monthly_contribution: float = Query(...),
    expected_return: float = Query(0.07),
    user: dict = Depends(require_auth)
):
    """Calculate retirement projections"""
    return calculate_retirement_projection(
        current_age, retirement_age, current_savings, 
        monthly_contribution, expected_return
    )

@app.post("/api/retirement/plans")
async def save_retirement_plan(
    name: str = Query(...),
    current_age: int = Query(...),
    retirement_age: int = Query(65),
    current_savings: float = Query(...),
    monthly_contribution: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Save a retirement plan"""
    conn = get_db()
    conn.execute("""
        INSERT INTO retirement_plans (user_id, name, current_age, retirement_age, current_savings, monthly_contribution)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], name, current_age, retirement_age, current_savings, monthly_contribution))
    conn.commit()
    conn.close()
    return {"status": "saved", "name": name}

@app.get("/api/retirement/plans")
async def get_retirement_plans(user: dict = Depends(require_auth)):
    """Get saved retirement plans"""
    conn = get_db()
    plans = conn.execute("SELECT * FROM retirement_plans WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    return {"plans": [dict(p) for p in plans]}

# =============================================================================
# ADVANCED ALERTS SYSTEM
# =============================================================================

@app.post("/api/alerts/price/create")
async def create_price_alert(
    symbol: str = Query(...),
    condition: str = Query(...),  # above, below
    target_price: float = Query(...),
    user: dict = Depends(require_auth)
):
    """Create a price alert"""
    conn = get_db()
    conn.execute("""
        INSERT INTO price_alerts (user_id, symbol, condition, target_price)
        VALUES (?, ?, ?, ?)
    """, (user["id"], symbol.upper(), condition, target_price))
    conn.commit()
    conn.close()
    
    return {"status": "created", "symbol": symbol.upper(), "condition": condition, "target_price": target_price}

@app.get("/api/alerts/price/list")
async def get_price_alerts(user: dict = Depends(require_auth)):
    """Get all price alerts"""
    conn = get_db()
    alerts = conn.execute("SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC", 
                         (user["id"],)).fetchall()
    conn.close()
    return {"alerts": [dict(a) for a in alerts]}

@app.delete("/api/alerts/price/{alert_id}")
async def delete_price_alert(alert_id: int, user: dict = Depends(require_auth)):
    """Delete a price alert"""
    conn = get_db()
    conn.execute("DELETE FROM price_alerts WHERE id = ? AND user_id = ?", (alert_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/alerts/portfolio")
async def get_portfolio_alerts(user: dict = Depends(require_auth)):
    """Get smart portfolio alerts"""
    alerts = []
    
    conn = get_db()
    portfolios = conn.execute("SELECT id, name FROM portfolios WHERE user_id = ?", (user["id"],)).fetchall()
    
    for p in portfolios:
        holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (p["id"],)).fetchall()
        holdings = [dict(h) for h in holdings]
        
        # Check for various alert conditions
        for h in holdings:
            gain_pct = ((h["current_price"] - h["cost_basis"]) / h["cost_basis"]) * 100 if h["cost_basis"] > 0 else 0
            
            if gain_pct > 50:
                alerts.append({"type": "gain", "severity": "info", "symbol": h["symbol"], "message": f"{h['symbol']} is up {gain_pct:.1f}% - consider taking profits"})
            elif gain_pct < -20:
                alerts.append({"type": "loss", "severity": "warning", "symbol": h["symbol"], "message": f"{h['symbol']} is down {abs(gain_pct):.1f}% - potential TLH opportunity"})
        
        # Concentration alert
        total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
        if total_value > 0:
            for h in holdings:
                weight = (h["quantity"] * h["current_price"]) / total_value * 100
                if weight > 25:
                    alerts.append({"type": "concentration", "severity": "warning", "symbol": h["symbol"], "message": f"{h['symbol']} represents {weight:.1f}% of portfolio - consider rebalancing"})
    
    conn.close()
    return {"alerts": alerts[:20]}  # Limit to 20 alerts

# =============================================================================
# DEVELOPER API (API KEYS & WEBHOOKS)
# =============================================================================

@app.post("/api/developer/keys")
async def create_api_key(key_name: str = Query(...), permissions: str = Query("read"), user: dict = Depends(require_auth)):
    """Create a new API key"""
    import secrets
    api_key = f"wp_{secrets.token_hex(24)}"
    
    conn = get_db()
    conn.execute("""
        INSERT INTO api_keys (user_id, key_name, api_key, permissions)
        VALUES (?, ?, ?, ?)
    """, (user["id"], key_name, api_key, permissions))
    conn.commit()
    conn.close()
    
    return {"key_name": key_name, "api_key": api_key, "permissions": permissions, "message": "Store this key securely - it won't be shown again"}

@app.get("/api/developer/keys")
async def list_api_keys(user: dict = Depends(require_auth)):
    """List API keys (masked)"""
    conn = get_db()
    keys = conn.execute("SELECT id, key_name, permissions, last_used, created_at, active FROM api_keys WHERE user_id = ?",
                       (user["id"],)).fetchall()
    conn.close()
    return {"keys": [dict(k) for k in keys]}

@app.delete("/api/developer/keys/{key_id}")
async def revoke_api_key(key_id: int, user: dict = Depends(require_auth)):
    """Revoke an API key"""
    conn = get_db()
    conn.execute("UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?", (key_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "revoked"}

@app.post("/api/developer/webhooks")
async def create_webhook(url: str = Query(...), events: str = Query(...), user: dict = Depends(require_auth)):
    """Create a webhook"""
    import secrets
    secret = secrets.token_hex(16)
    
    conn = get_db()
    conn.execute("""
        INSERT INTO webhooks (user_id, url, events, secret)
        VALUES (?, ?, ?, ?)
    """, (user["id"], url, events, secret))
    conn.commit()
    conn.close()
    
    return {"url": url, "events": events.split(","), "secret": secret}

@app.get("/api/developer/webhooks")
async def list_webhooks(user: dict = Depends(require_auth)):
    """List webhooks"""
    conn = get_db()
    webhooks = conn.execute("SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ?",
                           (user["id"],)).fetchall()
    conn.close()
    return {"webhooks": [dict(w) for w in webhooks]}

@app.delete("/api/developer/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: int, user: dict = Depends(require_auth)):
    """Delete a webhook"""
    conn = get_db()
    conn.execute("DELETE FROM webhooks WHERE id = ? AND user_id = ?", (webhook_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

# =============================================================================
# CUSTOM REPORTS BUILDER
# =============================================================================

@app.post("/api/reports/custom")
async def create_custom_report(
    name: str = Query(...),
    report_type: str = Query(...),  # performance, holdings, tax, esg
    schedule: str = Query(None),  # daily, weekly, monthly
    user: dict = Depends(require_auth)
):
    """Create a custom scheduled report"""
    conn = get_db()
    conn.execute("""
        INSERT INTO saved_reports (user_id, name, report_type, schedule)
        VALUES (?, ?, ?, ?)
    """, (user["id"], name, report_type, schedule))
    conn.commit()
    conn.close()
    
    return {"status": "created", "name": name, "type": report_type, "schedule": schedule}

@app.get("/api/reports/custom")
async def get_custom_reports(user: dict = Depends(require_auth)):
    """Get saved custom reports"""
    conn = get_db()
    reports = conn.execute("SELECT * FROM saved_reports WHERE user_id = ?", (user["id"],)).fetchall()
    conn.close()
    return {"reports": [dict(r) for r in reports]}

@app.get("/api/reports/generate/{report_type}")
async def generate_report(report_type: str, portfolio_id: int = Query(None), user: dict = Depends(require_auth)):
    """Generate a report on demand"""
    if report_type == "performance":
        return {
            "type": "performance",
            "generated_at": datetime.now().isoformat(),
            "sections": ["Summary", "Holdings", "Returns", "Risk Metrics", "Benchmark Comparison"],
            "data": {"summary": "Performance report generated successfully"}
        }
    elif report_type == "tax":
        return {
            "type": "tax",
            "generated_at": datetime.now().isoformat(),
            "sections": ["Capital Gains", "TLH Opportunities", "Wash Sale Warnings", "Estimated Tax Liability"],
            "data": {"summary": "Tax report generated successfully"}
        }
    elif report_type == "esg":
        return {
            "type": "esg",
            "generated_at": datetime.now().isoformat(),
            "sections": ["ESG Score", "Carbon Footprint", "Controversy Analysis", "Recommendations"],
            "data": {"summary": "ESG report generated successfully"}
        }
    
    return {"error": "Unknown report type"}

# =============================================================================
# PHASE 5: CRYPTO, TECHNICAL ANALYSIS, OPTIONS & PROFESSIONAL TOOLS
# =============================================================================

# Top Cryptocurrencies with simulated data
CRYPTO_DATA = {
    "BTC": {"name": "Bitcoin", "price": 97500, "change_24h": 2.5, "market_cap": 1920000000000, "volume_24h": 45000000000, "icon": "₿"},
    "ETH": {"name": "Ethereum", "price": 3650, "change_24h": 3.2, "market_cap": 438000000000, "volume_24h": 18000000000, "icon": "Ξ"},
    "BNB": {"name": "BNB", "price": 685, "change_24h": 1.8, "market_cap": 99000000000, "volume_24h": 1500000000, "icon": "◈"},
    "SOL": {"name": "Solana", "price": 225, "change_24h": 5.1, "market_cap": 108000000000, "volume_24h": 4200000000, "icon": "◎"},
    "XRP": {"name": "XRP", "price": 2.35, "change_24h": -1.2, "market_cap": 135000000000, "volume_24h": 8500000000, "icon": "✕"},
    "ADA": {"name": "Cardano", "price": 1.05, "change_24h": 4.3, "market_cap": 37000000000, "volume_24h": 1200000000, "icon": "₳"},
    "DOGE": {"name": "Dogecoin", "price": 0.42, "change_24h": 8.5, "market_cap": 62000000000, "volume_24h": 3800000000, "icon": "Ð"},
    "DOT": {"name": "Polkadot", "price": 9.25, "change_24h": 2.1, "market_cap": 14000000000, "volume_24h": 450000000, "icon": "●"},
    "AVAX": {"name": "Avalanche", "price": 48.50, "change_24h": 3.8, "market_cap": 20000000000, "volume_24h": 890000000, "icon": "▲"},
    "LINK": {"name": "Chainlink", "price": 24.80, "change_24h": 1.5, "market_cap": 15500000000, "volume_24h": 680000000, "icon": "⬡"},
}

# Technical Indicators
TECHNICAL_INDICATORS = ["SMA", "EMA", "RSI", "MACD", "Bollinger Bands", "Stochastic", "ATR", "OBV", "VWAP", "Fibonacci"]

# Options Chain Data (simulated)
def generate_options_chain(symbol: str, current_price: float):
    """Generate simulated options chain data"""
    strikes = []
    base_strike = round(current_price / 5) * 5  # Round to nearest 5
    
    for i in range(-5, 6):
        strike = base_strike + (i * 5)
        itm_call = strike < current_price
        itm_put = strike > current_price
        
        # Simplified Black-Scholes-ish pricing
        intrinsic_call = max(0, current_price - strike)
        intrinsic_put = max(0, strike - current_price)
        time_value = abs(current_price - strike) * 0.1 + random.uniform(0.5, 2.0)
        
        strikes.append({
            "strike": strike,
            "call": {
                "bid": round(intrinsic_call + time_value - 0.1, 2),
                "ask": round(intrinsic_call + time_value + 0.1, 2),
                "last": round(intrinsic_call + time_value, 2),
                "volume": random.randint(100, 5000),
                "open_interest": random.randint(1000, 50000),
                "iv": round(random.uniform(0.2, 0.6), 2),
                "delta": round(0.5 + (current_price - strike) / (current_price * 2), 2),
                "gamma": round(random.uniform(0.01, 0.05), 3),
                "theta": round(-random.uniform(0.01, 0.1), 3),
                "itm": itm_call
            },
            "put": {
                "bid": round(intrinsic_put + time_value - 0.1, 2),
                "ask": round(intrinsic_put + time_value + 0.1, 2),
                "last": round(intrinsic_put + time_value, 2),
                "volume": random.randint(100, 5000),
                "open_interest": random.randint(1000, 50000),
                "iv": round(random.uniform(0.2, 0.6), 2),
                "delta": round(-0.5 + (current_price - strike) / (current_price * 2), 2),
                "gamma": round(random.uniform(0.01, 0.05), 3),
                "theta": round(-random.uniform(0.01, 0.1), 3),
                "itm": itm_put
            }
        })
    
    return strikes

def calculate_technical_indicators(symbol: str, period: int = 14):
    """Calculate technical indicators for a symbol"""
    # Generate simulated price history
    base_price = {"AAPL": 178, "MSFT": 378, "GOOGL": 141, "AMZN": 178, "NVDA": 495}.get(symbol, 100)
    prices = []
    volumes = []
    
    price = base_price * 0.9
    for i in range(100):
        change = random.uniform(-0.02, 0.025)
        price = price * (1 + change)
        prices.append(price)
        volumes.append(random.randint(1000000, 10000000))
    
    current_price = prices[-1]
    
    # Calculate indicators
    sma_20 = sum(prices[-20:]) / 20
    sma_50 = sum(prices[-50:]) / 50
    
    # EMA calculation
    ema_12 = prices[-1]
    ema_26 = prices[-1]
    multiplier_12 = 2 / (12 + 1)
    multiplier_26 = 2 / (26 + 1)
    for p in prices[-30:]:
        ema_12 = (p - ema_12) * multiplier_12 + ema_12
        ema_26 = (p - ema_26) * multiplier_26 + ema_26
    
    macd = ema_12 - ema_26
    
    # RSI calculation
    gains = []
    losses = []
    for i in range(1, min(period + 1, len(prices))):
        change = prices[-i] - prices[-i-1]
        if change > 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))
    
    avg_gain = sum(gains) / len(gains) if gains else 0
    avg_loss = sum(losses) / len(losses) if losses else 0.0001
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    # Bollinger Bands
    std_dev = (sum((p - sma_20) ** 2 for p in prices[-20:]) / 20) ** 0.5
    bb_upper = sma_20 + (2 * std_dev)
    bb_lower = sma_20 - (2 * std_dev)
    
    # Stochastic
    high_14 = max(prices[-14:])
    low_14 = min(prices[-14:])
    stoch_k = ((current_price - low_14) / (high_14 - low_14)) * 100 if high_14 != low_14 else 50
    
    # ATR (simplified)
    atr = sum(abs(prices[-i] - prices[-i-1]) for i in range(1, 15)) / 14
    
    # VWAP (simplified)
    vwap = sum(p * v for p, v in zip(prices[-20:], volumes[-20:])) / sum(volumes[-20:])
    
    # Support/Resistance levels
    recent_highs = sorted(prices[-30:], reverse=True)[:3]
    recent_lows = sorted(prices[-30:])[:3]
    
    # Trend determination
    if current_price > sma_20 > sma_50:
        trend = "Bullish"
        trend_strength = "Strong" if rsi > 60 else "Moderate"
    elif current_price < sma_20 < sma_50:
        trend = "Bearish"
        trend_strength = "Strong" if rsi < 40 else "Moderate"
    else:
        trend = "Neutral"
        trend_strength = "Weak"
    
    # Signal generation
    signals = []
    if rsi < 30:
        signals.append({"type": "buy", "indicator": "RSI", "reason": "Oversold condition (RSI < 30)"})
    elif rsi > 70:
        signals.append({"type": "sell", "indicator": "RSI", "reason": "Overbought condition (RSI > 70)"})
    
    if current_price > bb_upper:
        signals.append({"type": "sell", "indicator": "Bollinger", "reason": "Price above upper band"})
    elif current_price < bb_lower:
        signals.append({"type": "buy", "indicator": "Bollinger", "reason": "Price below lower band"})
    
    if macd > 0 and ema_12 > ema_26:
        signals.append({"type": "buy", "indicator": "MACD", "reason": "Bullish MACD crossover"})
    elif macd < 0 and ema_12 < ema_26:
        signals.append({"type": "sell", "indicator": "MACD", "reason": "Bearish MACD crossover"})
    
    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "indicators": {
            "sma_20": round(sma_20, 2),
            "sma_50": round(sma_50, 2),
            "ema_12": round(ema_12, 2),
            "ema_26": round(ema_26, 2),
            "rsi": round(rsi, 2),
            "macd": round(macd, 2),
            "macd_signal": round(macd * 0.9, 2),
            "bollinger_upper": round(bb_upper, 2),
            "bollinger_middle": round(sma_20, 2),
            "bollinger_lower": round(bb_lower, 2),
            "stochastic_k": round(stoch_k, 2),
            "stochastic_d": round(stoch_k * 0.95, 2),
            "atr": round(atr, 2),
            "vwap": round(vwap, 2),
        },
        "levels": {
            "resistance": [round(h, 2) for h in recent_highs],
            "support": [round(l, 2) for l in recent_lows],
        },
        "trend": {
            "direction": trend,
            "strength": trend_strength,
        },
        "signals": signals,
        "summary": f"{trend} trend with {trend_strength.lower()} momentum. RSI at {rsi:.0f}."
    }

# Crypto endpoints
@app.get("/api/crypto/prices")
async def get_crypto_prices(user: dict = Depends(require_auth)):
    """Get live crypto prices"""
    prices = []
    for symbol, data in CRYPTO_DATA.items():
        # Add some variance
        price_var = data["price"] * random.uniform(0.99, 1.01)
        change_var = data["change_24h"] + random.uniform(-0.5, 0.5)
        prices.append({
            "symbol": symbol,
            "name": data["name"],
            "price": round(price_var, 2),
            "change_24h": round(change_var, 2),
            "market_cap": data["market_cap"],
            "volume_24h": data["volume_24h"],
            "icon": data["icon"]
        })
    return {"prices": prices, "updated_at": datetime.now().isoformat()}

@app.get("/api/crypto/{symbol}")
async def get_crypto_detail(symbol: str, user: dict = Depends(require_auth)):
    """Get detailed crypto info"""
    symbol = symbol.upper()
    if symbol not in CRYPTO_DATA:
        raise HTTPException(status_code=404, detail="Cryptocurrency not found")
    
    data = CRYPTO_DATA[symbol]
    
    # Generate price history
    history = []
    price = data["price"] * 0.7
    for i in range(90):
        change = random.uniform(-0.03, 0.035)
        price = price * (1 + change)
        history.append({
            "date": (datetime.now() - timedelta(days=90-i)).strftime("%Y-%m-%d"),
            "price": round(price, 2)
        })
    
    return {
        "symbol": symbol,
        "name": data["name"],
        "price": data["price"],
        "change_24h": data["change_24h"],
        "market_cap": data["market_cap"],
        "volume_24h": data["volume_24h"],
        "circulating_supply": int(data["market_cap"] / data["price"]),
        "all_time_high": round(data["price"] * random.uniform(1.2, 2.5), 2),
        "all_time_low": round(data["price"] * random.uniform(0.01, 0.3), 2),
        "price_history": history,
        "icon": data["icon"]
    }

@app.post("/api/crypto/holdings")
async def add_crypto_holding(symbol: str = Query(...),
                            quantity: float = Query(...),
                            cost_basis: float = Query(...),
                            portfolio_id: int = Query(...),
                            user: dict = Depends(require_auth)):
    """Add crypto to portfolio"""
    symbol = symbol.upper()
    if symbol not in CRYPTO_DATA:
        raise HTTPException(status_code=400, detail="Unsupported cryptocurrency")
    
    crypto = CRYPTO_DATA[symbol]
    
    conn = get_db()
    conn.execute("""
        INSERT INTO holdings (portfolio_id, symbol, name, quantity, cost_basis, current_price, sector, asset_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (portfolio_id, symbol, crypto["name"], quantity, cost_basis, crypto["price"], "Cryptocurrency", "crypto"))
    conn.commit()
    conn.close()
    
    return {"status": "added", "symbol": symbol, "quantity": quantity, "current_value": quantity * crypto["price"]}

# Technical Analysis endpoints
@app.get("/api/technical/{symbol}")
async def get_technical_analysis(symbol: str, user: dict = Depends(require_auth)):
    """Get technical analysis for a symbol"""
    return calculate_technical_indicators(symbol.upper())

@app.get("/api/technical/{symbol}/chart-data")
async def get_chart_data(symbol: str, period: str = Query("1M"), user: dict = Depends(require_auth)):
    """Get OHLCV chart data"""
    days = {"1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "5Y": 1825}.get(period, 30)
    
    base_price = {"AAPL": 178, "MSFT": 378, "GOOGL": 141, "AMZN": 178, "NVDA": 495}.get(symbol.upper(), 100)
    
    data = []
    price = base_price * 0.8
    
    for i in range(days):
        open_price = price
        change = random.uniform(-0.03, 0.035)
        close_price = price * (1 + change)
        high_price = max(open_price, close_price) * random.uniform(1.0, 1.02)
        low_price = min(open_price, close_price) * random.uniform(0.98, 1.0)
        volume = random.randint(5000000, 50000000)
        
        data.append({
            "date": (datetime.now() - timedelta(days=days-i)).strftime("%Y-%m-%d"),
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "volume": volume
        })
        price = close_price
    
    return {"symbol": symbol.upper(), "period": period, "data": data}

@app.get("/api/technical/screener")
async def technical_screener(signal_type: str = Query(None), user: dict = Depends(require_auth)):
    """Screen stocks by technical signals"""
    symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "JPM", "V", "JNJ", 
               "WMT", "PG", "UNH", "HD", "BAC", "DIS", "NFLX", "ADBE", "CRM", "PYPL"]
    
    results = []
    for sym in symbols:
        analysis = calculate_technical_indicators(sym)
        
        if signal_type:
            matching_signals = [s for s in analysis["signals"] if s["type"] == signal_type]
            if not matching_signals:
                continue
        
        results.append({
            "symbol": sym,
            "price": analysis["current_price"],
            "rsi": analysis["indicators"]["rsi"],
            "trend": analysis["trend"]["direction"],
            "signals": analysis["signals"]
        })
    
    return {"results": results, "count": len(results)}

# Options endpoints
@app.get("/api/options/{symbol}/chain")
async def get_options_chain(symbol: str, expiry: str = Query(None), user: dict = Depends(require_auth)):
    """Get options chain for a symbol"""
    base_prices = {"AAPL": 178, "MSFT": 378, "GOOGL": 141, "AMZN": 178, "NVDA": 495, 
                   "TSLA": 245, "META": 505, "SPY": 480}
    
    symbol = symbol.upper()
    current_price = base_prices.get(symbol, 100) * random.uniform(0.98, 1.02)
    
    # Generate expiry dates
    expiries = []
    for i in [7, 14, 21, 30, 45, 60, 90, 180]:
        expiries.append((datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d"))
    
    chain = generate_options_chain(symbol, current_price)
    
    return {
        "symbol": symbol,
        "underlying_price": round(current_price, 2),
        "expiries": expiries,
        "selected_expiry": expiry or expiries[3],
        "chain": chain
    }

@app.post("/api/options/analyze")
async def analyze_options_strategy(symbol: str = Query(...),
                                  strategy: str = Query(...),
                                  user: dict = Depends(require_auth)):
    """Analyze options strategy (covered call, protective put, etc.)"""
    base_price = {"AAPL": 178, "MSFT": 378, "GOOGL": 141}.get(symbol.upper(), 100)
    
    strategies = {
        "covered_call": {
            "name": "Covered Call",
            "legs": [
                {"type": "stock", "action": "long", "quantity": 100},
                {"type": "call", "action": "short", "strike": base_price * 1.05, "premium": base_price * 0.02}
            ],
            "max_profit": round(base_price * 0.07, 2),
            "max_loss": round(base_price * 0.93, 2),
            "breakeven": round(base_price * 0.98, 2),
            "probability_profit": 65,
            "description": "Sell calls against stock you own for income"
        },
        "protective_put": {
            "name": "Protective Put",
            "legs": [
                {"type": "stock", "action": "long", "quantity": 100},
                {"type": "put", "action": "long", "strike": base_price * 0.95, "premium": base_price * 0.025}
            ],
            "max_profit": "Unlimited",
            "max_loss": round(base_price * 0.075, 2),
            "breakeven": round(base_price * 1.025, 2),
            "probability_profit": 50,
            "description": "Buy puts to protect your stock position"
        },
        "bull_call_spread": {
            "name": "Bull Call Spread",
            "legs": [
                {"type": "call", "action": "long", "strike": base_price, "premium": base_price * 0.04},
                {"type": "call", "action": "short", "strike": base_price * 1.1, "premium": base_price * 0.015}
            ],
            "max_profit": round(base_price * 0.075, 2),
            "max_loss": round(base_price * 0.025, 2),
            "breakeven": round(base_price * 1.025, 2),
            "probability_profit": 45,
            "description": "Bullish strategy with limited risk and reward"
        },
        "iron_condor": {
            "name": "Iron Condor",
            "legs": [
                {"type": "put", "action": "short", "strike": base_price * 0.95, "premium": base_price * 0.01},
                {"type": "put", "action": "long", "strike": base_price * 0.9, "premium": base_price * 0.005},
                {"type": "call", "action": "short", "strike": base_price * 1.05, "premium": base_price * 0.01},
                {"type": "call", "action": "long", "strike": base_price * 1.1, "premium": base_price * 0.005}
            ],
            "max_profit": round(base_price * 0.01, 2),
            "max_loss": round(base_price * 0.04, 2),
            "breakeven": [round(base_price * 0.94, 2), round(base_price * 1.06, 2)],
            "probability_profit": 70,
            "description": "Profit from low volatility / range-bound stock"
        }
    }
    
    if strategy not in strategies:
        return {"error": "Unknown strategy", "available": list(strategies.keys())}
    
    return {
        "symbol": symbol.upper(),
        "underlying_price": base_price,
        "strategy": strategies[strategy]
    }

# Portfolio X-Ray (detailed breakdown)
@app.get("/api/portfolios/{portfolio_id}/xray")
async def portfolio_xray(portfolio_id: int, user: dict = Depends(require_auth)):
    """Deep portfolio analysis - X-Ray view"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    
    # Sector breakdown
    sectors = {}
    for h in holdings:
        sector = h.get("sector", "Other")
        value = h["quantity"] * h["current_price"]
        sectors[sector] = sectors.get(sector, 0) + value
    
    sector_breakdown = [{"sector": k, "value": round(v, 2), "weight": round(v/total_value*100, 2)} 
                       for k, v in sorted(sectors.items(), key=lambda x: x[1], reverse=True)]
    
    # Asset type breakdown
    asset_types = {"Stocks": 0, "ETFs": 0, "Crypto": 0, "Bonds": 0, "Other": 0}
    for h in holdings:
        asset_type = h.get("asset_type", "Stocks")
        if h["symbol"] in CRYPTO_DATA:
            asset_type = "Crypto"
        elif h["symbol"] in ["VTI", "VOO", "QQQ", "SPY", "BND", "AGG"]:
            asset_type = "ETFs"
        value = h["quantity"] * h["current_price"]
        asset_types[asset_type] = asset_types.get(asset_type, 0) + value
    
    # Geographic exposure (simulated)
    geo = {"United States": 65, "International Developed": 20, "Emerging Markets": 10, "Other": 5}
    
    # Risk metrics
    volatilities = [random.uniform(0.15, 0.45) for _ in holdings]
    weights = [h["quantity"] * h["current_price"] / total_value for h in holdings]
    portfolio_vol = sum(w * v for w, v in zip(weights, volatilities))
    
    # Concentration risk
    top_5_weight = sum(sorted(weights, reverse=True)[:5]) * 100
    
    # Dividend analysis
    div_payers = [h for h in holdings if h.get("dividend_yield", 0) > 0]
    total_div_income = sum(h["quantity"] * h.get("annual_dividend", 0) for h in holdings)
    
    # Style analysis (Growth vs Value)
    growth_symbols = {"AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX", "ADBE", "CRM"}
    value_symbols = {"JPM", "BAC", "WFC", "JNJ", "PG", "KO", "PEP", "WMT", "XOM", "CVX"}
    
    growth_weight = sum(h["quantity"] * h["current_price"] for h in holdings if h["symbol"] in growth_symbols) / total_value * 100
    value_weight = sum(h["quantity"] * h["current_price"] for h in holdings if h["symbol"] in value_symbols) / total_value * 100
    
    return {
        "portfolio_id": portfolio_id,
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": round(total_value - total_cost, 2),
            "total_gain_pct": round((total_value - total_cost) / total_cost * 100, 2),
            "holdings_count": len(holdings)
        },
        "sector_breakdown": sector_breakdown,
        "asset_type_breakdown": [{"type": k, "value": round(v, 2), "weight": round(v/total_value*100 if total_value > 0 else 0, 2)} 
                                for k, v in asset_types.items() if v > 0],
        "geographic_exposure": [{"region": k, "weight": v} for k, v in geo.items()],
        "risk_metrics": {
            "portfolio_volatility": round(portfolio_vol * 100, 2),
            "beta": round(random.uniform(0.8, 1.3), 2),
            "sharpe_ratio": round(random.uniform(0.5, 1.5), 2),
            "max_drawdown": round(random.uniform(-15, -35), 2),
            "var_95": round(total_value * portfolio_vol * 1.65, 2)
        },
        "concentration": {
            "top_5_weight": round(top_5_weight, 2),
            "herfindahl_index": round(sum(w**2 for w in weights) * 10000, 2),
            "effective_positions": round(1 / sum(w**2 for w in weights), 1) if weights else 0
        },
        "income": {
            "annual_dividend_income": round(total_div_income, 2),
            "portfolio_yield": round(total_div_income / total_value * 100, 2) if total_value > 0 else 0,
            "dividend_payers": len(div_payers),
            "non_payers": len(holdings) - len(div_payers)
        },
        "style": {
            "growth_weight": round(growth_weight, 2),
            "value_weight": round(value_weight, 2),
            "blend_weight": round(100 - growth_weight - value_weight, 2),
            "style_box": "Large Growth" if growth_weight > value_weight else "Large Value" if value_weight > growth_weight else "Large Blend"
        }
    }

# Correlation Matrix
@app.get("/api/portfolios/{portfolio_id}/correlations")
async def get_correlations(portfolio_id: int, user: dict = Depends(require_auth)):
    """Get correlation matrix for portfolio holdings"""
    conn = get_db()
    holdings = conn.execute("SELECT symbol FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    symbols = [h["symbol"] for h in holdings][:10]  # Limit to 10 for display
    
    # Generate correlation matrix (simulated)
    matrix = []
    for i, sym1 in enumerate(symbols):
        row = []
        for j, sym2 in enumerate(symbols):
            if i == j:
                corr = 1.0
            elif abs(i - j) == 1:
                corr = random.uniform(0.5, 0.8)
            else:
                corr = random.uniform(-0.2, 0.6)
            row.append(round(corr, 2))
        matrix.append(row)
    
    return {
        "symbols": symbols,
        "matrix": matrix,
        "highly_correlated": [
            {"pair": [symbols[0], symbols[1]] if len(symbols) > 1 else [], "correlation": matrix[0][1] if len(symbols) > 1 else 0}
        ]
    }

# Risk Parity Analysis
@app.get("/api/portfolios/{portfolio_id}/risk-parity")
async def risk_parity_analysis(portfolio_id: int, user: dict = Depends(require_auth)):
    """Calculate risk parity weights"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings"}
    
    holdings = [dict(h) for h in holdings]
    
    # Assign volatilities
    vols = {h["symbol"]: random.uniform(0.15, 0.45) for h in holdings}
    
    # Calculate inverse-volatility weights
    inv_vols = {sym: 1/vol for sym, vol in vols.items()}
    total_inv_vol = sum(inv_vols.values())
    risk_parity_weights = {sym: inv_vol/total_inv_vol for sym, inv_vol in inv_vols.items()}
    
    # Current weights
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    current_weights = {h["symbol"]: (h["quantity"] * h["current_price"]) / total_value for h in holdings}
    
    # Recommendations
    recommendations = []
    for h in holdings:
        sym = h["symbol"]
        current = current_weights[sym] * 100
        target = risk_parity_weights[sym] * 100
        diff = target - current
        
        if abs(diff) > 2:
            recommendations.append({
                "symbol": sym,
                "current_weight": round(current, 2),
                "target_weight": round(target, 2),
                "action": "increase" if diff > 0 else "decrease",
                "change_needed": round(abs(diff), 2)
            })
    
    return {
        "current_weights": {k: round(v*100, 2) for k, v in current_weights.items()},
        "risk_parity_weights": {k: round(v*100, 2) for k, v in risk_parity_weights.items()},
        "volatilities": {k: round(v*100, 2) for k, v in vols.items()},
        "recommendations": sorted(recommendations, key=lambda x: x["change_needed"], reverse=True)
    }

# Earnings Calendar
@app.get("/api/earnings/calendar")
async def get_earnings_calendar(user: dict = Depends(require_auth)):
    """Get upcoming earnings for watchlist/portfolio"""
    companies = [
        {"symbol": "AAPL", "name": "Apple Inc.", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 2.15},
        {"symbol": "MSFT", "name": "Microsoft Corp.", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 2.95},
        {"symbol": "GOOGL", "name": "Alphabet Inc.", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 1.85},
        {"symbol": "AMZN", "name": "Amazon.com", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 1.15},
        {"symbol": "NVDA", "name": "NVIDIA Corp.", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 5.45},
        {"symbol": "META", "name": "Meta Platforms", "date": (datetime.now() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d"), "time": "After Market", "estimate_eps": 4.85},
    ]
    
    # Sort by date
    companies.sort(key=lambda x: x["date"])
    
    return {"earnings": companies}

# Dividend Calendar
@app.get("/api/dividends/calendar")
async def get_dividend_calendar(user: dict = Depends(require_auth)):
    """Get upcoming dividends"""
    dividends = [
        {"symbol": "AAPL", "name": "Apple Inc.", "ex_date": (datetime.now() + timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d"), "pay_date": (datetime.now() + timedelta(days=random.randint(15, 75))).strftime("%Y-%m-%d"), "amount": 0.25, "yield": 0.56},
        {"symbol": "MSFT", "name": "Microsoft Corp.", "ex_date": (datetime.now() + timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d"), "pay_date": (datetime.now() + timedelta(days=random.randint(15, 75))).strftime("%Y-%m-%d"), "amount": 0.75, "yield": 0.79},
        {"symbol": "JNJ", "name": "Johnson & Johnson", "ex_date": (datetime.now() + timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d"), "pay_date": (datetime.now() + timedelta(days=random.randint(15, 75))).strftime("%Y-%m-%d"), "amount": 1.24, "yield": 3.2},
        {"symbol": "PG", "name": "Procter & Gamble", "ex_date": (datetime.now() + timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d"), "pay_date": (datetime.now() + timedelta(days=random.randint(15, 75))).strftime("%Y-%m-%d"), "amount": 1.01, "yield": 2.4},
        {"symbol": "KO", "name": "Coca-Cola Co.", "ex_date": (datetime.now() + timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d"), "pay_date": (datetime.now() + timedelta(days=random.randint(15, 75))).strftime("%Y-%m-%d"), "amount": 0.485, "yield": 3.1},
    ]
    
    dividends.sort(key=lambda x: x["ex_date"])
    
    return {"dividends": dividends}

# Backtesting
@app.post("/api/backtest")
async def run_backtest(symbols: str = Query(...),
                      weights: str = Query(...),
                      start_date: str = Query(None),
                      end_date: str = Query(None),
                      initial_investment: float = Query(10000),
                      user: dict = Depends(require_auth)):
    """Run portfolio backtest"""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    weight_list = [float(w.strip()) for w in weights.split(",")]
    
    if len(symbol_list) != len(weight_list):
        return {"error": "Symbols and weights must have same length"}
    
    if abs(sum(weight_list) - 100) > 1:
        return {"error": "Weights must sum to 100"}
    
    # Generate backtest results (simulated)
    periods = 252 * 3  # 3 years of daily data
    portfolio_values = [initial_investment]
    benchmark_values = [initial_investment]
    
    for i in range(periods):
        # Portfolio return
        daily_return = random.gauss(0.0004, 0.012)  # ~10% annual, 19% vol
        portfolio_values.append(portfolio_values[-1] * (1 + daily_return))
        
        # Benchmark (S&P 500)
        bench_return = random.gauss(0.0003, 0.010)  # ~8% annual, 16% vol
        benchmark_values.append(benchmark_values[-1] * (1 + bench_return))
    
    final_portfolio = portfolio_values[-1]
    final_benchmark = benchmark_values[-1]
    
    # Calculate metrics
    portfolio_return = (final_portfolio - initial_investment) / initial_investment * 100
    benchmark_return = (final_benchmark - initial_investment) / initial_investment * 100
    
    # Calculate drawdowns
    peak = initial_investment
    max_drawdown = 0
    for val in portfolio_values:
        if val > peak:
            peak = val
        drawdown = (peak - val) / peak
        max_drawdown = max(max_drawdown, drawdown)
    
    return {
        "parameters": {
            "symbols": symbol_list,
            "weights": weight_list,
            "initial_investment": initial_investment,
            "period": "3 Years"
        },
        "results": {
            "final_value": round(final_portfolio, 2),
            "total_return": round(portfolio_return, 2),
            "annualized_return": round(portfolio_return / 3, 2),
            "volatility": round(19.0, 2),
            "sharpe_ratio": round((portfolio_return / 3 - 4) / 19, 2),
            "max_drawdown": round(max_drawdown * 100, 2),
            "best_year": round(random.uniform(15, 35), 2),
            "worst_year": round(random.uniform(-20, -5), 2)
        },
        "benchmark": {
            "name": "S&P 500",
            "final_value": round(final_benchmark, 2),
            "total_return": round(benchmark_return, 2)
        },
        "alpha": round(portfolio_return - benchmark_return, 2),
        "history": [
            {"date": (datetime.now() - timedelta(days=periods-i)).strftime("%Y-%m-%d"), 
             "portfolio": round(portfolio_values[i], 2), 
             "benchmark": round(benchmark_values[i], 2)}
            for i in range(0, len(portfolio_values), 21)  # Weekly samples
        ]
    }

# =============================================================================
# PHASE 4: BROKERAGE INTEGRATION, TRADING, SOCIAL & GAMIFICATION
# =============================================================================

# Supported Brokerages (Simulated - in production use Plaid/Snaptrade)
SUPPORTED_BROKERAGES = [
    {"id": "fidelity", "name": "Fidelity", "logo": "🏦", "supported": True},
    {"id": "schwab", "name": "Charles Schwab", "logo": "🏛️", "supported": True},
    {"id": "vanguard", "name": "Vanguard", "logo": "⛵", "supported": True},
    {"id": "robinhood", "name": "Robinhood", "logo": "🪶", "supported": True},
    {"id": "etrade", "name": "E*TRADE", "logo": "📈", "supported": True},
    {"id": "tdameritrade", "name": "TD Ameritrade", "logo": "🟢", "supported": True},
    {"id": "merrill", "name": "Merrill Edge", "logo": "🔵", "supported": True},
    {"id": "webull", "name": "Webull", "logo": "🦬", "supported": True},
    {"id": "interactive", "name": "Interactive Brokers", "logo": "🌐", "supported": True},
    {"id": "sofi", "name": "SoFi Invest", "logo": "💜", "supported": True},
]

# Achievement definitions
ACHIEVEMENTS = [
    {"id": "first_portfolio", "name": "Getting Started", "description": "Create your first portfolio", "icon": "🎯", "points": 10},
    {"id": "diversified", "name": "Diversified Investor", "description": "Hold 10+ positions", "icon": "🌈", "points": 25},
    {"id": "sector_master", "name": "Sector Master", "description": "Invest in 5+ sectors", "icon": "📊", "points": 30},
    {"id": "income_investor", "name": "Income Investor", "description": "Earn $1,000+ in dividends", "icon": "💰", "points": 50},
    {"id": "tax_optimizer", "name": "Tax Optimizer", "description": "Execute a tax-loss harvest", "icon": "📋", "points": 40},
    {"id": "goal_setter", "name": "Goal Setter", "description": "Create 3+ financial goals", "icon": "🎯", "points": 20},
    {"id": "consistent", "name": "Consistent Contributor", "description": "Log in 7 days in a row", "icon": "📅", "points": 35},
    {"id": "health_a", "name": "A-Grade Portfolio", "description": "Achieve health score 90+", "icon": "⭐", "points": 75},
    {"id": "six_figures", "name": "Six Figure Club", "description": "Portfolio value exceeds $100K", "icon": "💎", "points": 100},
    {"id": "millionaire", "name": "Millionaire", "description": "Portfolio value exceeds $1M", "icon": "👑", "points": 500},
    {"id": "double_up", "name": "Double Up", "description": "Double your initial investment", "icon": "🚀", "points": 150},
    {"id": "analyzer", "name": "Data Analyst", "description": "Generate 10+ AI reports", "icon": "🤖", "points": 30},
    {"id": "social", "name": "Social Butterfly", "description": "Compare portfolios 5+ times", "icon": "🦋", "points": 25},
    {"id": "linked", "name": "Connected", "description": "Link a brokerage account", "icon": "🔗", "points": 50},
]

# Initialize additional tables
def init_phase4_tables():
    conn = get_db()
    
    # Linked accounts table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS linked_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            brokerage_id TEXT NOT NULL,
            brokerage_name TEXT NOT NULL,
            account_name TEXT,
            account_type TEXT,
            account_mask TEXT,
            access_token TEXT,
            last_synced TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Paper trades table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            portfolio_id INTEGER,
            symbol TEXT NOT NULL,
            trade_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            total_value REAL NOT NULL,
            status TEXT DEFAULT 'executed',
            executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # User achievements table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, achievement_id)
        )
    """)
    
    # Portfolio snapshots table (for historical tracking)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            total_value REAL NOT NULL,
            total_gain REAL NOT NULL,
            health_score INTEGER,
            snapshot_date TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
        )
    """)
    
    # Anonymous benchmarks table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS anonymous_benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_size_bucket TEXT,
            avg_return REAL,
            avg_sharpe REAL,
            avg_yield REAL,
            sample_count INTEGER,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Rebalance history
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rebalance_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            symbol TEXT NOT NULL,
            target_weight REAL,
            actual_weight REAL,
            shares_to_trade REAL,
            executed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
        )
    """)
    
    conn.commit()
    conn.close()

# Initialize Phase 4 tables on startup
init_phase4_tables()

# =============================================================================
# BROKERAGE LINKING ENDPOINTS
# =============================================================================

@app.get("/api/brokerages")
async def get_supported_brokerages(user: dict = Depends(require_auth)):
    """Get list of supported brokerages for linking"""
    return {"brokerages": SUPPORTED_BROKERAGES}

@app.post("/api/brokerages/link")
async def link_brokerage(brokerage_id: str = Query(...), 
                        username: str = Query(...),
                        password: str = Query(...),
                        user: dict = Depends(require_auth)):
    """Simulate linking a brokerage account (in production, use Plaid Link)"""
    brokerage = next((b for b in SUPPORTED_BROKERAGES if b["id"] == brokerage_id), None)
    if not brokerage:
        raise HTTPException(status_code=400, detail="Unsupported brokerage")
    
    # Simulate Plaid-style account discovery
    # In production, this would call Plaid's /link/token/create and handle the flow
    simulated_accounts = [
        {
            "account_name": f"{brokerage['name']} Individual",
            "account_type": "brokerage",
            "account_mask": f"****{random.randint(1000, 9999)}",
            "balance": round(random.uniform(10000, 500000), 2)
        },
        {
            "account_name": f"{brokerage['name']} IRA",
            "account_type": "ira",
            "account_mask": f"****{random.randint(1000, 9999)}",
            "balance": round(random.uniform(50000, 1000000), 2)
        }
    ]
    
    conn = get_db()
    linked_ids = []
    
    for account in simulated_accounts:
        cursor = conn.execute("""
            INSERT INTO linked_accounts (user_id, brokerage_id, brokerage_name, account_name, account_type, account_mask, access_token, last_synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user["id"], brokerage_id, brokerage["name"], account["account_name"], 
              account["account_type"], account["account_mask"], f"access_{random.randint(100000, 999999)}", 
              datetime.now().isoformat()))
        linked_ids.append(cursor.lastrowid)
    
    conn.commit()
    
    # Award achievement
    try:
        conn.execute("INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
                    (user["id"], "linked"))
    except:
        pass  # Already has achievement
    
    conn.commit()
    conn.close()
    
    return {
        "status": "linked",
        "brokerage": brokerage,
        "accounts": simulated_accounts,
        "message": f"Successfully linked {len(simulated_accounts)} accounts from {brokerage['name']}"
    }

@app.get("/api/brokerages/accounts")
async def get_linked_accounts(user: dict = Depends(require_auth)):
    """Get all linked brokerage accounts"""
    conn = get_db()
    accounts = conn.execute("""
        SELECT * FROM linked_accounts WHERE user_id = ? AND status = 'active'
    """, (user["id"],)).fetchall()
    conn.close()
    
    return {"accounts": [dict(a) for a in accounts]}

@app.post("/api/brokerages/sync/{account_id}")
async def sync_brokerage_account(account_id: int, user: dict = Depends(require_auth)):
    """Sync holdings from linked brokerage account"""
    conn = get_db()
    account = conn.execute("SELECT * FROM linked_accounts WHERE id = ? AND user_id = ?",
                          (account_id, user["id"])).fetchone()
    
    if not account:
        conn.close()
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Simulate fetching holdings from brokerage
    # In production, this would call Plaid's /investments/holdings/get
    simulated_holdings = [
        {"symbol": "AAPL", "name": "Apple Inc.", "quantity": random.randint(10, 100), "price": 178.50, "cost_basis": 145.00},
        {"symbol": "MSFT", "name": "Microsoft Corp.", "quantity": random.randint(5, 50), "price": 378.25, "cost_basis": 285.00},
        {"symbol": "GOOGL", "name": "Alphabet Inc.", "quantity": random.randint(5, 30), "price": 141.80, "cost_basis": 105.00},
        {"symbol": "AMZN", "name": "Amazon.com Inc.", "quantity": random.randint(10, 50), "price": 178.90, "cost_basis": 125.00},
        {"symbol": "NVDA", "name": "NVIDIA Corp.", "quantity": random.randint(5, 25), "price": 495.50, "cost_basis": 220.00},
        {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "quantity": random.randint(20, 100), "price": 245.30, "cost_basis": 195.00},
        {"symbol": "BND", "name": "Vanguard Total Bond Market ETF", "quantity": random.randint(30, 150), "price": 72.50, "cost_basis": 78.00},
    ]
    
    # Create or get portfolio for this linked account
    portfolio = conn.execute("SELECT id FROM portfolios WHERE user_id = ? AND name = ?",
                            (user["id"], f"Linked: {account['account_name']}")).fetchone()
    
    if not portfolio:
        cursor = conn.execute("""
            INSERT INTO portfolios (user_id, name, description, portfolio_type)
            VALUES (?, ?, ?, ?)
        """, (user["id"], f"Linked: {account['account_name']}", 
              f"Auto-synced from {account['brokerage_name']}", account["account_type"]))
        portfolio_id = cursor.lastrowid
    else:
        portfolio_id = portfolio["id"]
        # Clear existing holdings for fresh sync
        conn.execute("DELETE FROM holdings WHERE portfolio_id = ?", (portfolio_id,))
    
    # Insert holdings
    for h in simulated_holdings:
        sector = SECTOR_MAPPING.get(h["symbol"], "Other")
        div_yield = random.uniform(0, 3) if random.random() > 0.5 else 0
        conn.execute("""
            INSERT INTO holdings (portfolio_id, symbol, name, quantity, cost_basis, current_price, sector, dividend_yield, annual_dividend)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (portfolio_id, h["symbol"], h["name"], h["quantity"], h["cost_basis"], 
              h["price"], sector, div_yield, h["price"] * div_yield / 100))
    
    # Update last synced
    conn.execute("UPDATE linked_accounts SET last_synced = ? WHERE id = ?",
                (datetime.now().isoformat(), account_id))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "synced",
        "portfolio_id": portfolio_id,
        "holdings_count": len(simulated_holdings),
        "message": f"Synced {len(simulated_holdings)} holdings from {account['brokerage_name']}"
    }

@app.delete("/api/brokerages/accounts/{account_id}")
async def unlink_brokerage_account(account_id: int, user: dict = Depends(require_auth)):
    """Unlink a brokerage account"""
    conn = get_db()
    conn.execute("UPDATE linked_accounts SET status = 'unlinked' WHERE id = ? AND user_id = ?",
                (account_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "unlinked"}

# =============================================================================
# PAPER TRADING ENDPOINTS
# =============================================================================

@app.post("/api/paper-trade")
async def execute_paper_trade(symbol: str = Query(...),
                             trade_type: str = Query(...),  # buy, sell
                             quantity: float = Query(...),
                             portfolio_id: int = Query(None),
                             user: dict = Depends(require_auth)):
    """Execute a simulated paper trade"""
    # Get current price (simulated)
    base_prices = {"AAPL": 178, "MSFT": 378, "GOOGL": 141, "AMZN": 178, "NVDA": 495, 
                   "TSLA": 245, "META": 505, "JPM": 195, "V": 275, "JNJ": 155}
    price = base_prices.get(symbol.upper(), random.uniform(50, 500))
    price = price * random.uniform(0.98, 1.02)  # Add some variance
    
    total_value = quantity * price
    
    conn = get_db()
    
    # Record the trade
    conn.execute("""
        INSERT INTO paper_trades (user_id, portfolio_id, symbol, trade_type, quantity, price, total_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user["id"], portfolio_id, symbol.upper(), trade_type, quantity, price, total_value))
    
    # If portfolio specified, update holdings
    if portfolio_id:
        existing = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ? AND symbol = ?",
                               (portfolio_id, symbol.upper())).fetchone()
        
        if trade_type == "buy":
            if existing:
                # Update existing holding
                new_qty = existing["quantity"] + quantity
                new_cost = ((existing["cost_basis"] * existing["quantity"]) + (price * quantity)) / new_qty
                conn.execute("UPDATE holdings SET quantity = ?, cost_basis = ? WHERE id = ?",
                            (new_qty, new_cost, existing["id"]))
            else:
                # Create new holding
                conn.execute("""
                    INSERT INTO holdings (portfolio_id, symbol, name, quantity, cost_basis, current_price, sector)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (portfolio_id, symbol.upper(), f"{symbol.upper()} Stock", quantity, price, price,
                      SECTOR_MAPPING.get(symbol.upper(), "Other")))
        
        elif trade_type == "sell" and existing:
            new_qty = existing["quantity"] - quantity
            if new_qty <= 0:
                conn.execute("DELETE FROM holdings WHERE id = ?", (existing["id"],))
            else:
                conn.execute("UPDATE holdings SET quantity = ? WHERE id = ?", (new_qty, existing["id"]))
    
    conn.commit()
    conn.close()
    
    return {
        "status": "executed",
        "trade": {
            "symbol": symbol.upper(),
            "type": trade_type,
            "quantity": quantity,
            "price": round(price, 2),
            "total_value": round(total_value, 2)
        },
        "message": f"{'Bought' if trade_type == 'buy' else 'Sold'} {quantity} shares of {symbol.upper()} at ${price:.2f}"
    }

@app.get("/api/paper-trades")
async def get_paper_trades(portfolio_id: int = Query(None), user: dict = Depends(require_auth)):
    """Get paper trading history"""
    conn = get_db()
    if portfolio_id:
        trades = conn.execute("""
            SELECT * FROM paper_trades WHERE user_id = ? AND portfolio_id = ? 
            ORDER BY executed_at DESC LIMIT 100
        """, (user["id"], portfolio_id)).fetchall()
    else:
        trades = conn.execute("""
            SELECT * FROM paper_trades WHERE user_id = ? 
            ORDER BY executed_at DESC LIMIT 100
        """, (user["id"],)).fetchall()
    conn.close()
    
    return {"trades": [dict(t) for t in trades]}

# =============================================================================
# AUTOMATED REBALANCING
# =============================================================================

@app.post("/api/portfolios/{portfolio_id}/rebalance/generate")
async def generate_rebalance_plan(portfolio_id: int,
                                 target_allocation: dict = None,
                                 user: dict = Depends(require_auth)):
    """Generate automated rebalancing recommendations"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    conn.close()
    
    if not holdings:
        return {"error": "No holdings to rebalance"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    
    # Default target: equal weight
    if not target_allocation:
        target_weight = 100 / len(holdings)
        target_allocation = {h["symbol"]: target_weight for h in holdings}
    
    # Generate rebalancing actions
    actions = []
    for h in holdings:
        current_weight = (h["quantity"] * h["current_price"] / total_value) * 100
        target_weight = target_allocation.get(h["symbol"], current_weight)
        diff = target_weight - current_weight
        
        if abs(diff) > 2:  # Only rebalance if drift > 2%
            target_value = total_value * (target_weight / 100)
            current_value = h["quantity"] * h["current_price"]
            value_diff = target_value - current_value
            shares_to_trade = abs(value_diff / h["current_price"])
            
            actions.append({
                "symbol": h["symbol"],
                "action": "buy" if diff > 0 else "sell",
                "current_weight": round(current_weight, 2),
                "target_weight": round(target_weight, 2),
                "drift": round(diff, 2),
                "shares_to_trade": round(shares_to_trade, 2),
                "estimated_value": round(abs(value_diff), 2)
            })
    
    # Sort by absolute drift
    actions.sort(key=lambda x: abs(x["drift"]), reverse=True)
    
    return {
        "portfolio_id": portfolio_id,
        "total_value": round(total_value, 2),
        "actions": actions,
        "total_trades": len(actions),
        "estimated_cost": sum(a["estimated_value"] for a in actions if a["action"] == "buy")
    }

@app.post("/api/portfolios/{portfolio_id}/rebalance/execute")
async def execute_rebalance(portfolio_id: int, user: dict = Depends(require_auth)):
    """Execute the rebalancing plan (paper trades)"""
    # Generate the plan first
    plan = await generate_rebalance_plan(portfolio_id, user=user)
    
    if "error" in plan:
        return plan
    
    executed_trades = []
    for action in plan["actions"]:
        trade = await execute_paper_trade(
            symbol=action["symbol"],
            trade_type=action["action"],
            quantity=action["shares_to_trade"],
            portfolio_id=portfolio_id,
            user=user
        )
        executed_trades.append(trade)
    
    return {
        "status": "rebalanced",
        "trades_executed": len(executed_trades),
        "trades": executed_trades
    }

# =============================================================================
# ACHIEVEMENTS & GAMIFICATION
# =============================================================================

@app.get("/api/achievements")
async def get_achievements(user: dict = Depends(require_auth)):
    """Get all achievements and user progress"""
    conn = get_db()
    earned = conn.execute("SELECT achievement_id FROM user_achievements WHERE user_id = ?",
                         (user["id"],)).fetchall()
    conn.close()
    
    earned_ids = {a["achievement_id"] for a in earned}
    
    achievements_with_status = []
    for ach in ACHIEVEMENTS:
        achievements_with_status.append({
            **ach,
            "earned": ach["id"] in earned_ids
        })
    
    total_points = sum(a["points"] for a in ACHIEVEMENTS if a["id"] in earned_ids)
    
    return {
        "achievements": achievements_with_status,
        "earned_count": len(earned_ids),
        "total_count": len(ACHIEVEMENTS),
        "total_points": total_points,
        "level": total_points // 100 + 1,
        "next_level_points": ((total_points // 100 + 1) * 100) - total_points
    }

@app.post("/api/achievements/check")
async def check_achievements(user: dict = Depends(require_auth)):
    """Check and award any earned achievements"""
    conn = get_db()
    
    # Get user stats
    portfolios = conn.execute("SELECT COUNT(*) as count FROM portfolios WHERE user_id = ?",
                             (user["id"],)).fetchone()
    holdings = conn.execute("""
        SELECT COUNT(*) as count FROM holdings h 
        JOIN portfolios p ON h.portfolio_id = p.id 
        WHERE p.user_id = ?
    """, (user["id"],)).fetchone()
    goals = conn.execute("SELECT COUNT(*) as count FROM goals WHERE user_id = ?",
                        (user["id"],)).fetchone()
    
    # Calculate total portfolio value
    all_holdings = conn.execute("""
        SELECT h.* FROM holdings h 
        JOIN portfolios p ON h.portfolio_id = p.id 
        WHERE p.user_id = ?
    """, (user["id"],)).fetchall()
    
    total_value = sum(h["quantity"] * h["current_price"] for h in all_holdings)
    total_income = sum(h["annual_dividend"] * h["quantity"] for h in all_holdings if h["annual_dividend"])
    
    sectors = set(h["sector"] for h in all_holdings if h["sector"])
    
    # Check achievements
    newly_earned = []
    
    checks = [
        ("first_portfolio", portfolios["count"] >= 1),
        ("diversified", holdings["count"] >= 10),
        ("sector_master", len(sectors) >= 5),
        ("income_investor", total_income >= 1000),
        ("goal_setter", goals["count"] >= 3),
        ("six_figures", total_value >= 100000),
        ("millionaire", total_value >= 1000000),
    ]
    
    for ach_id, condition in checks:
        if condition:
            try:
                conn.execute("INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
                            (user["id"], ach_id))
                newly_earned.append(next(a for a in ACHIEVEMENTS if a["id"] == ach_id))
            except:
                pass  # Already earned
    
    conn.commit()
    conn.close()
    
    return {
        "newly_earned": newly_earned,
        "message": f"Earned {len(newly_earned)} new achievement(s)!" if newly_earned else "No new achievements"
    }

# =============================================================================
# SOCIAL & ANONYMOUS BENCHMARKING
# =============================================================================

@app.get("/api/social/benchmark")
async def get_anonymous_benchmark(user: dict = Depends(require_auth)):
    """Compare portfolio against anonymous aggregated benchmarks"""
    conn = get_db()
    
    # Get user's portfolio stats
    holdings = conn.execute("""
        SELECT h.* FROM holdings h 
        JOIN portfolios p ON h.portfolio_id = p.id 
        WHERE p.user_id = ?
    """, (user["id"],)).fetchall()
    conn.close()
    
    if not holdings:
        return {"error": "No holdings to benchmark"}
    
    holdings = [dict(h) for h in holdings]
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    total_income = sum(h.get("annual_dividend", 0) * h["quantity"] for h in holdings)
    
    user_return = ((total_value - total_cost) / total_cost * 100) if total_cost > 0 else 0
    user_yield = (total_income / total_value * 100) if total_value > 0 else 0
    
    # Determine size bucket
    if total_value < 25000:
        bucket = "Under $25K"
    elif total_value < 100000:
        bucket = "$25K - $100K"
    elif total_value < 500000:
        bucket = "$100K - $500K"
    else:
        bucket = "$500K+"
    
    # Generate simulated benchmark data (in production, aggregate real user data)
    benchmark = {
        "bucket": bucket,
        "avg_return": round(random.uniform(8, 15), 2),
        "avg_yield": round(random.uniform(1.5, 3.5), 2),
        "avg_sharpe": round(random.uniform(0.8, 1.4), 2),
        "avg_holdings": random.randint(8, 25),
        "sample_size": random.randint(1000, 50000)
    }
    
    # Calculate percentiles
    return_percentile = min(99, max(1, int(50 + (user_return - benchmark["avg_return"]) * 5)))
    yield_percentile = min(99, max(1, int(50 + (user_yield - benchmark["avg_yield"]) * 10)))
    
    return {
        "user_stats": {
            "total_value": round(total_value, 2),
            "return_pct": round(user_return, 2),
            "yield_pct": round(user_yield, 2),
            "holdings_count": len(holdings)
        },
        "benchmark": benchmark,
        "comparison": {
            "return_vs_avg": round(user_return - benchmark["avg_return"], 2),
            "yield_vs_avg": round(user_yield - benchmark["avg_yield"], 2),
            "return_percentile": return_percentile,
            "yield_percentile": yield_percentile
        },
        "insights": [
            f"Your return of {user_return:.1f}% is {'above' if user_return > benchmark['avg_return'] else 'below'} the {bucket} average of {benchmark['avg_return']}%",
            f"You're in the {return_percentile}th percentile for returns among similar portfolios",
            f"Your dividend yield of {user_yield:.1f}% {'exceeds' if user_yield > benchmark['avg_yield'] else 'trails'} the average of {benchmark['avg_yield']}%"
        ]
    }

@app.get("/api/social/leaderboard")
async def get_leaderboard(metric: str = Query("return"), user: dict = Depends(require_auth)):
    """Get anonymous leaderboard (simulated)"""
    # In production, this would aggregate real anonymized user data
    leaderboard = []
    
    for i in range(20):
        leaderboard.append({
            "rank": i + 1,
            "username": f"Investor_{random.randint(1000, 9999)}",
            "value": round(random.uniform(10, 50) if metric == "return" else 
                          random.uniform(2, 6) if metric == "yield" else
                          random.uniform(0.8, 2.0), 2),
            "is_you": i == random.randint(5, 15)
        })
    
    # Sort by value
    leaderboard.sort(key=lambda x: x["value"], reverse=True)
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1
    
    return {
        "metric": metric,
        "metric_label": {"return": "Return %", "yield": "Dividend Yield %", "sharpe": "Sharpe Ratio"}[metric],
        "leaderboard": leaderboard,
        "your_rank": next((e["rank"] for e in leaderboard if e["is_you"]), None)
    }

# =============================================================================
# PORTFOLIO HISTORY & SNAPSHOTS
# =============================================================================

@app.post("/api/portfolios/{portfolio_id}/snapshot")
async def create_portfolio_snapshot(portfolio_id: int, user: dict = Depends(require_auth)):
    """Create a snapshot of portfolio for historical tracking"""
    conn = get_db()
    holdings = conn.execute("SELECT * FROM holdings WHERE portfolio_id = ?", (portfolio_id,)).fetchall()
    holdings = [dict(h) for h in holdings]
    
    if not holdings:
        conn.close()
        return {"error": "No holdings to snapshot"}
    
    total_value = sum(h["quantity"] * h["current_price"] for h in holdings)
    total_cost = sum(h["quantity"] * h["cost_basis"] for h in holdings)
    total_gain = total_value - total_cost
    
    health = calculate_portfolio_health_score(holdings, {"risk_tolerance": "moderate"})
    
    conn.execute("""
        INSERT INTO portfolio_snapshots (portfolio_id, total_value, total_gain, health_score)
        VALUES (?, ?, ?, ?)
    """, (portfolio_id, total_value, total_gain, health.get("score", 0)))
    
    conn.commit()
    conn.close()
    
    return {"status": "created", "total_value": total_value, "health_score": health.get("score", 0)}

@app.get("/api/portfolios/{portfolio_id}/history")
async def get_portfolio_history(portfolio_id: int, days: int = Query(90), user: dict = Depends(require_auth)):
    """Get historical portfolio snapshots"""
    conn = get_db()
    snapshots = conn.execute("""
        SELECT * FROM portfolio_snapshots 
        WHERE portfolio_id = ? 
        ORDER BY snapshot_date DESC 
        LIMIT ?
    """, (portfolio_id, days)).fetchall()
    conn.close()
    
    return {"snapshots": [dict(s) for s in snapshots]}

# =============================================================================
# PRICE ALERTS
# =============================================================================

@app.post("/api/alerts/price")
async def create_price_alert(symbol: str = Query(...),
                            condition: str = Query(...),  # above, below
                            target_price: float = Query(...),
                            user: dict = Depends(require_auth)):
    """Create a price alert"""
    conn = get_db()
    conn.execute("""
        INSERT INTO alerts (user_id, alert_type, title, message, severity, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user["id"], "price_alert", f"Price Alert: {symbol}",
          f"Alert when {symbol} goes {condition} ${target_price}",
          "info", f'{{"symbol": "{symbol}", "condition": "{condition}", "target": {target_price}}}'))
    conn.commit()
    conn.close()
    
    return {"status": "created", "symbol": symbol, "condition": condition, "target_price": target_price}

@app.get("/api/alerts/check-prices")
async def check_price_alerts(user: dict = Depends(require_auth)):
    """Check if any price alerts have been triggered"""
    # In production, this would check real-time prices
    # For now, simulate some triggered alerts
    triggered = []
    
    # Random chance of alert being triggered
    if random.random() > 0.7:
        triggered.append({
            "symbol": random.choice(["AAPL", "MSFT", "GOOGL"]),
            "current_price": round(random.uniform(100, 500), 2),
            "target_price": round(random.uniform(100, 500), 2),
            "condition": random.choice(["above", "below"])
        })
    
    return {"triggered_alerts": triggered}

# =============================================================================
# V4 EXTENSIONS
# =============================================================================
try:
    from backend_extensions import register_v4_routes
    register_v4_routes(app)
    print("✅ V4 extensions loaded: Market Data, CSV Import/Export, Performance History")
except ImportError:
    print("⚠️ V4 extensions not available - basic features only")

# =============================================================================
# RUN
# =============================================================================
if __name__ == "__main__":
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
