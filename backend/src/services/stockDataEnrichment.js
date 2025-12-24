/**
 * Stock Data Enrichment Service
 * Provides sector classification, dividend data, and company info for stocks
 */

// Comprehensive sector mapping for common stocks
const STOCK_SECTORS = {
  // Technology
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics', dividendYield: 0.48 },
  'MSFT': { sector: 'Technology', industry: 'Software - Infrastructure', dividendYield: 0.72 },
  'GOOGL': { sector: 'Technology', industry: 'Internet Content & Information', dividendYield: 0 },
  'GOOG': { sector: 'Technology', industry: 'Internet Content & Information', dividendYield: 0 },
  'META': { sector: 'Technology', industry: 'Internet Content & Information', dividendYield: 0.42 },
  'AMZN': { sector: 'Technology', industry: 'Internet Retail', dividendYield: 0 },
  'NVDA': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 0.03 },
  'AMD': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 0 },
  'INTC': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 1.52 },
  'CRM': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'ORCL': { sector: 'Technology', industry: 'Software - Infrastructure', dividendYield: 1.28 },
  'ADBE': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'CSCO': { sector: 'Technology', industry: 'Communication Equipment', dividendYield: 2.68 },
  'IBM': { sector: 'Technology', industry: 'Information Technology Services', dividendYield: 3.92 },
  'AVGO': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 1.78 },
  'QCOM': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 2.12 },
  'TXN': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 2.85 },
  'NOW': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment', dividendYield: 0.82 },
  'MU': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 0.48 },
  'PLTR': { sector: 'Technology', industry: 'Software - Infrastructure', dividendYield: 0 },
  'TSM': { sector: 'Technology', industry: 'Semiconductors', dividendYield: 1.45 },
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment', dividendYield: 0.78 },
  'SNOW': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'NET': { sector: 'Technology', industry: 'Software - Infrastructure', dividendYield: 0 },
  'SHOP': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'SQ': { sector: 'Technology', industry: 'Software - Infrastructure', dividendYield: 0 },
  'UBER': { sector: 'Technology', industry: 'Software - Application', dividendYield: 0 },
  'ABNB': { sector: 'Technology', industry: 'Internet Content & Information', dividendYield: 0 },
  'PYPL': { sector: 'Technology', industry: 'Credit Services', dividendYield: 0 },

  // Financial Services
  'JPM': { sector: 'Financial Services', industry: 'Banks - Diversified', dividendYield: 2.15 },
  'BAC': { sector: 'Financial Services', industry: 'Banks - Diversified', dividendYield: 2.48 },
  'WFC': { sector: 'Financial Services', industry: 'Banks - Diversified', dividendYield: 2.72 },
  'GS': { sector: 'Financial Services', industry: 'Capital Markets', dividendYield: 2.28 },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets', dividendYield: 3.42 },
  'C': { sector: 'Financial Services', industry: 'Banks - Diversified', dividendYield: 3.28 },
  'BLK': { sector: 'Financial Services', industry: 'Asset Management', dividendYield: 2.18 },
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets', dividendYield: 1.42 },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services', dividendYield: 1.08 },
  'V': { sector: 'Financial Services', industry: 'Credit Services', dividendYield: 0.75 },
  'MA': { sector: 'Financial Services', industry: 'Credit Services', dividendYield: 0.58 },
  'BRK.A': { sector: 'Financial Services', industry: 'Insurance - Diversified', dividendYield: 0 },
  'BRK.B': { sector: 'Financial Services', industry: 'Insurance - Diversified', dividendYield: 0 },
  'COF': { sector: 'Financial Services', industry: 'Credit Services', dividendYield: 1.52 },
  'USB': { sector: 'Financial Services', industry: 'Banks - Regional', dividendYield: 4.28 },
  'PNC': { sector: 'Financial Services', industry: 'Banks - Regional', dividendYield: 3.62 },
  'TFC': { sector: 'Financial Services', industry: 'Banks - Regional', dividendYield: 5.12 },

  // Healthcare
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 3.12 },
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans', dividendYield: 1.42 },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 5.82 },
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 3.45 },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 2.78 },
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 0.68 },
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research', dividendYield: 0.28 },
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices', dividendYield: 1.92 },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research', dividendYield: 0.42 },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 4.52 },
  'AMGN': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 2.98 },
  'GILD': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 3.72 },
  'MRNA': { sector: 'Healthcare', industry: 'Biotechnology', dividendYield: 0 },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Instruments', dividendYield: 0 },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology', dividendYield: 0 },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology', dividendYield: 0 },
  'ZTS': { sector: 'Healthcare', industry: 'Drug Manufacturers', dividendYield: 0.85 },
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices', dividendYield: 3.28 },
  'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans', dividendYield: 4.12 },
  'CI': { sector: 'Healthcare', industry: 'Healthcare Plans', dividendYield: 1.62 },
  'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans', dividendYield: 1.18 },
  'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans', dividendYield: 0.82 },

  // Consumer Discretionary
  'TSLA': { sector: 'Consumer Discretionary', industry: 'Auto Manufacturers', dividendYield: 0 },
  'HD': { sector: 'Consumer Discretionary', industry: 'Home Improvement Retail', dividendYield: 2.28 },
  'NKE': { sector: 'Consumer Discretionary', industry: 'Footwear & Accessories', dividendYield: 1.52 },
  'MCD': { sector: 'Consumer Discretionary', industry: 'Restaurants', dividendYield: 2.18 },
  'SBUX': { sector: 'Consumer Discretionary', industry: 'Restaurants', dividendYield: 2.42 },
  'LOW': { sector: 'Consumer Discretionary', industry: 'Home Improvement Retail', dividendYield: 1.82 },
  'TGT': { sector: 'Consumer Discretionary', industry: 'Discount Stores', dividendYield: 2.92 },
  'COST': { sector: 'Consumer Staples', industry: 'Discount Stores', dividendYield: 0.52 },
  'CMG': { sector: 'Consumer Discretionary', industry: 'Restaurants', dividendYield: 0 },
  'BKNG': { sector: 'Consumer Discretionary', industry: 'Travel Services', dividendYield: 0 },
  'MAR': { sector: 'Consumer Discretionary', industry: 'Lodging', dividendYield: 0.92 },
  'F': { sector: 'Consumer Discretionary', industry: 'Auto Manufacturers', dividendYield: 4.82 },
  'GM': { sector: 'Consumer Discretionary', industry: 'Auto Manufacturers', dividendYield: 0.85 },
  'TJX': { sector: 'Consumer Discretionary', industry: 'Apparel Retail', dividendYield: 1.28 },
  'ROST': { sector: 'Consumer Discretionary', industry: 'Apparel Retail', dividendYield: 0.92 },
  'DIS': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 0.82 },
  'NFLX': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 0 },
  'LULU': { sector: 'Consumer Discretionary', industry: 'Apparel Retail', dividendYield: 0 },

  // Consumer Staples
  'PG': { sector: 'Consumer Staples', industry: 'Household & Personal Products', dividendYield: 2.42 },
  'KO': { sector: 'Consumer Staples', industry: 'Beverages - Non-Alcoholic', dividendYield: 2.85 },
  'PEP': { sector: 'Consumer Staples', industry: 'Beverages - Non-Alcoholic', dividendYield: 2.72 },
  'WMT': { sector: 'Consumer Staples', industry: 'Discount Stores', dividendYield: 1.28 },
  'PM': { sector: 'Consumer Staples', industry: 'Tobacco', dividendYield: 4.92 },
  'MO': { sector: 'Consumer Staples', industry: 'Tobacco', dividendYield: 8.12 },
  'MDLZ': { sector: 'Consumer Staples', industry: 'Confectioners', dividendYield: 2.18 },
  'CL': { sector: 'Consumer Staples', industry: 'Household & Personal Products', dividendYield: 2.28 },
  'KMB': { sector: 'Consumer Staples', industry: 'Household & Personal Products', dividendYield: 3.52 },
  'GIS': { sector: 'Consumer Staples', industry: 'Packaged Foods', dividendYield: 3.72 },
  'K': { sector: 'Consumer Staples', industry: 'Packaged Foods', dividendYield: 2.92 },
  'HSY': { sector: 'Consumer Staples', industry: 'Confectioners', dividendYield: 2.18 },
  'STZ': { sector: 'Consumer Staples', industry: 'Beverages - Wineries & Distilleries', dividendYield: 1.42 },
  'KHC': { sector: 'Consumer Staples', industry: 'Packaged Foods', dividendYield: 4.52 },
  'SYY': { sector: 'Consumer Staples', industry: 'Food Distribution', dividendYield: 2.62 },

  // Energy
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated', dividendYield: 3.28 },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated', dividendYield: 4.12 },
  'COP': { sector: 'Energy', industry: 'Oil & Gas E&P', dividendYield: 2.85 },
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment', dividendYield: 2.42 },
  'EOG': { sector: 'Energy', industry: 'Oil & Gas E&P', dividendYield: 2.92 },
  'PXD': { sector: 'Energy', industry: 'Oil & Gas E&P', dividendYield: 5.12 },
  'OXY': { sector: 'Energy', industry: 'Oil & Gas E&P', dividendYield: 1.28 },
  'MPC': { sector: 'Energy', industry: 'Oil & Gas Refining', dividendYield: 2.15 },
  'PSX': { sector: 'Energy', industry: 'Oil & Gas Refining', dividendYield: 3.28 },
  'VLO': { sector: 'Energy', industry: 'Oil & Gas Refining', dividendYield: 3.42 },
  'HAL': { sector: 'Energy', industry: 'Oil & Gas Equipment', dividendYield: 1.82 },
  'DVN': { sector: 'Energy', industry: 'Oil & Gas E&P', dividendYield: 4.52 },
  'KMI': { sector: 'Energy', industry: 'Oil & Gas Midstream', dividendYield: 6.28 },
  'WMB': { sector: 'Energy', industry: 'Oil & Gas Midstream', dividendYield: 4.92 },
  'OKE': { sector: 'Energy', industry: 'Oil & Gas Midstream', dividendYield: 5.12 },

  // Industrials
  'CAT': { sector: 'Industrials', industry: 'Farm & Heavy Construction', dividendYield: 1.62 },
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 0 },
  'UNP': { sector: 'Industrials', industry: 'Railroads', dividendYield: 2.15 },
  'HON': { sector: 'Industrials', industry: 'Conglomerates', dividendYield: 2.08 },
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 2.28 },
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 2.72 },
  'GE': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 0.72 },
  'DE': { sector: 'Industrials', industry: 'Farm & Heavy Construction', dividendYield: 1.32 },
  'MMM': { sector: 'Industrials', industry: 'Conglomerates', dividendYield: 5.82 },
  'UPS': { sector: 'Industrials', industry: 'Integrated Freight & Logistics', dividendYield: 4.52 },
  'FDX': { sector: 'Industrials', industry: 'Integrated Freight & Logistics', dividendYield: 1.92 },
  'NOC': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 1.52 },
  'GD': { sector: 'Industrials', industry: 'Aerospace & Defense', dividendYield: 2.08 },
  'CSX': { sector: 'Industrials', industry: 'Railroads', dividendYield: 1.28 },
  'NSC': { sector: 'Industrials', industry: 'Railroads', dividendYield: 2.18 },
  'EMR': { sector: 'Industrials', industry: 'Electrical Equipment', dividendYield: 1.92 },
  'ETN': { sector: 'Industrials', industry: 'Electrical Equipment', dividendYield: 1.18 },
  'ITW': { sector: 'Industrials', industry: 'Specialty Industrial Machinery', dividendYield: 2.28 },
  'WM': { sector: 'Industrials', industry: 'Waste Management', dividendYield: 1.42 },
  'RSG': { sector: 'Industrials', industry: 'Waste Management', dividendYield: 1.18 },

  // Utilities
  'NEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 2.72 },
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.92 },
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.82 },
  'D': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 4.28 },
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.72 },
  'EXC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.52 },
  'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.28 },
  'SRE': { sector: 'Utilities', industry: 'Utilities - Diversified', dividendYield: 3.12 },
  'WEC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.42 },
  'ES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.18 },
  'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric', dividendYield: 3.52 },
  'AWK': { sector: 'Utilities', industry: 'Utilities - Regulated Water', dividendYield: 2.12 },

  // Real Estate
  'AMT': { sector: 'Real Estate', industry: 'REIT - Specialty', dividendYield: 3.12 },
  'PLD': { sector: 'Real Estate', industry: 'REIT - Industrial', dividendYield: 2.82 },
  'CCI': { sector: 'Real Estate', industry: 'REIT - Specialty', dividendYield: 5.72 },
  'EQIX': { sector: 'Real Estate', industry: 'REIT - Specialty', dividendYield: 1.92 },
  'SPG': { sector: 'Real Estate', industry: 'REIT - Retail', dividendYield: 5.28 },
  'PSA': { sector: 'Real Estate', industry: 'REIT - Industrial', dividendYield: 4.12 },
  'O': { sector: 'Real Estate', industry: 'REIT - Retail', dividendYield: 5.82 },
  'WELL': { sector: 'Real Estate', industry: 'REIT - Healthcare Facilities', dividendYield: 2.72 },
  'DLR': { sector: 'Real Estate', industry: 'REIT - Specialty', dividendYield: 3.42 },
  'AVB': { sector: 'Real Estate', industry: 'REIT - Residential', dividendYield: 3.18 },
  'EQR': { sector: 'Real Estate', industry: 'REIT - Residential', dividendYield: 3.82 },
  'VTR': { sector: 'Real Estate', industry: 'REIT - Healthcare Facilities', dividendYield: 3.28 },
  'ARE': { sector: 'Real Estate', industry: 'REIT - Office', dividendYield: 4.52 },
  'MAA': { sector: 'Real Estate', industry: 'REIT - Residential', dividendYield: 3.92 },
  'UDR': { sector: 'Real Estate', industry: 'REIT - Residential', dividendYield: 4.12 },

  // Materials
  'LIN': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 1.28 },
  'APD': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 2.42 },
  'SHW': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 0.92 },
  'FCX': { sector: 'Materials', industry: 'Copper', dividendYield: 1.52 },
  'NEM': { sector: 'Materials', industry: 'Gold', dividendYield: 2.18 },
  'NUE': { sector: 'Materials', industry: 'Steel', dividendYield: 1.42 },
  'DD': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 1.82 },
  'DOW': { sector: 'Materials', industry: 'Chemicals', dividendYield: 5.12 },
  'ECL': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 1.12 },
  'PPG': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 1.72 },
  'VMC': { sector: 'Materials', industry: 'Building Materials', dividendYield: 0.72 },
  'MLM': { sector: 'Materials', industry: 'Building Materials', dividendYield: 0.62 },
  'CTVA': { sector: 'Materials', industry: 'Agricultural Inputs', dividendYield: 1.08 },
  'ALB': { sector: 'Materials', industry: 'Specialty Chemicals', dividendYield: 0.82 },
  'CF': { sector: 'Materials', industry: 'Agricultural Inputs', dividendYield: 2.28 },

  // Communication Services
  'CMCSA': { sector: 'Communication Services', industry: 'Telecom Services', dividendYield: 2.92 },
  'VZ': { sector: 'Communication Services', industry: 'Telecom Services', dividendYield: 6.52 },
  'T': { sector: 'Communication Services', industry: 'Telecom Services', dividendYield: 6.28 },
  'TMUS': { sector: 'Communication Services', industry: 'Telecom Services', dividendYield: 1.52 },
  'CHTR': { sector: 'Communication Services', industry: 'Telecom Services', dividendYield: 0 },
  'EA': { sector: 'Communication Services', industry: 'Electronic Gaming', dividendYield: 0.52 },
  'ATVI': { sector: 'Communication Services', industry: 'Electronic Gaming', dividendYield: 0.62 },
  'TTWO': { sector: 'Communication Services', industry: 'Electronic Gaming', dividendYield: 0 },
  'WBD': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 0 },
  'PARA': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 0.82 },
  'FOX': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 1.28 },
  'FOXA': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 1.18 },
  'LYV': { sector: 'Communication Services', industry: 'Entertainment', dividendYield: 0 },
  'OMC': { sector: 'Communication Services', industry: 'Advertising Agencies', dividendYield: 2.82 },
  'IPG': { sector: 'Communication Services', industry: 'Advertising Agencies', dividendYield: 3.72 },

  // ETFs
  'SPY': { sector: 'ETF - Equity', industry: 'Large Cap Blend', dividendYield: 1.28 },
  'QQQ': { sector: 'ETF - Equity', industry: 'Large Cap Growth', dividendYield: 0.52 },
  'IWM': { sector: 'ETF - Equity', industry: 'Small Cap Blend', dividendYield: 1.18 },
  'VTI': { sector: 'ETF - Equity', industry: 'Total Market', dividendYield: 1.32 },
  'VOO': { sector: 'ETF - Equity', industry: 'Large Cap Blend', dividendYield: 1.28 },
  'VTV': { sector: 'ETF - Equity', industry: 'Large Cap Value', dividendYield: 2.42 },
  'VUG': { sector: 'ETF - Equity', industry: 'Large Cap Growth', dividendYield: 0.52 },
  'VIG': { sector: 'ETF - Equity', industry: 'Dividend Growth', dividendYield: 1.82 },
  'SCHD': { sector: 'ETF - Equity', industry: 'Dividend', dividendYield: 3.42 },
  'VYM': { sector: 'ETF - Equity', industry: 'High Dividend', dividendYield: 2.92 },
  'XLF': { sector: 'ETF - Sector', industry: 'Financials', dividendYield: 1.72 },
  'XLK': { sector: 'ETF - Sector', industry: 'Technology', dividendYield: 0.72 },
  'XLE': { sector: 'ETF - Sector', industry: 'Energy', dividendYield: 3.52 },
  'XLV': { sector: 'ETF - Sector', industry: 'Healthcare', dividendYield: 1.42 },
  'XLI': { sector: 'ETF - Sector', industry: 'Industrials', dividendYield: 1.28 },
  'XLY': { sector: 'ETF - Sector', industry: 'Consumer Discretionary', dividendYield: 0.82 },
  'XLP': { sector: 'ETF - Sector', industry: 'Consumer Staples', dividendYield: 2.52 },
  'XLU': { sector: 'ETF - Sector', industry: 'Utilities', dividendYield: 2.92 },
  'XLRE': { sector: 'ETF - Sector', industry: 'Real Estate', dividendYield: 3.18 },
  'XLB': { sector: 'ETF - Sector', industry: 'Materials', dividendYield: 1.92 },
  'XLC': { sector: 'ETF - Sector', industry: 'Communication Services', dividendYield: 0.82 },
  'ARKK': { sector: 'ETF - Equity', industry: 'Innovation', dividendYield: 0 },
  'BND': { sector: 'ETF - Bond', industry: 'Total Bond Market', dividendYield: 4.28 },
  'AGG': { sector: 'ETF - Bond', industry: 'US Aggregate Bond', dividendYield: 4.12 },
  'TLT': { sector: 'ETF - Bond', industry: 'Long-Term Treasury', dividendYield: 3.92 },
  'HYG': { sector: 'ETF - Bond', industry: 'High Yield Corporate', dividendYield: 5.82 },
  'LQD': { sector: 'ETF - Bond', industry: 'Investment Grade Corporate', dividendYield: 4.52 },
  'GLD': { sector: 'ETF - Commodity', industry: 'Gold', dividendYield: 0 },
  'SLV': { sector: 'ETF - Commodity', industry: 'Silver', dividendYield: 0 },
  'USO': { sector: 'ETF - Commodity', industry: 'Oil', dividendYield: 0 },
  'VNQ': { sector: 'ETF - Sector', industry: 'Real Estate', dividendYield: 3.82 },
  'VXUS': { sector: 'ETF - Equity', industry: 'International', dividendYield: 2.92 },
  'EFA': { sector: 'ETF - Equity', industry: 'International Developed', dividendYield: 2.72 },
  'EEM': { sector: 'ETF - Equity', industry: 'Emerging Markets', dividendYield: 2.42 },
  'VWO': { sector: 'ETF - Equity', industry: 'Emerging Markets', dividendYield: 3.12 },
  'DIA': { sector: 'ETF - Equity', industry: 'Large Cap Blend', dividendYield: 1.72 }
};

