# ✅ Authentication Verification Guide

## Quick Test Steps

### 1. Open Browser Console
Press **F12** → Go to **Console** tab

### 2. Run This Verification Script
Copy and paste this into the console:

```javascript
console.clear();
console.log('🔍 WealthPilot Authentication Check\n');

// Check 1: Cookie
const cookies = document.cookie;
const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
console.log('1️⃣ Token Cookie:', tokenCookie ? '✅ EXISTS' : '❌ MISSING');

// Check 2: localStorage
const tokenLS = localStorage.getItem('wealthpilot_token');
console.log('2️⃣ localStorage Token:', tokenLS ? '✅ EXISTS (' + tokenLS.substring(0, 20) + '...)' : '❌ MISSING');

// Check 3: Test API Call
if (tokenLS) {
  fetch('/api/portfolios', {
    headers: { 'Authorization': 'Bearer ' + tokenLS }
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      console.log('3️⃣ API Test:', '❌ FAILED -', data.error);
    } else {
      console.log('3️⃣ API Test:', '✅ SUCCESS - Found', data.length, 'portfolios');
    }
  })
  .catch(e => console.log('3️⃣ API Test:', '❌ ERROR -', e.message));
} else {
  console.log('3️⃣ API Test:', '⏭️ SKIPPED (no token)');
}

console.log('\n' + '='.repeat(50));
console.log('If all checks show ✅, you can upload portfolios!');
console.log('If any show ❌, try logging in again.');
```

---

## Expected Results

### ✅ Everything Working:
```
🔍 WealthPilot Authentication Check

1️⃣ Token Cookie: ✅ EXISTS
2️⃣ localStorage Token: ✅ EXISTS (eyJhbGciOiJIUzI1NiIsInR...)
3️⃣ API Test: ✅ SUCCESS - Found 0 portfolios

==================================================
If all checks show ✅, you can upload portfolios!
```

### ❌ Not Logged In:
```
1️⃣ Token Cookie: ❌ MISSING
2️⃣ localStorage Token: ❌ MISSING
3️⃣ API Test: ⏭️ SKIPPED (no token)
```

**Solution**: Go to `/login` and log in

---

## Troubleshooting

### Problem: Token cookie exists but localStorage is empty

**Solution**: Refresh the page (Ctrl+R). The header script will sync it automatically.

### Problem: Both cookie and localStorage empty after login

**Solution**:
1. Check backend is running: `cd backend && npm start`
2. Try logging in again
3. Check browser console for errors

### Problem: Token exists but API test fails with "Invalid token"

**Solution**:
1. Logout: Go to `/logout`
2. Login again
3. Run the verification script again

### Problem: Upload still shows "No token provided"

**Check**: Open Network tab (F12 → Network), try uploading, click on the request, check Headers section:
- Should show: `Authorization: Bearer eyJhbGci...`
- If missing: The authFetch function has an issue

---

## Backend Verification

Make sure your backend is running properly:

```bash
cd /Users/yogeshsinghkatoch/Desktop/FUll\ BLAST/wealthpilot-pro-v27-complete/backend
npm start
```

You should see:
```
Server running on port 3000
Database connected
```

---

## Frontend Verification

Make sure your frontend is running:

```bash
cd /Users/yogeshsinghkatoch/Desktop/FUll\ BLAST/wealthpilot-pro-v27-complete/frontend
npm start
```

---

## Final Upload Test

1. **Login**: http://localhost:3000/login (use demo@wealthpilot.com / demo123456)
2. **Run verification script** (should show all ✅)
3. **Go to Portfolios**: http://localhost:3000/portfolios
4. **Click "UPLOAD PORTFOLIO"**
5. **Select file**: sample_holdings.xlsx
6. **Portfolio name**: "Test Portfolio"
7. **Click "UPLOAD"**

Expected result: Upload should start, show progress bar, then succeed!

---

## If Everything Fails

As a last resort, delete the database and recreate it:

```bash
cd backend
rm data/wealthpilot.db
npm run migrate
```

Then register a new account and try again.
