# Option C: Price Alerts Frontend - Test Guide

Complete guide for testing the price alerts system in WealthPilot Pro.

---

## What Was Implemented

### Frontend UI Components
1. **Alerts Dashboard** (`/frontend/views/pages/alerts.ejs`)
   - Alert statistics cards (Active, Triggered, Total, Symbols watched)
   - Active alerts table with search and filtering
   - Triggered alerts view
   - Create alert modal
   - Real-time toast notifications

2. **Client-Side JavaScript** (`/frontend/public/js/alerts.js`)
   - AlertsManager class
   - Create, read, delete operations
   - Real-time WebSocket integration
   - Toast notifications with sound
   - Tab switching and filtering
   - Current price fetching

3. **Backend Integration**
   - Already exists from previous session
   - `/api/alerts` - GET, POST, DELETE endpoints
   - Price monitoring via market data service
   - WebSocket broadcasting for triggered alerts

---

## Pre-Test Checklist

Before testing, verify:

- [ ] Backend server is running (`http://localhost:4000`)
- [ ] Frontend server is running (`http://localhost:3000`)
- [ ] WebSocket connection is available (`ws://localhost:4000/ws`)
- [ ] Market data updates are active (every 30 seconds)
- [ ] You're logged in to the application

---

## Test Procedure

### Test 1: Access Alerts Page

**Steps:**
1. Navigate to `http://localhost:3000`
2. Click **"Tools"** in top navigation
3. Under "Alerts & Monitoring", click **"Price Alerts"**

**Expected Results:**
- ✅ Alerts page loads successfully
- ✅ Four stat cards visible (all showing 0 initially)
- ✅ "Active Alerts" tab is selected by default
- ✅ Empty state message: "No active alerts"
- ✅ "+ Create Alert" button visible in top right

---

### Test 2: Create a Price Alert

**Steps:**
1. Click **"+ Create Alert"** button
2. Modal opens with form
3. Fill in the form:
   - **Symbol**: `AAPL` (or any stock you hold)
   - **Condition**: "Price goes above"
   - **Target Price**: `250.00`
   - **Message**: "Consider selling" (optional)
4. Click **"Create Alert"**

**Expected Results:**
- ✅ Form validates (all required fields must be filled)
- ✅ Current price appears below form (fetched from API)
- ✅ Success toast notification appears
- ✅ Modal closes automatically
- ✅ Alert appears in Active Alerts table
- ✅ Stats update (Active Alerts: 1, Total: 1, Symbols: 1)

---

### Test 3: Create Multiple Alerts

**Steps:**
1. Create 3 more alerts with different conditions:
   
   **Alert 2:**
   - Symbol: `AAPL`
   - Condition: "Price goes below"
   - Target: `200.00`
   - Message: "Buy opportunity"
   
   **Alert 3:**
   - Symbol: `MSFT`
   - Condition: "Price goes above"
   - Target: `500.00`
   
   **Alert 4:**
   - Symbol: `GOOGL`
   - Condition: "Price equals"
   - Target: `175.00`

**Expected Results:**
- ✅ All 4 alerts appear in the table
- ✅ Stats show: Active: 4, Total: 4, Symbols: 3
- ✅ Each row shows:
  - Symbol (amber, monospace font)
  - Condition (colored: green for above, red for below, amber for equals)
  - Target price (monospace)
  - Current price (updates from market data)
  - Distance % (green if positive, red if negative)
  - Message
  - Created time (relative: "2m ago", "1h ago", etc.)
  - Delete button (red trash icon)

---

### Test 4: Search and Filter

**Steps:**
1. Type `AAPL` in the search box
2. Clear search
3. Select "Above" from the condition filter
4. Clear filter

**Expected Results:**
- ✅ Search filters to show only AAPL alerts (2 alerts)
- ✅ Clear search shows all alerts again (4 alerts)
- ✅ Condition filter shows only "above" alerts (2 alerts)
- ✅ Clear filter shows all alerts again (4 alerts)
- ✅ Filters work instantly without page reload

---

### Test 5: Delete an Alert