// Company names mapping
const COMPANY_NAMES = {
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft Corporation',
  'GOOGL': 'Alphabet Inc. (Class A)',
  'GOOG': 'Alphabet Inc. (Class C)',
  'META': 'Meta Platforms, Inc.',
  'AMZN': 'Amazon.com, Inc.',
  'NVDA': 'NVIDIA Corporation',
  'AMD': 'Advanced Micro Devices, Inc.',
  'INTC': 'Intel Corporation',
  'TSLA': 'Tesla, Inc.',
  'JPM': 'JPMorgan Chase & Co.',
  'V': 'Visa Inc.',
  'MA': 'Mastercard Incorporated',
  'JNJ': 'Johnson & Johnson',
  'UNH': 'UnitedHealth Group Incorporated',
  'PG': 'The Procter & Gamble Company',
  'HD': 'The Home Depot, Inc.',
  'BAC': 'Bank of America Corporation',
  'PFE': 'Pfizer Inc.',
  'XOM': 'Exxon Mobil Corporation',
  'KO': 'The Coca-Cola Company',
  'PEP': 'PepsiCo, Inc.',
  'WMT': 'Walmart Inc.',
  'DIS': 'The Walt Disney Company',
  'NFLX': 'Netflix, Inc.',
  'COST': 'Costco Wholesale Corporation',
  'VZ': 'Verizon Communications Inc.',
  'T': 'AT&T Inc.',
  'CRM': 'Salesforce, Inc.',
  'ORCL': 'Oracle Corporation',
  'CSCO': 'Cisco Systems, Inc.',
  'IBM': 'International Business Machines',
  'CVX': 'Chevron Corporation',
  'ABBV': 'AbbVie Inc.',
  'MRK': 'Merck & Co., Inc.',
  'LLY': 'Eli Lilly and Company',
  'TMO': 'Thermo Fisher Scientific Inc.',
  'ABT': 'Abbott Laboratories',
  'NKE': 'Nike, Inc.',
  'MCD': 'McDonald\'s Corporation',
  'SBUX': 'Starbucks Corporation',
  'CAT': 'Caterpillar Inc.',
  'BA': 'The Boeing Company',
  'HON': 'Honeywell International Inc.',
  'GE': 'General Electric Company',
  'UNP': 'Union Pacific Corporation',
  'LMT': 'Lockheed Martin Corporation',
  'RTX': 'RTX Corporation',
  'NEE': 'NextEra Energy, Inc.',
  'DUK': 'Duke Energy Corporation',
  'SO': 'The Southern Company',
  'AMT': 'American Tower Corporation',
  'PLD': 'Prologis, Inc.',
  'SPG': 'Simon Property Group, Inc.',
  'O': 'Realty Income Corporation',
  'LIN': 'Linde plc',
  'APD': 'Air Products and Chemicals, Inc.',
  'GS': 'The Goldman Sachs Group, Inc.',
  'MS': 'Morgan Stanley',
  'BLK': 'BlackRock, Inc.',
  'SCHW': 'The Charles Schwab Corporation',
  'AXP': 'American Express Company',
  'SPY': 'SPDR S&P 500 ETF Trust',
  'QQQ': 'Invesco QQQ Trust',
  'IWM': 'iShares Russell 2000 ETF',
  'VTI': 'Vanguard Total Stock Market ETF',
  'VOO': 'Vanguard S&P 500 ETF'
};

