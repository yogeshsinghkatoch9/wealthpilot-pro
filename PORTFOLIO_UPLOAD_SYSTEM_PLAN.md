# Portfolio Upload & Analysis System - Implementation Plan

## 🎯 Feature Overview

**Goal:** Allow users to upload portfolios (CSV/Excel) and automatically generate comprehensive client reports with all 20 analytics, updating historical data to current market prices.

---

## 📋 User Requirements

1. ✅ **Upload Interface** - Dashboard page for file upload
2. ✅ **Multiple Formats** - Support CSV, Excel (.xlsx), JSON
3. ✅ **Auto-Analysis** - Run all 20 analytics automatically
4. ✅ **Historical Update** - Update old portfolios to current prices
5. ✅ **Client Report** - Professional PDF with all visualizations
6. ✅ **Real-time Processing** - Show progress during upload/analysis
7. ✅ **Error Handling** - Validate data, show clear errors

---

## 🏗️ System Architecture

### Upload Flow

```
User uploads file → Parse & Validate → Create Portfolio
    ↓
Fetch Current Prices → Update Holdings → Calculate Analytics
    ↓
Generate Report → Render Charts → Export PDF
    ↓
Show Results → Download PDF → Save to Database
```

---

## 📊 Supported File Formats

### 1. CSV Format (Simple)

```csv
Symbol,Shares,Cost Basis,Purchase Date
AAPL,100,15000.00,2023-01-15
MSFT,50,18000.00,2023-02-20
GOOGL,25,3500.00,2023-03-10
```

**Required Columns:**
- `Symbol` (required) - Stock ticker
- `Shares` (required) - Number of shares
- `Cost Basis` (optional) - Total cost basis
- `Purchase Date` (optional) - Date of purchase

**Optional Columns:**
- `Price` - Purchase price per share
- `Sector` - Stock sector
- `Notes` - Additional notes

### 2. Excel Format (.xlsx)

Same structure as CSV but supports:
- Multiple sheets (different portfolios)
- Formatting (colors, bold)
- Formulas (calculated fields)
- Data validation

### 3. JSON Format (Advanced)

```json
{
  "portfolioName": "Growth Portfolio",
  "description": "Long-term growth strategy",
  "uploadDate": "2024-12-14",
  "holdings": [
    {
      "symbol": "AAPL",
      "shares": 100,
      "costBasis": 15000.00,
      "purchaseDate": "2023-01-15",
      "notes": "Initial position"
    }
  ],
  "transactions": [
    {
      "symbol": "AAPL",
      "type": "buy",
      "shares": 50,
      "price": 150.00,
      "date": "2024-06-15"
    }
  ]
}
```

### 4. Brokerage Statement Parsers (Future)

- Schwab CSV export
- Fidelity export
- Interactive Brokers
- Robinhood

---

## 🔧 Backend Implementation

### New Database Tables

**1. `uploaded_portfolios` Table**

```sql
CREATE TABLE uploaded_portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT,
  original_filename TEXT NOT NULL,
  file_format TEXT NOT NULL, -- csv, xlsx, json
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'processing', -- processing, completed, failed
  total_holdings INTEGER,
  total_value REAL,
  error_message TEXT,
  metadata TEXT, -- JSON blob with extra info
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);
```

**2. `portfolio_snapshots_history` Table** (for time-series analysis)

```sql
CREATE TABLE portfolio_snapshots_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  total_value REAL,
  total_cost REAL,
  total_gain REAL,
  holdings_snapshot TEXT, -- JSON blob
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);
```

### New Backend Services

**1. `/backend/src/services/portfolioUploadService.js`**

```javascript
class PortfolioUploadService {
  // Parse uploaded file
  async parseFile(file, format) {
    switch(format) {
      case 'csv': return this.parseCSV(file);
      case 'xlsx': return this.parseExcel(file);
      case 'json': return this.parseJSON(file);
    }
  }

  // Validate portfolio data
  validatePortfolioData(data) {
    // Check required fields
    // Validate symbols
    // Check data types
    // Return { valid, errors }
  }

  // Create portfolio from parsed data
  async createPortfolioFromUpload(userId, data, filename) {
    // Create portfolio record
    // Create holdings
    // Record upload metadata
  }

  // Update historical portfolios to current prices
  async updateHistoricalPrices(portfolioId) {
    // Get all holdings
    // Fetch current prices
    // Update market values
    // Recalculate totals
    // Create snapshot
  }

  // Run all analytics
  async runAllAnalytics(portfolioId) {
    // Run all 20 analytics endpoints
    // Collect results
    // Cache results for report
  }
}
```