**Steps:**
1. Click the delete (trash) icon for Alert 4 (GOOGL)
2. Confirm deletion in browser prompt

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ After confirming, alert is removed from table
- ✅ Stats update: Active: 3, Total: 3, Symbols: 3
- ✅ Success toast appears: "Alert deleted successfully"

---

### Test 6: Real-Time Price Updates

**Steps:**
1. Open browser DevTools > Console
2. Watch for WebSocket messages
3. Wait 30 seconds for market data update

**Expected Results:**
- ✅ Console shows: "WebSocket connected for alerts"
- ✅ Price updates received every 30 seconds
- ✅ "Current Price" column updates automatically
- ✅ "Distance %" recalculates automatically
- ✅ No page reload required

---

### Test 7: Trigger an Alert

**Note**: This test requires the alert's target price to be reached by actual market data.

**Option A: Manual Test (Live Market)**
1. Create an alert very close to current price
   - Example: If AAPL is at $245.50, set "above $245.60"
2. Wait for next price update (30 seconds)

**Option B: Backend Simulation**
You can manually trigger an alert using the backend test endpoint:

```bash
# In a new terminal
curl -X POST http://localhost:4000/api/alerts/test \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{
    "symbol": "AAPL",
    "targetPrice": 250.00,
    "condition": "above"
  }'
```

**Expected Results:**
- ✅ Toast notification appears in top-right corner
  - Title: "AAPL Alert Triggered!"
  - Message: "AAPL is above $250.00 - Current: $XXX.XX"
- ✅ Notification sound plays (beep)
- ✅ Toast auto-dismisses after 10 seconds
- ✅ Alert moves to "Triggered Alerts" tab
- ✅ Stats update:
  - Active Alerts: decreases by 1
  - Triggered Today: increases by 1
  - Total: stays same

---

### Test 8: View Triggered Alerts

**Steps:**
1. Click **"Triggered Alerts"** tab
2. Verify triggered alert appears

**Expected Results:**
- ✅ Tab switches to triggered view
- ✅ Triggered alert shown as a card with:
  - Symbol and "TRIGGERED" badge (green)
  - Alert details (condition and target price)
  - Actual triggered price (large, green, monospace)
  - Message (if provided)
  - Time of trigger (relative)
- ✅ Different layout than active alerts (cards vs table)

---

### Test 9: Tab Navigation

**Steps:**
1. Switch between "Active Alerts" and "Triggered Alerts" tabs multiple times

**Expected Results:**
- ✅ Tab button gets highlighted (amber border bottom)
- ✅ Content switches instantly
- ✅ No page reload
- ✅ Proper animation/transition

---

### Test 10: Toast Notification Actions

**Steps:**
1. Trigger an alert (or create a new one)
2. When toast appears, click the "X" button
3. Trigger another alert
4. Let toast auto-dismiss (wait 10 seconds)

**Expected Results:**
- ✅ Clicking X closes toast immediately
- ✅ Auto-dismiss works after 10 seconds
- ✅ Multiple toasts stack properly (if rapid triggers)
- ✅ Toast animations smooth (slide down on appear)

---

### Test 11: Modal Interactions

**Steps:**
1. Click "+ Create Alert"
2. Click outside the modal (on the dark overlay)
3. Click "+ Create Alert" again
4. Press ESC key
5. Click "+ Create Alert" again
6. Click "Cancel" button

**Expected Results:**
- ✅ Clicking outside does NOT close modal
- ✅ ESC key closes modal
- ✅ Cancel button closes modal
- ✅ X button in top-right closes modal
- ✅ Form resets when modal reopens

---

### Test 12: Form Validation

**Steps:**
1. Click "+ Create Alert"
2. Try to submit with empty fields
3. Fill symbol only, try submit
4. Fill symbol + condition, try submit
5. Fill all except price with 0, try submit
6. Fill with negative price, try submit
7. Fill with invalid symbol (e.g., "INVALID123456"), try submit

**Expected Results:**
- ✅ Empty fields show browser validation message
- ✅ Missing required fields prevent submission
- ✅ Price must be > 0
- ✅ Symbol auto-converts to uppercase
- ✅ Symbol limited to 1-5 letters (pattern validation)
- ✅ Form cannot submit with invalid data