class StockDataEnrichment {
  /**
   * Get sector and industry for a stock symbol
   */
  static getSectorData(symbol) {
    const upperSymbol = symbol?.toUpperCase()?.trim();
    if (!upperSymbol) return null;

    const data = STOCK_SECTORS[upperSymbol];
    if (data) {
      return {
        sector: data.sector,
        industry: data.industry,
        dividendYield: data.dividendYield
      };
    }

    // Try to infer sector from symbol patterns
    return this.inferSectorFromSymbol(upperSymbol);
  }

  /**
   * Get company name for a symbol
   */
  static getCompanyName(symbol) {
    const upperSymbol = symbol?.toUpperCase()?.trim();
    return COMPANY_NAMES[upperSymbol] || upperSymbol;
  }

  /**
   * Enrich a holding with sector and dividend data
   */
  static enrichHolding(holding) {
    const symbol = holding.symbol?.toUpperCase()?.trim();
    const sectorData = this.getSectorData(symbol);
    const companyName = this.getCompanyName(symbol);

    return {
      ...holding,
      name: holding.name || companyName,
      sector: sectorData?.sector || holding.sector || 'Diversified',
      industry: sectorData?.industry || holding.industry || 'General',
      dividendYield: holding.dividendYield || sectorData?.dividendYield || 0
    };
  }