**2. `/backend/src/services/reportGenerationService.js`**

```javascript
class ReportGenerationService {
  // Generate comprehensive client report
  async generateClientReport(portfolioId, options = {}) {
    // Fetch portfolio data
    // Run analytics if not cached
    // Generate HTML report
    // Render all 20 charts
    // Return report data
  }

  // Export report as PDF
  async exportReportAsPDF(portfolioId, reportData) {
    // Use Puppeteer to render HTML
    // Generate PDF with charts
    // Save to file system
    // Return PDF path
  }

  // Email report to client
  async emailReport(portfolioId, email, reportData) {
    // Generate PDF
    // Create email with attachment
    // Send via email service
  }
}
```

**3. `/backend/src/parsers/csvParser.js`**

```javascript
const csv = require('csv-parser');

async function parseCSV(fileBuffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(fileBuffer);

    stream
      .pipe(csv())
      .on('data', (row) => {
        results.push({
          symbol: row.Symbol?.toUpperCase(),
          shares: parseFloat(row.Shares),
          costBasis: parseFloat(row['Cost Basis'] || row.CostBasis),
          purchaseDate: row['Purchase Date'] || row.PurchaseDate
        });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}
```

**4. `/backend/src/parsers/excelParser.js`**

```javascript
const XLSX = require('xlsx');

function parseExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  return data.map(row => ({
    symbol: row.Symbol?.toUpperCase(),
    shares: parseFloat(row.Shares),
    costBasis: parseFloat(row['Cost Basis'] || row.CostBasis),
    purchaseDate: row['Purchase Date'] || row.PurchaseDate
  }));
}
```

### New API Endpoints

**1. Upload Portfolio**

```
POST /api/portfolios/upload
Content-Type: multipart/form-data

Body:
- file: File (CSV/Excel/JSON)
- portfolioName: string (optional)
- description: string (optional)
- updatePrices: boolean (default: true)

Response:
{
  "success": true,
  "uploadId": "uuid",
  "portfolioId": "uuid",
  "status": "processing",
  "message": "Portfolio uploaded successfully"
}
```

**2. Get Upload Status**

```
GET /api/portfolios/upload/:uploadId/status

Response:
{
  "uploadId": "uuid",
  "status": "completed",
  "progress": 100,
  "totalHoldings": 25,
  "totalValue": 150000.00,
  "portfolioId": "uuid"
}
```

**3. Generate Client Report**

```
POST /api/portfolios/:portfolioId/report

Body:
{
  "includeCharts": true,
  "includeAnalytics": ["performance", "risk", "attribution"],
  "format": "pdf"
}

Response:
{
  "success": true,
  "reportId": "uuid",
  "downloadUrl": "/api/reports/download/uuid",
  "reportData": { /* comprehensive report */ }
}
```

**4. Download Report**

```
GET /api/reports/download/:reportId

Response: PDF file download
```

---

## 🎨 Frontend Implementation

### 1. Upload Page (`/portfolio-upload`)

**File:** `/frontend/views/pages/portfolio-upload.ejs`

```html
<div class="upload-container">
  <h1>Upload Portfolio</h1>

  <!-- Drag & Drop Zone -->
  <div class="drop-zone" id="dropZone">
    <svg><!-- Upload icon --></svg>
    <p>Drag and drop your portfolio file here</p>
    <p class="text-sm">Supports CSV, Excel (.xlsx), JSON</p>
    <button id="selectFileBtn">Select File</button>
    <input type="file" id="fileInput" hidden accept=".csv,.xlsx,.json">
  </div>

  <!-- File Info -->
  <div id="fileInfo" class="hidden">
    <p>Selected: <span id="fileName"></span></p>
    <p>Size: <span id="fileSize"></span></p>
  </div>

  <!-- Upload Options -->
  <div class="upload-options">
    <input type="text" id="portfolioName" placeholder="Portfolio Name (optional)">
    <textarea id="description" placeholder="Description (optional)"></textarea>
    <label>
      <input type="checkbox" id="updatePrices" checked>
      Update to current market prices
    </label>
  </div>

  <!-- Upload Button -->
  <button id="uploadBtn" disabled>Upload & Analyze</button>

  <!-- Progress Bar -->
  <div id="progressContainer" class="hidden">
    <div class="progress-bar">
      <div id="progressFill" class="progress-fill"></div>
    </div>
    <p id="progressText">Processing...</p>
  </div>

  <!-- Results -->
  <div id="results" class="hidden">
    <h2>Upload Complete!</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="label">Total Holdings</span>
        <span id="totalHoldings" class="value">0</span>
      </div>
      <div class="stat-card">
        <span class="label">Total Value</span>
        <span id="totalValue" class="value">$0</span>
      </div>
    </div>
    <div class="actions">
      <a id="viewPortfolioBtn" class="btn-primary">View Portfolio</a>
      <button id="generateReportBtn" class="btn-secondary">Generate Client Report</button>
    </div>
  </div>
</div>
```

