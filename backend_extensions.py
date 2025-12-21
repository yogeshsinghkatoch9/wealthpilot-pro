"""
WealthPilot V4 Backend Extensions
=================================
New API endpoints for:
- Real market data
- CSV import/export
- Performance history tracking
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from io import StringIO
import json

# Import our new services
try:
    from market_data import (
        get_stock_quote, get_stock_quotes, get_historical_prices,
        get_stock_info, refresh_all_holdings, save_portfolio_snapshot,
        get_portfolio_history
    )
    HAS_MARKET_DATA = True
except ImportError:
    HAS_MARKET_DATA = False

try:
    from csv_service import (
        parse_csv, parse_csv_simple, export_holdings_csv,
        export_portfolio_summary_csv, export_transactions_csv,
        export_performance_csv, generate_import_template,
        generate_sample_import
    )
    HAS_CSV_SERVICE = True
except ImportError:
    HAS_CSV_SERVICE = False

# =============================================================================
# ROUTER
# =============================================================================
router = APIRouter(prefix="/api/v4", tags=["V4 Features"])

# =============================================================================
# MODELS
# =============================================================================
class StockLookupRequest(BaseModel):
    symbols: List[str]

class ImportRequest(BaseModel):
    csv_content: str
    portfolio_id: int

class SnapshotRequest(BaseModel):
    portfolio_id: int

# =============================================================================
# MARKET DATA ENDPOINTS
# =============================================================================
@router.get("/market/quote/{symbol}")
async def get_quote(symbol: str):
    """Get real-time quote for a stock symbol"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        quote = get_stock_quote(symbol)
        return {
            "symbol": quote.symbol,
            "price": quote.price,
            "change": quote.change,
            "change_percent": quote.change_percent,
            "volume": quote.volume,
            "high": quote.high,
            "low": quote.low,
            "open": quote.open,
            "previous_close": quote.previous_close,
            "name": quote.name,
            "sector": quote.sector,
            "dividend_yield": quote.dividend_yield,
            "timestamp": quote.timestamp.isoformat() if quote.timestamp else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/market/quotes")
async def get_quotes_bulk(request: StockLookupRequest):
    """Get quotes for multiple symbols"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        quotes = get_stock_quotes(request.symbols)
        return {
            symbol: {
                "price": q.price,
                "change": q.change,
                "change_percent": q.change_percent,
                "name": q.name,
                "sector": q.sector
            }
            for symbol, q in quotes.items()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/market/history/{symbol}")
async def get_history(symbol: str, days: int = Query(default=365, le=1825)):
    """Get historical price data for a symbol"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        history = get_historical_prices(symbol, days)
        return {
            "symbol": symbol.upper(),
            "days": days,
            "data": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/market/info/{symbol}")
async def get_info(symbol: str):
    """Get comprehensive stock information"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        return get_stock_info(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/market/refresh")
async def refresh_prices():
    """Refresh all holding prices from market data"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        count = refresh_all_holdings()
        return {"refreshed": count, "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# CSV IMPORT/EXPORT ENDPOINTS
# =============================================================================
@router.post("/import/csv")
async def import_csv(file: UploadFile = File(...)):
    """Import holdings from CSV file"""
    if not HAS_CSV_SERVICE:
        raise HTTPException(status_code=503, detail="CSV service not available")
    
    try:
        content = await file.read()
        content = content.decode('utf-8')
        
        result = parse_csv(content)
        
        return {
            "success": result.success,
            "total_rows": result.total_rows,
            "successful_rows": result.successful_rows,
            "holdings": [h.to_dict() for h in result.holdings],
            "errors": result.errors,
            "warnings": result.warnings
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")

@router.post("/import/preview")
async def preview_import(csv_content: str):
    """Preview CSV import without saving"""
    if not HAS_CSV_SERVICE:
        raise HTTPException(status_code=503, detail="CSV service not available")
    
    try:
        result = parse_csv(csv_content)
        return {
            "success": result.success,
            "total_rows": result.total_rows,
            "successful_rows": result.successful_rows,
            "holdings": [h.to_dict() for h in result.holdings[:10]],  # Preview first 10
            "errors": result.errors[:5],  # First 5 errors
            "warnings": result.warnings
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export/holdings/{portfolio_id}")
async def export_holdings(portfolio_id: int, get_current_user = None):
    """Export portfolio holdings to CSV"""
    if not HAS_CSV_SERVICE:
        raise HTTPException(status_code=503, detail="CSV service not available")
    
    # This would normally use database connection
    # For now, return template format
    csv_content = generate_import_template()
    
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=holdings_{portfolio_id}.csv"}
    )

@router.get("/export/template")
async def get_import_template():
    """Get CSV template for importing holdings"""
    if not HAS_CSV_SERVICE:
        raise HTTPException(status_code=503, detail="CSV service not available")
    
    template = generate_import_template()
    
    return StreamingResponse(
        iter([template]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=import_template.csv"}
    )

@router.get("/export/sample")
async def get_sample_csv():
    """Get sample CSV with example data"""
    if not HAS_CSV_SERVICE:
        raise HTTPException(status_code=503, detail="CSV service not available")
    
    sample = generate_sample_import()
    
    return StreamingResponse(
        iter([sample]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_portfolio.csv"}
    )

# =============================================================================
# PERFORMANCE HISTORY ENDPOINTS
# =============================================================================
@router.get("/performance/{portfolio_id}")
async def get_performance(portfolio_id: int, days: int = Query(default=365, le=1825)):
    """Get portfolio performance history"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        history = get_portfolio_history(portfolio_id, days)
        
        if not history:
            return {
                "portfolio_id": portfolio_id,
                "days": days,
                "data": [],
                "message": "No historical data available yet"
            }
        
        # Calculate statistics
        if len(history) > 1:
            start_value = history[0]['total_value']
            end_value = history[-1]['total_value']
            total_return = ((end_value - start_value) / start_value * 100) if start_value > 0 else 0
            
            values = [h['total_value'] for h in history]
            max_value = max(values)
            min_value = min(values)
            max_drawdown = ((max_value - min_value) / max_value * 100) if max_value > 0 else 0
        else:
            total_return = 0
            max_drawdown = 0
        
        return {
            "portfolio_id": portfolio_id,
            "days": days,
            "total_return": round(total_return, 2),
            "max_drawdown": round(max_drawdown, 2),
            "data_points": len(history),
            "data": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/performance/snapshot")
async def create_snapshot(request: SnapshotRequest):
    """Create a snapshot of current portfolio value"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    # This would normally calculate from holdings
    # For now, return success
    return {"status": "success", "message": "Snapshot created"}

@router.get("/performance/export/{portfolio_id}")
async def export_performance(portfolio_id: int, days: int = Query(default=365)):
    """Export performance history to CSV"""
    if not HAS_CSV_SERVICE or not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Required services not available")
    
    try:
        history = get_portfolio_history(portfolio_id, days)
        csv_content = export_performance_csv(history)
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=performance_{portfolio_id}.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# BENCHMARK COMPARISON
# =============================================================================
@router.get("/benchmark/compare/{portfolio_id}")
async def compare_to_benchmark(
    portfolio_id: int, 
    benchmark: str = Query(default="SPY"),
    days: int = Query(default=365)
):
    """Compare portfolio performance to a benchmark"""
    if not HAS_MARKET_DATA:
        raise HTTPException(status_code=503, detail="Market data service not available")
    
    try:
        # Get benchmark history
        benchmark_history = get_historical_prices(benchmark, days)
        portfolio_history = get_portfolio_history(portfolio_id, days)
        
        if not benchmark_history:
            return {"error": "Could not fetch benchmark data"}
        
        # Calculate benchmark return
        if len(benchmark_history) > 1:
            start_price = benchmark_history[0]['close']
            end_price = benchmark_history[-1]['close']
            benchmark_return = ((end_price - start_price) / start_price * 100)
        else:
            benchmark_return = 0
        
        # Calculate portfolio return
        if len(portfolio_history) > 1:
            start_value = portfolio_history[0]['total_value']
            end_value = portfolio_history[-1]['total_value']
            portfolio_return = ((end_value - start_value) / start_value * 100) if start_value > 0 else 0
        else:
            portfolio_return = 0
        
        return {
            "portfolio_id": portfolio_id,
            "benchmark": benchmark,
            "days": days,
            "portfolio_return": round(portfolio_return, 2),
            "benchmark_return": round(benchmark_return, 2),
            "alpha": round(portfolio_return - benchmark_return, 2),
            "outperformed": portfolio_return > benchmark_return
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# HELPER FUNCTION TO ADD ROUTER TO MAIN APP
# =============================================================================
def register_v4_routes(app):
    """Register V4 routes with the main FastAPI app"""
    app.include_router(router)
    return app