---

### Test 13: Current Price Display in Modal

**Steps:**
1. Click "+ Create Alert"
2. Type `AAPL` in symbol field
3. Wait 500ms (debounced)
4. Check for "Current Price" section

**Expected Results:**
- ✅ After 500ms delay, current price fetches
- ✅ "Current Price: $XXX.XX" appears in gray box
- ✅ Price is formatted with $ and 2 decimals
- ✅ If symbol not found, price stays hidden

---

### Test 14: Responsive Design

**Steps:**
1. Open alerts page on desktop (1920x1080)
2. Resize to tablet (768px)
3. Resize to mobile (375px)

**Expected Results:**
- ✅ Desktop: Table fits comfortably, 4-column stat cards
- ✅ Tablet: Stats go to 2 columns, table scrolls horizontally
- ✅ Mobile: Stats go to 1 column, table scrolls, modal takes full width
- ✅ All buttons remain accessible
- ✅ No horizontal page scroll (except table scroll)

---

### Test 15: WebSocket Reconnection

**Steps:**
1. Stop backend server
2. Wait 5 seconds
3. Check browser console
4. Restart backend server
5. Wait 5 seconds

**Expected Results:**
- ✅ Console shows "WebSocket disconnected"
- ✅ Console shows "Reconnecting in 5s..."
- ✅ After backend restart, console shows "WebSocket connected"
- ✅ Alerts data reloads
- ✅ Real-time updates resume

---

### Test 16: Error Handling

**Steps:**
1. Stop backend server
2. Try to create an alert
3. Restart backend

**Expected Results:**
- ✅ Error toast appears: "Failed to create alert"
- ✅ Toast is RED (not amber)
- ✅ Modal stays open (user can retry)
- ✅ After backend restart, retry works

---

### Test 17: Multiple Browser Tabs

**Steps:**
1. Open alerts page in Tab 1
2. Create an alert
3. Open alerts page in Tab 2
4. Verify alert appears in Tab 2
5. In Tab 1, trigger an alert
6. Check Tab 2 for real-time update

**Expected Results:**
- ✅ Tab 2 shows alert created in Tab 1
- ✅ Tab 2 receives WebSocket notification when alert triggers in Tab 1
- ✅ Both tabs stay in sync
- ✅ Stats update in both tabs

---

### Test 18: Logout and Re-login

**Steps:**
1. Create 2-3 alerts
2. Logout
3. Login again
4. Navigate to alerts page

