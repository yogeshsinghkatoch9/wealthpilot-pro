# Price Alerts - Quick Start Guide

Fast reference for using the price alerts system.

---

## Access

**Desktop**: Tools → Alerts & Monitoring → Price Alerts  
**Mobile**: Menu → Alerts  
**Direct**: `http://localhost:3000/alerts`

---

## Create Alert (3 steps)

1. **Click** "+ Create Alert" button
2. **Fill** form:
   - Symbol: `AAPL` (stock ticker)
   - Condition: `Above` / `Below` / `Equals`
   - Target Price: `$250.00`
   - Message: Optional note
3. **Submit** - Alert created!

---

## Alert Conditions

| Condition | Triggers When |
|-----------|---------------|
| **Above** | Price goes above target |
| **Below** | Price goes below target |
| **Equals** | Price within ±$0.01 of target |

---

## Features at a Glance

### Dashboard
- 📊 **4 Stat Cards** - Active, Triggered, Total, Symbols
- 📋 **Alerts Table** - Real-time prices and distance %
- 🔍 **Search** - Filter by symbol
- 🎯 **Filter** - Filter by condition
- 🗑️ **Delete** - Remove alerts with one click

### Notifications
- 🔔 **Toast Alerts** - Pop-up when price hits target
- 🔊 **Sound** - Beep on trigger
- ⚡ **Real-Time** - Updates every 30 seconds
- 🔄 **Auto-Sync** - WebSocket powered

### Interface
- 🌙 **Dark Theme** - Bloomberg Terminal style
- 📱 **Mobile Friendly** - Responsive design
- ⚡ **Fast** - No page reloads
- 🎨 **Professional** - Clean, intuitive UI

---

## How It Works

```
1. You create alert → Saved to database
2. Market data updates (every 30s) → Yahoo Finance
3. Backend checks conditions → Price Alerts Service
4. Condition met? → Alert triggered
5. WebSocket notification → Your browser
6. Toast appears + Sound plays → You're notified!
```

---

## Quick Actions

### View Active Alerts
Click **"Active Alerts"** tab (default view)

### View Triggered Alerts
Click **"Triggered Alerts"** tab

### Search Alerts
Type symbol in search box (e.g., "AAPL")

### Filter by Condition
Select from dropdown: Above / Below / Equals

### Delete Alert
Click trash icon → Confirm → Deleted

---

## Example Use Cases

### Profit Taking
```
Symbol: AAPL
Condition: Above
Target: $260.00
Message: Time to sell - take profits
```

### Buy Opportunity
```
Symbol: MSFT
Condition: Below
Target: $400.00
Message: Good entry point - buy signal
```

### Stop Loss
```
Symbol: GOOGL
Condition: Below
Target: $150.00
Message: STOP LOSS - sell immediately
```

### Breakout Alert
```
Symbol: TSLA
Condition: Above
Target: $250.00
Message: Breakout confirmed - momentum play
```

---

## Tips & Tricks

### ✅ Best Practices

- Set realistic targets (close to current price triggers faster)
- Use meaningful messages for context later
- Monitor triggered tab to track hit rate
- Delete old triggered alerts to keep UI clean
- Create multiple alerts for different price levels

### ⚠️ Common Mistakes

- Setting target too far from current price (may never trigger)
- Forgetting to check triggered tab
- Not using messages (loses context over time)
- Creating duplicate alerts for same symbol/price

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ESC` | Close modal or toast |
| `Tab` | Navigate form fields |
| `Enter` | Submit form (when focused) |

---

## Stats Explained

| Stat | Meaning |
|------|---------|
| **Active Alerts** | Alerts currently monitoring |
| **Triggered Today** | Alerts that hit target today |
| **Total Alerts** | All alerts (active + triggered) |
| **Symbols Watched** | Unique stocks being monitored |

---

## Alert Table Columns

| Column | Shows |
|--------|-------|
| **Symbol** | Stock ticker (e.g., AAPL) |
| **Condition** | Above ↑ / Below ↓ / Equals = |
| **Target Price** | Your target price |
| **Current Price** | Live price (updates every 30s) |
| **Distance** | How far from target (%) |
| **Message** | Your note |
| **Created** | Time ago (e.g., "5m ago") |
| **Action** | Delete button |

---

## Distance % Meaning

| Distance | Meaning | Color |
|----------|---------|-------|
| `+5.2%` | Current 5.2% above target | 🟢 Green |
| `-3.1%` | Current 3.1% below target | 🔴 Red |
| `0.0%` | At target price | 🟡 Amber |

---

## Notification Behavior

**When alert triggers:**
1. Toast notification appears (top-right)
2. Sound plays (short beep)
3. Alert moves to "Triggered" tab
4. Stats update automatically
5. Toast auto-dismisses after 10 seconds

**Close notification:**
- Click **X** button
- Press **ESC** key
- Wait 10 seconds (auto-dismiss)

---

## Mobile Experience

**Optimized for touch:**
- Large touch targets
- Swipeable table (horizontal scroll)
- Full-width modal
- Bottom-aligned buttons
- Responsive stats (stack vertically)

---

## Troubleshooting

### Alert not triggering?
- Check target price is realistic
- Verify symbol has market data
- Wait at least 30 seconds (update interval)

### WebSocket disconnected?
- Check internet connection
- Refresh page (Ctrl+R)
- System auto-reconnects in 5s

### Can't create alert?
- All fields required except message
- Symbol must be 1-5 letters
- Price must be > $0.00

---

## Testing Your Setup

**1. Quick Test Alert:**
```
Symbol: AAPL (or any stock you hold)
Condition: Above
Target: [Current price + $0.50]
```

**2. Wait 30-60 seconds**

**3. Check:**
- ✅ Current price updating?
- ✅ Distance % calculating?
- ✅ WebSocket connected? (check console)

---

## API Endpoints (for developers)

```bash
# Get all alerts
GET /api/alerts

# Create alert
POST /api/alerts
Body: { symbol, condition, targetPrice, message }

# Delete alert
DELETE /api/alerts/:id

# Test trigger (development only)
POST /api/alerts/test
```

---

## Browser Console Commands

```javascript
// Check manager loaded
window.alertsManager

// Check WebSocket status
window.alertsManager.ws.readyState  // 1 = connected

// Manual notification test
window.alertsManager.showToast('Test', 'This is a test');

// Check alerts count
window.alertsManager.alerts.length
```

---

## Support

**Stuck? Check:**
1. `/OPTION_C_ALERTS_TEST_GUIDE.md` - Full test suite
2. `/OPTION_C_COMPLETE_SUMMARY.md` - Complete documentation
3. Browser console for errors
4. Backend logs for server issues

**Common issues solved in test guide!**

---

## Updates

Prices update: **Every 30 seconds**  
WebSocket reconnect: **Every 5 seconds (if disconnected)**  
Stats refresh: **On every alert change**  
Table refresh: **Real-time (no reload needed)**

---

**Ready to set your first alert?**

Go to: `http://localhost:3000/alerts` and click "+ Create Alert"!
