# Portfolio Upload Debugging Guide

## All Fixes Applied

### 1. ✅ Database Constraint Fixed
- **Issue**: Database only accepted 'csv', 'xlsx', 'json' but file filter allowed '.xls'
- **Fix**: Migration 011 added 'xls' to CHECK constraint
- **File**: `/backend/migrations/011_fix_file_format_constraint.sql`
- **Status**: ✅ Applied and verified

### 2. ✅ Authentication Middleware Fixed
- **Issue**: Using non-existent `authenticateToken` middleware
- **Fix**: Changed to `authenticate` middleware
- **File**: `/backend/src/routes/portfolioUpload.js:7`
- **Status**: ✅ Applied

### 3. ✅ Frontend Authentication Fixed
- **Issue**: Upload form not including JWT tokens
- **Fix**: Using `authFetch()` helper for all requests
- **File**: `/frontend/views/pages/portfolios.ejs:515-533`
- **Status**: ✅ Applied

### 4. ✅ Added Comprehensive Logging
- **Backend**: Upload route now logs detailed request info
- **Frontend**: Console logs file info before upload
- **File**: `/backend/src/routes/portfolioUpload.js:52-75`

### 5. ✅ Added Client-Side Validation
- **File type validation**: Checks file extension before upload
- **File size validation**: Ensures under 10MB
- **Portfolio name sanitization**: Trims whitespace
- **File**: `/frontend/views/pages/portfolios.ejs:645-653`

---

## How to Debug "The string did not match the expected pattern" Error

### Step 1: Open Browser Console
1. Press F12 to open Developer Tools
2. Go to the **Console** tab
3. Try uploading your file again

### Step 2: Check Console Output
Look for the "Upload Debug" log that shows:
```javascript
{
  fileName: "sample_holdings.xlsx",
  fileSize: 12345,
  fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  portfolioName: "nnknk"
}
```

### Step 3: Check Backend Logs
If you're running the backend with `npm start`, check the terminal for logs showing:
```
Upload request received: { hasFile: true, body: { portfolioName: 'nnknk' }, userId: '...' }
```

### Step 4: Check Network Tab
1. Go to the **Network** tab in DevTools
2. Find the request to `/api/portfolio-upload/upload`
3. Click on it and check:
   - **Headers**: Verify Authorization header is present
   - **Payload**: Verify file and portfolioName are included
   - **Response**: See the exact error from the backend

---

## Possible Causes of the Error

### Cause 1: Browser File Input Validation
- **What**: Some browsers validate file inputs strictly
- **Solution**: Try using a different browser (Chrome, Firefox, Safari)

### Cause 2: File Name Contains Special Characters
- **What**: File path might have characters that break validation
- **Your file**: `/Users/yogeshsinghkatoch/Downloads/sample_holdings.xlsx`
- **Solution**: Rename file to simple name like `test.xlsx` and try again

### Cause 3: Form Validation Issue
- **What**: Hidden HTML5 validation might be running
- **Solution**: Check browser console for validation errors

### Cause 4: Duplicate Portfolio Name
- **What**: Database has UNIQUE constraint on (user_id, name)
- **Your name**: "nnknk"
- **Solution**: Try a different portfolio name

### Cause 5: File Corruption
- **What**: Excel file might be corrupted or in wrong format
- **Solution**: Try creating a new Excel file:

```
| symbol | quantity | costBasis |
|--------|----------|-----------|
| AAPL   | 100      | 150.00    |
| MSFT   | 50       | 300.00    |
```

---

## Testing Steps

### Test 1: Try with CSV Instead of Excel
Create a file `test.csv`:
```csv
symbol,quantity,costBasis
AAPL,100,150.00
MSFT,50,300.00
```

Upload this and see if it works.

### Test 2: Try Different Portfolio Name
Instead of "nnknk", try:
- "My Portfolio"
- "Test123"
- Leave it blank (will auto-generate name)

### Test 3: Check Existing Portfolios
Go to your portfolios page and check if you already have a portfolio named "nnknk". If yes, delete it or use a different name.

---

## If Error Persists

1. **Share Browser Console Logs**:
   - Copy the entire console output after trying to upload
   - Share it so I can see the exact error

2. **Share Network Response**:
   - Copy the response from the Network tab for the upload request

3. **Try the Test CSV**:
   - Use the simple CSV file above to isolate the issue

4. **Check File Format**:
   - Open your Excel file and save it as a new file
   - Make sure it's a proper .xlsx format, not .xlsm or other variant

---

## Quick Fix to Try Now

1. Close the upload modal
2. Create a new CSV file with the content above
3. Upload the CSV file instead of Excel
4. Use portfolio name "TestPortfolio"
5. Click UPLOAD

This will help isolate whether it's an Excel parsing issue or a more general problem.