### 2. Upload JavaScript (`/public/js/portfolio-upload.js`)

```javascript
class PortfolioUploadManager {
  constructor() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.uploadBtn = document.getElementById('uploadBtn');
    this.selectedFile = null;
    this.init();
  }

  init() {
    this.setupDragDrop();
    this.setupFileInput();
    this.setupUploadButton();
  }

  setupDragDrop() {
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      this.handleFileSelect(file);
    });
  }

  handleFileSelect(file) {
    // Validate file type
    const validTypes = ['.csv', '.xlsx', '.json'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(fileExt)) {
      this.showError('Invalid file type. Please upload CSV, Excel, or JSON.');
      return;
    }

    this.selectedFile = file;
    this.showFileInfo(file);
    this.uploadBtn.disabled = false;
  }

  async uploadPortfolio() {
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('portfolioName', document.getElementById('portfolioName').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('updatePrices', document.getElementById('updatePrices').checked);

    this.showProgress();

    try {
      const response = await fetch('/api/portfolios/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        this.pollUploadStatus(data.uploadId, data.portfolioId);
      } else {
        this.showError(data.error);
      }
    } catch (error) {
      this.showError('Upload failed: ' + error.message);
    }
  }

  async pollUploadStatus(uploadId, portfolioId) {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/portfolios/upload/${uploadId}/status`);
      const data = await response.json();

      this.updateProgress(data.progress, data.status);

      if (data.status === 'completed') {
        clearInterval(interval);
        this.showResults(data, portfolioId);
      } else if (data.status === 'failed') {
        clearInterval(interval);
        this.showError(data.error);
      }
    }, 1000);
  }

  showResults(data, portfolioId) {
    document.getElementById('totalHoldings').textContent = data.totalHoldings;
    document.getElementById('totalValue').textContent = '$' + data.totalValue.toLocaleString();
    document.getElementById('viewPortfolioBtn').href = `/portfolios/${portfolioId}`;
    document.getElementById('results').classList.remove('hidden');

    // Setup report generation
    document.getElementById('generateReportBtn').onclick = () => {
      this.generateReport(portfolioId);
    };
  }

  async generateReport(portfolioId) {
    const response = await fetch(`/api/portfolios/${portfolioId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeCharts: true,
        includeAnalytics: ['performance', 'risk', 'attribution', 'construction', 'specialized'],
        format: 'pdf'
      })
    });

    const data = await response.json();

    if (data.success) {
      window.open(data.downloadUrl, '_blank');
    }
  }
}
```

### 3. Client Report Page (`/portfolio-report`)

**File:** `/frontend/views/pages/portfolio-report.ejs`

Professional report with:
- Cover page with portfolio summary
- Executive summary with key metrics
- All 20 analytics charts
- Sector breakdown
- Top holdings table
- Performance vs benchmark
- Risk metrics
- Recommendations section
- Disclaimer footer

---

## 📄 PDF Report Generation

### Using Puppeteer

```javascript
const puppeteer = require('puppeteer');

async function generatePDF(portfolioId, reportData) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Render report HTML
  const html = await renderReportHTML(reportData);
  await page.setContent(html);

  // Generate PDF
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '15mm',
      right: '15mm'
    }
  });

  await browser.close();

  // Save PDF
  const filename = `portfolio-report-${portfolioId}-${Date.now()}.pdf`;
  const filepath = path.join(__dirname, '../../reports', filename);
  fs.writeFileSync(filepath, pdf);

  return {
    filename,
    filepath,
    downloadUrl: `/api/reports/download/${filename}`
  };
}
```

---

## 🔄 Historical Data Update Logic

### Update Flow

```javascript
async function updateHistoricalPortfolio(portfolioId) {
  // 1. Get all holdings
  const holdings = await getHoldings(portfolioId);

  // 2. Fetch current prices for all symbols
  const symbols = holdings.map(h => h.symbol);
  const quotes = await marketDataService.fetchQuotes(symbols);

  // 3. Update each holding
  for (const holding of holdings) {
    const quote = quotes.find(q => q.symbol === holding.symbol);

    if (quote) {
      // Keep original cost basis and purchase date
      // Update current price and market value
      await updateHolding(holding.id, {
        currentPrice: quote.price,
        marketValue: holding.shares * quote.price,
        gain: (holding.shares * quote.price) - holding.costBasis,
        gainPct: ((holding.shares * quote.price) - holding.costBasis) / holding.costBasis * 100,
        lastUpdated: new Date()
      });
    }
  }

  // 4. Create snapshot with current prices
  await createPortfolioSnapshot(portfolioId);

  // 5. Return updated portfolio
  return getPortfolio(portfolioId);
}
```

---

## 📊 Sample Client Report Structure

```
┌─────────────────────────────────────────────┐
│         PORTFOLIO PERFORMANCE REPORT         │
│                                             │
│  Client: John Doe                          │
│  Portfolio: Growth Portfolio               │
│  Report Date: December 14, 2024            │
└─────────────────────────────────────────────┘

EXECUTIVE SUMMARY
─────────────────
Total Value:        $150,000
Total Return:       +25.5%
Sharpe Ratio:       0.84
Risk Rating:        Moderate

PERFORMANCE ANALYSIS
────────────────────
[Chart: Performance Attribution Waterfall]
[Chart: Return vs Benchmark Line Chart]
[Chart: Drawdown Analysis]

RISK ANALYSIS
─────────────
[Chart: Risk Decomposition Bar Chart]
[Chart: VaR Histogram]
[Chart: Correlation Matrix Heatmap]

HOLDINGS BREAKDOWN
──────────────────
Top 10 Holdings:
1. AAPL - 25.0% - $37,500
2. MSFT - 15.0% - $22,500
...

Sector Allocation:
- Technology: 45%
- Healthcare: 20%
...

RECOMMENDATIONS
───────────────
1. Consider rebalancing to reduce concentration
2. Increase diversification in sectors
...

Generated by WealthPilot Pro
```

---

## 🧪 Testing Strategy

### Unit Tests
- CSV parser with various formats
- Excel parser with multiple sheets
- Data validation logic
- Price update calculations

### Integration Tests
- Full upload flow
- Report generation
- PDF creation

### Test Cases
1. Valid CSV upload
2. Excel with missing columns
3. Historical portfolio (2020 data)
4. Large portfolio (1000+ holdings)
5. Invalid symbols
6. Duplicate symbols
7. Concurrent uploads

---

## 📦 Required NPM Packages

```bash
# File parsing
npm install csv-parser xlsx multer

# PDF generation
npm install puppeteer

# Date handling
npm install date-fns

# File validation
npm install file-type
```

---

## 🚀 Implementation Order

1. **Database migrations** (tables for uploads & snapshots)
2. **File parsers** (CSV, Excel, JSON)
3. **Upload service** (validation, creation)
4. **Price update service** (historical data reconciliation)
5. **Upload API endpoints**
6. **Frontend upload page** (drag & drop UI)
7. **Report generation service**
8. **PDF export** (Puppeteer integration)
9. **Client report template**
10. **Testing & polish**

---

## ⏱️ Estimated Timeline

- Database & parsers: 2 hours
- Upload service & API: 3 hours
- Frontend upload UI: 2 hours
- Report generation: 4 hours
- PDF export: 2 hours
- Testing & refinement: 2 hours

**Total: ~15 hours** (can be done in phases)

---

## 🎯 Success Criteria

- ✅ Upload CSV/Excel/JSON portfolios
- ✅ Auto-validate data with clear errors
- ✅ Update historical data to current prices
- ✅ Run all 20 analytics automatically
- ✅ Generate professional client report
- ✅ Export as downloadable PDF
- ✅ Show real-time progress
- ✅ Handle errors gracefully

---

**Ready to implement!** This will be a killer feature for your platform.