  /**
   * Enrich all holdings in a portfolio
   */
  static enrichPortfolioHoldings(holdings) {
    if (!Array.isArray(holdings)) return [];
    return holdings.map(h => this.enrichHolding(h));
  }

  /**
   * Infer sector from symbol patterns (for unknown stocks)
   */
  static inferSectorFromSymbol(symbol) {
    // ETF patterns
    if (symbol.startsWith('VT') || symbol.startsWith('VO') || symbol.startsWith('VU') ||
        symbol.startsWith('IVV') || symbol.startsWith('IW') || symbol.startsWith('IJ')) {
      return { sector: 'ETF - Equity', industry: 'Diversified', dividendYield: 1.5 };
    }

    if (symbol.startsWith('XL')) {
      return { sector: 'ETF - Sector', industry: 'Sector Fund', dividendYield: 1.8 };
    }

    if (symbol.includes('BOND') || symbol.endsWith('BD') || symbol.startsWith('BND') ||
        symbol.startsWith('AGG') || symbol.startsWith('TL')) {
      return { sector: 'ETF - Bond', industry: 'Fixed Income', dividendYield: 4.0 };
    }

    if (symbol.includes('GOLD') || symbol === 'GLD' || symbol === 'IAU') {
      return { sector: 'ETF - Commodity', industry: 'Precious Metals', dividendYield: 0 };
    }

    // REIT patterns
    if (symbol.endsWith('REIT') || symbol.includes('REAL')) {
      return { sector: 'Real Estate', industry: 'REIT', dividendYield: 4.0 };
    }

    // Return generic diversified if unknown
    return { sector: 'Diversified', industry: 'General', dividendYield: 1.0 };
  }

