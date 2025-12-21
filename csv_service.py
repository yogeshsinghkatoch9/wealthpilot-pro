"""
CSV Import/Export Service
=========================
Handles importing and exporting portfolio data in various formats.
Supports: CSV, Excel-compatible CSV, and common brokerage formats.
"""

import csv
import json
from io import StringIO, BytesIO
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import re

# =============================================================================
# DATA CLASSES
# =============================================================================
@dataclass
class ImportedHolding:
    symbol: str
    name: Optional[str]
    quantity: float
    cost_basis: float
    purchase_date: Optional[str] = None
    asset_type: str = "Equity"
    
    def to_dict(self) -> Dict:
        return {
            'symbol': self.symbol.upper(),
            'name': self.name or f"{self.symbol} Inc.",
            'quantity': self.quantity,
            'cost_basis': self.cost_basis,
            'purchase_date': self.purchase_date,
            'asset_type': self.asset_type
        }

@dataclass 
class ImportResult:
    success: bool
    holdings: List[ImportedHolding]
    errors: List[str]
    warnings: List[str]
    total_rows: int
    successful_rows: int

# =============================================================================
# CSV COLUMN MAPPING
# =============================================================================
COLUMN_MAPPINGS = {
    # Standard columns
    'symbol': ['symbol', 'ticker', 'stock', 'sym', 'security'],
    'name': ['name', 'company', 'description', 'security name', 'stock name'],
    'quantity': ['quantity', 'qty', 'shares', 'units', 'amount', 'share quantity'],
    'cost_basis': ['cost', 'cost_basis', 'cost basis', 'price', 'purchase price', 
                   'avg cost', 'average cost', 'basis', 'purchase_price'],
    'purchase_date': ['date', 'purchase_date', 'purchase date', 'acquired', 
                      'acquisition date', 'buy date', 'trade date'],
    'asset_type': ['type', 'asset_type', 'asset type', 'security type', 'category']
}

# Brokerage-specific formats
BROKERAGE_FORMATS = {
    'fidelity': {
        'symbol': 'Symbol',
        'name': 'Description',
        'quantity': 'Quantity',
        'cost_basis': 'Cost Basis Per Share'
    },
    'schwab': {
        'symbol': 'Symbol',
        'name': 'Description',
        'quantity': 'Quantity',
        'cost_basis': 'Price'
    },
    'vanguard': {
        'symbol': 'Symbol',
        'name': 'Investment Name',
        'quantity': 'Shares',
        'cost_basis': 'Share Price'
    },
    'robinhood': {
        'symbol': 'Instrument',
        'name': 'Name',
        'quantity': 'Quantity',
        'cost_basis': 'Average Cost'
    },
    'etrade': {
        'symbol': 'Symbol',
        'name': 'Security Description',
        'quantity': 'Quantity',
        'cost_basis': 'Price Paid'
    }
}

# =============================================================================
# PARSING UTILITIES
# =============================================================================
def normalize_column_name(name: str) -> str:
    """Normalize column name for matching"""
    return name.lower().strip().replace('_', ' ').replace('-', ' ')

def find_column_mapping(headers: List[str]) -> Dict[str, int]:
    """Find which CSV columns map to our required fields"""
    mapping = {}
    normalized_headers = [normalize_column_name(h) for h in headers]
    
    for field, possible_names in COLUMN_MAPPINGS.items():
        for i, header in enumerate(normalized_headers):
            if header in possible_names:
                mapping[field] = i
                break
    
    return mapping

def parse_number(value: str) -> Optional[float]:
    """Parse a number from various formats"""
    if not value:
        return None
    
    # Remove currency symbols, commas, and whitespace
    cleaned = re.sub(r'[$,\s]', '', str(value))
    
    # Handle parentheses for negative numbers
    if cleaned.startswith('(') and cleaned.endswith(')'):
        cleaned = '-' + cleaned[1:-1]
    
    try:
        return float(cleaned)
    except ValueError:
        return None