**Expected Results:**
- ✅ All alerts persisted (not lost)
- ✅ Stats accurate
- ✅ WebSocket reconnects
- ✅ User sees only their own alerts (not other users')

---

### Test 19: Performance Test

**Steps:**
1. Create 20 alerts (use loop or script if needed)
2. Measure page responsiveness

**Expected Results:**
- ✅ Table renders all 20 alerts without lag
- ✅ Search/filter still responsive
- ✅ Scroll smooth
- ✅ Tab switching instant
- ✅ Stats calculate correctly

---

### Test 20: Edge Cases

**Steps:**
1. Create alert for symbol with no current price data
2. Create alert for cryptocurrency (e.g., BTC-USD)
3. Create alert with very large price (e.g., $999999.99)
4. Create alert with very small price (e.g., $0.01)

**Expected Results:**
- ✅ Missing price shows "--" instead of error
- ✅ Crypto symbols handled (if supported by backend)
- ✅ Large/small prices display correctly with proper formatting
- ✅ Distance % calculates correctly for all price ranges

---

## Success Criteria

All tests should pass with the following outcomes:

✅ **UI/UX**
- Clean, Bloomberg-style dark theme
- Responsive on all screen sizes
- Smooth animations and transitions
- Intuitive navigation and actions

✅ **Functionality**
- Create alerts successfully
- View alerts in table and card formats
- Search and filter work correctly
- Delete alerts with confirmation
- Real-time price updates via WebSocket
- Alert triggering and notifications

✅ **Real-Time Features**
- WebSocket connection stable
- Price updates every 30 seconds
- Alert notifications with toast + sound
- Triggered alerts move to separate tab
- Stats update in real-time

✅ **Error Handling**
- Form validation prevents bad data
- API errors show user-friendly messages
- WebSocket reconnects automatically
- No crashes or white screens

✅ **Performance**
- Page loads in < 2 seconds
- Table renders 20+ alerts without lag
- Search/filter instant
- No memory leaks (check DevTools)

---

## Troubleshooting

### Problem: Alerts page shows 404

**Solution:**
- Verify frontend server is running on port 3000
- Check `/frontend/views/pages/alerts.ejs` exists
- Verify route in `/frontend/src/server.ts` line 732

### Problem: "Failed to load alerts" error

**Solution:**
- Check backend server is running on port 4000
- Verify `/api/alerts` endpoint works: `curl http://localhost:4000/api/alerts`
- Check authentication token in browser cookies

### Problem: WebSocket not connecting

**Solution:**
- Check backend has WebSocket server running
- Verify port 4000 is not blocked by firewall
- Check browser console for connection errors
- Try hard refresh (Ctrl+Shift+R)

### Problem: Prices not updating

**Solution:**
- Verify market data service is running: check backend logs
- Ensure you have alerts for symbols with active market data
- Check WebSocket messages in browser console
- Verify polling interval (should be 30 seconds)

### Problem: Alerts not triggering

**Solution:**
- Check target price is realistic (not too far from current price)
- Verify market data is updating (check backend logs)
- Test with backend test endpoint (see Test 7)
- Check WebSocket connection is active

### Problem: Toast notifications not appearing

**Solution:**
- Check browser console for JavaScript errors
- Verify `#alert-toast` element exists in DOM
- Check CSS z-index (should be 50)
- Try different browser

### Problem: Modal not opening

**Solution:**
- Check browser console for errors
- Verify `#create-alert-modal` element exists
- Check JavaScript loaded: `typeof window.alertsManager`
- Try hard refresh

---

## Quick Verification Script

Run this in browser console to verify setup:

```javascript
// Check if AlertsManager is loaded
console.log('AlertsManager:', typeof window.alertsManager);

// Check WebSocket connection
console.log('WebSocket:', window.alertsManager?.ws?.readyState);

// Check current alerts
console.log('Alerts count:', window.alertsManager?.alerts?.length);

// Manual trigger test
window.alertsManager?.showToast('Test Alert', 'This is a test notification');
```

Expected output:
```
AlertsManager: "object"
WebSocket: 1  (1 = OPEN)
Alerts count: 0 (or your current count)
[Toast notification appears]
```

---

## Next Steps

After all tests pass:

1. **Integration with Dashboard**
   - Add alert count badge to navigation
   - Show recent alerts on dashboard
   - Link dashboard holdings to create alerts

2. **Enhanced Features**
   - Bulk alert creation
   - Alert templates
   - Email/SMS notifications
   - Alert history analytics
   - Price charts in modal

3. **Documentation**
   - User guide for alerts
   - Video tutorial
   - FAQ section

---

## Files Created/Modified

**Created:**
- `/frontend/views/pages/alerts.ejs` - Alerts dashboard UI
- `/frontend/public/js/alerts.js` - Client-side JavaScript
- `/OPTION_C_ALERTS_TEST_GUIDE.md` - This file

**Existing (from previous session):**
- `/backend/src/services/priceAlertsService.js` - Alert backend service
- `/backend/src/routes/alerts.js` - Alert API endpoints
- `/backend/src/services/marketDataService.js` - Price monitoring
- `/frontend/src/server.ts` (line 732) - Alerts route
- `/frontend/public/js/megamenu.js` (line 344) - Navigation link

---

## Status

✅ **COMPLETE** - All Option C tasks finished:
- [x] Create price alerts page UI
- [x] Add alert creation form
- [x] Build alert list/management interface
- [x] Implement real-time alert notifications
- [x] Add alerts link to navigation
- [x] Create comprehensive test guide

Ready for end-to-end testing!