  /**
   * Calculate sector allocation from enriched holdings
   */
  static calculateSectorAllocation(holdings, totalValue) {
    const sectors = {};

    const enrichedHoldings = this.enrichPortfolioHoldings(holdings);

    enrichedHoldings.forEach(h => {
      const sector = h.sector || 'Diversified';
      const marketValue = h.marketValue || 0;

      if (!sectors[sector]) {
        sectors[sector] = {
          value: 0,
          percentage: 0,
          holdings: [],
          count: 0
        };
      }

      sectors[sector].value += marketValue;
      sectors[sector].holdings.push(h.symbol);
      sectors[sector].count++;
    });

    // Calculate percentages
    const total = totalValue || Object.values(sectors).reduce((sum, s) => sum + s.value, 0);
    Object.keys(sectors).forEach(sector => {
      sectors[sector].percentage = total > 0
        ? (sectors[sector].value / total) * 100
        : 0;
    });

    return sectors;
  }

  /**
   * Get all available sectors
   */
  static getAllSectors() {
    const sectors = new Set();
    Object.values(STOCK_SECTORS).forEach(data => {
      sectors.add(data.sector);
    });
    return Array.from(sectors).sort();
  }

  /**
   * Check if a symbol is in our database
   */
  static isKnownSymbol(symbol) {
    return !!STOCK_SECTORS[symbol?.toUpperCase()?.trim()];
  }
}

module.exports = StockDataEnrichment;