def parse_date(value: str) -> Optional[str]:
    """Parse date from various formats, return ISO format"""
    if not value:
        return None
    
    formats = [
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%m/%d/%y',
        '%d/%m/%Y',
        '%Y/%m/%d',
        '%m-%d-%Y',
        '%d-%m-%Y',
        '%b %d, %Y',
        '%B %d, %Y'
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(value.strip(), fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    return None

def detect_brokerage(headers: List[str]) -> Optional[str]:
    """Try to detect which brokerage format the CSV is from"""
    normalized = set(normalize_column_name(h) for h in headers)
    
    for brokerage, columns in BROKERAGE_FORMATS.items():
        expected = set(normalize_column_name(c) for c in columns.values())
        if expected.issubset(normalized):
            return brokerage
    
    return None

# =============================================================================
# IMPORT FUNCTIONS
# =============================================================================
def parse_csv(content: str, delimiter: str = ',') -> ImportResult:
    """
    Parse CSV content and extract holdings.
    
    Args:
        content: CSV file content as string
        delimiter: CSV delimiter (default comma)
    
    Returns:
        ImportResult with parsed holdings and any errors
    """
    holdings = []
    errors = []
    warnings = []
    
    try:
        # Try to detect delimiter if not specified
        if delimiter == ',':
            dialect = csv.Sniffer().sniff(content[:2000])
            delimiter = dialect.delimiter
    except:
        pass
    
    reader = csv.reader(StringIO(content), delimiter=delimiter)
    rows = list(reader)
    
    if len(rows) < 2:
        return ImportResult(
            success=False,
            holdings=[],
            errors=["CSV file must have a header row and at least one data row"],
            warnings=[],
            total_rows=len(rows),
            successful_rows=0
        )
    
    headers = rows[0]
    data_rows = rows[1:]
    
    # Detect brokerage format
    brokerage = detect_brokerage(headers)
    if brokerage:
        warnings.append(f"Detected {brokerage.title()} format")
    
    # Find column mappings
    mapping = find_column_mapping(headers)
    
    # Check for required columns
    if 'symbol' not in mapping:
        return ImportResult(
            success=False,
            holdings=[],
            errors=["Could not find 'Symbol' column in CSV"],
            warnings=warnings,
            total_rows=len(data_rows),
            successful_rows=0
        )
    
    if 'quantity' not in mapping:
        return ImportResult(
            success=False,
            holdings=[],
            errors=["Could not find 'Quantity' column in CSV"],
            warnings=warnings,
            total_rows=len(data_rows),
            successful_rows=0
        )
    
    if 'cost_basis' not in mapping:
        warnings.append("No cost basis column found - using 0 as default")
    
    # Parse data rows
    for i, row in enumerate(data_rows, start=2):
        try:
            if len(row) <= mapping['symbol']:
                continue
            
            symbol = row[mapping['symbol']].strip().upper()
            if not symbol or symbol in ['', '-', 'N/A', 'CASH', 'PENDING']:
                continue
            
            # Remove any special characters from symbol
            symbol = re.sub(r'[^A-Z0-9.]', '', symbol)
            if not symbol:
                continue
            
            quantity = parse_number(row[mapping['quantity']]) if 'quantity' in mapping and len(row) > mapping['quantity'] else None
            if quantity is None or quantity <= 0:
                errors.append(f"Row {i}: Invalid quantity for {symbol}")
                continue
            
            cost_basis = 0.0
            if 'cost_basis' in mapping and len(row) > mapping['cost_basis']:
                cost_basis = parse_number(row[mapping['cost_basis']]) or 0.0
            
            name = None
            if 'name' in mapping and len(row) > mapping['name']:
                name = row[mapping['name']].strip()
            
            purchase_date = None
            if 'purchase_date' in mapping and len(row) > mapping['purchase_date']:
                purchase_date = parse_date(row[mapping['purchase_date']])
            
            asset_type = "Equity"
            if 'asset_type' in mapping and len(row) > mapping['asset_type']:
                t = row[mapping['asset_type']].strip().lower()
                if 'etf' in t:
                    asset_type = "ETF"
                elif 'bond' in t or 'fixed' in t:
                    asset_type = "Bond"
                elif 'fund' in t or 'mutual' in t:
                    asset_type = "Mutual Fund"
            
            holdings.append(ImportedHolding(
                symbol=symbol,
                name=name,
                quantity=quantity,
                cost_basis=cost_basis,
                purchase_date=purchase_date,
                asset_type=asset_type
            ))
            
        except Exception as e:
            errors.append(f"Row {i}: Error parsing - {str(e)}")
    
    return ImportResult(
        success=len(holdings) > 0,
        holdings=holdings,
        errors=errors,
        warnings=warnings,
        total_rows=len(data_rows),
        successful_rows=len(holdings)
    )

def parse_csv_simple(content: str) -> Tuple[List[Dict], List[str]]:
    """
    Simple CSV parser for basic format: symbol,quantity,cost_basis
    Returns tuple of (holdings_list, errors_list)
    """
    result = parse_csv(content)
    holdings = [h.to_dict() for h in result.holdings]
    errors = result.errors + result.warnings
    return holdings, errors

# =============================================================================
# EXPORT FUNCTIONS
# =============================================================================
def export_holdings_csv(holdings: List[Dict]) -> str:
    """
    Export holdings to CSV format.
    
    Args:
        holdings: List of holding dictionaries
    
    Returns:
        CSV content as string
    """
    if not holdings:
        return "symbol,name,quantity,cost_basis,current_price,value,gain_loss,purchase_date\n"
    
    output = StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'Symbol', 'Name', 'Quantity', 'Cost Basis', 'Current Price',
        'Market Value', 'Gain/Loss', 'Gain/Loss %', 'Purchase Date', 'Asset Type'
    ])
    
    # Data
    for h in holdings:
        quantity = h.get('quantity', 0)
        cost_basis = h.get('cost_basis', 0)
        current_price = h.get('current_price', cost_basis)
        value = quantity * current_price
        total_cost = quantity * cost_basis
        gain = value - total_cost
        gain_pct = (gain / total_cost * 100) if total_cost > 0 else 0
        
        writer.writerow([
            h.get('symbol', ''),
            h.get('name', ''),
            quantity,
            f"{cost_basis:.2f}",
            f"{current_price:.2f}",
            f"{value:.2f}",
            f"{gain:.2f}",
            f"{gain_pct:.2f}%",
            h.get('purchase_date', ''),
            h.get('asset_type', 'Equity')
        ])
    
    return output.getvalue()

def export_portfolio_summary_csv(portfolio: Dict, holdings: List[Dict]) -> str:
    """Export complete portfolio summary to CSV"""
    output = StringIO()
    writer = csv.writer(output)
    
    # Portfolio header
    writer.writerow(['Portfolio Summary'])
    writer.writerow(['Name', portfolio.get('name', 'Portfolio')])
    writer.writerow(['Type', portfolio.get('portfolio_type', 'Taxable')])
    writer.writerow(['Total Value', f"${portfolio.get('total_value', 0):,.2f}"])
    writer.writerow(['Total Cost', f"${portfolio.get('total_cost', 0):,.2f}"])
    writer.writerow(['Total Gain/Loss', f"${portfolio.get('total_gain', 0):,.2f}"])
    writer.writerow(['Annual Income', f"${portfolio.get('total_income', 0):,.2f}"])
    writer.writerow([])  # Empty row
    
    # Holdings header
    writer.writerow(['Holdings'])
    writer.writerow([
        'Symbol', 'Name', 'Quantity', 'Cost Basis', 'Current Price',
        'Market Value', 'Gain/Loss', 'Gain/Loss %', 'Dividend Yield', 'Sector'
    ])
    
    # Holdings data
    for h in holdings:
        quantity = h.get('quantity', 0)
        cost_basis = h.get('cost_basis', 0)
        current_price = h.get('current_price', cost_basis)
        value = quantity * current_price
        total_cost = quantity * cost_basis
        gain = value - total_cost
        gain_pct = (gain / total_cost * 100) if total_cost > 0 else 0
        
        writer.writerow([
            h.get('symbol', ''),
            h.get('name', ''),
            quantity,
            f"${cost_basis:.2f}",
            f"${current_price:.2f}",
            f"${value:.2f}",
            f"${gain:.2f}",
            f"{gain_pct:.2f}%",
            f"{(h.get('dividend_yield', 0) * 100):.2f}%",
            h.get('sector', 'Unknown')
        ])
    
    return output.getvalue()

def export_transactions_csv(transactions: List[Dict]) -> str:
    """Export transaction history to CSV"""
    if not transactions:
        return "date,type,symbol,quantity,price,total,notes\n"
    
    output = StringIO()
    writer = csv.writer(output)
    
    writer.writerow(['Date', 'Type', 'Symbol', 'Quantity', 'Price', 'Total', 'Notes'])
    
    for t in transactions:
        quantity = t.get('quantity', 0)
        price = t.get('price', 0)
        writer.writerow([
            t.get('transaction_date', ''),
            t.get('transaction_type', ''),
            t.get('symbol', ''),
            quantity,
            f"${price:.2f}",
            f"${quantity * price:.2f}",
            t.get('notes', '')
        ])
    
    return output.getvalue()

def export_performance_csv(history: List[Dict]) -> str:
    """Export portfolio performance history to CSV"""
    if not history:
        return "date,total_value,total_cost,total_gain,gain_pct\n"
    
    output = StringIO()
    writer = csv.writer(output)
    
    writer.writerow(['Date', 'Total Value', 'Total Cost', 'Gain/Loss', 'Gain/Loss %'])
    
    for h in history:
        value = h.get('total_value', 0)
        cost = h.get('total_cost', 0)
        gain = h.get('total_gain', 0)
        gain_pct = (gain / cost * 100) if cost > 0 else 0
        
        writer.writerow([
            h.get('date', ''),
            f"${value:.2f}",
            f"${cost:.2f}",
            f"${gain:.2f}",
            f"{gain_pct:.2f}%"
        ])
    
    return output.getvalue()

# =============================================================================
# TEMPLATE GENERATION
# =============================================================================
def generate_import_template() -> str:
    """Generate a CSV template for importing holdings"""
    return """symbol,name,quantity,cost_basis,purchase_date,asset_type
AAPL,Apple Inc.,100,150.00,2023-01-15,Equity
MSFT,Microsoft Corporation,50,280.00,2023-02-20,Equity
VOO,Vanguard S&P 500 ETF,25,380.00,2023-03-10,ETF
"""

def generate_sample_import() -> str:
    """Generate sample CSV with realistic data"""
    return """symbol,name,quantity,cost_basis,purchase_date,asset_type
AAPL,Apple Inc.,100,145.50,2023-01-15,Equity
MSFT,Microsoft Corporation,75,310.25,2023-02-01,Equity
GOOGL,Alphabet Inc.,30,125.00,2023-03-10,Equity
AMZN,Amazon.com Inc.,50,98.75,2023-04-05,Equity
NVDA,NVIDIA Corporation,40,220.00,2023-05-15,Equity
JPM,JPMorgan Chase & Co.,100,140.50,2023-06-01,Equity
JNJ,Johnson & Johnson,60,162.25,2023-07-10,Equity
VOO,Vanguard S&P 500 ETF,50,380.00,2023-08-01,ETF
VYM,Vanguard High Dividend ETF,100,105.50,2023-09-15,ETF
SCHD,Schwab US Dividend ETF,75,72.00,2023-10-01,ETF
"""
