# Dashboard Customization Features - Implementation Plan

## 🎯 Goal
Add powerful customization capabilities to the Advanced Analytics Dashboard, allowing users to personalize their analytics experience.

---

## ✨ Features to Implement

### 1. Chart Visibility Toggle
**What:** Users can show/hide specific charts within each tab
**Why:** Not all users need all 20 charts - let them focus on what matters
**Implementation:**
- Checkbox next to each chart title
- Save visibility preferences to database
- Persist across sessions

### 2. Chart Reordering (Drag & Drop)
**What:** Users can drag charts to reorder them within tabs
**Why:** Put most-used charts at the top
**Implementation:**
- HTML5 Drag & Drop API
- Save order preferences to database
- Smooth animations during reorder

### 3. Favorite Charts
**What:** Users can "pin" favorite charts for quick access
**Why:** Quick access to most important analytics
**Implementation:**
- Star icon on each chart
- "Favorites" tab showing all pinned charts
- Cross-tab favorites collection

### 4. Multiple Dashboard Views
**What:** Users can create named dashboard layouts (e.g., "Daily Review", "Client Meeting", "Deep Dive")
**Why:** Different workflows need different chart configurations
**Implementation:**
- View selector dropdown
- Save/load/delete views
- Default view setting

### 5. Chart Size Control
**What:** Users can resize charts (compact, normal, expanded)
**Why:** Some charts need more space, others can be smaller
**Implementation:**
- Size selector per chart
- Responsive grid layout
- Maintain aspect ratios

### 6. Export/Import Configurations
**What:** Users can export their dashboard config and import on other devices
**Why:** Portability, backup, sharing with team
**Implementation:**
- Export as JSON file
- Import from JSON
- Reset to defaults

### 7. Color Theme Customization
**What:** Users can customize chart colors (while keeping Bloomberg aesthetic)
**Why:** Personal preference, accessibility
**Implementation:**
- Predefined color schemes
- Custom color picker
- Preview before applying

---

## 🗄️ Database Schema

### New Table: `dashboard_preferences`

```sql
CREATE TABLE dashboard_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  view_name TEXT NOT NULL DEFAULT 'default',
  is_active BOOLEAN DEFAULT 0,
  preferences TEXT NOT NULL, -- JSON blob
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, view_name)
);

CREATE INDEX idx_dashboard_prefs_user ON dashboard_preferences(user_id);
CREATE INDEX idx_dashboard_prefs_active ON dashboard_preferences(user_id, is_active);
```

### Preferences JSON Structure

```json
{
  "viewName": "default",
  "tabs": {
    "performance": {
      "charts": [
        {
          "id": "chart-attribution",
          "visible": true,
          "order": 0,
          "size": "normal",
          "favorited": false
        },
        {
          "id": "chart-excess-return",
          "visible": true,
          "order": 1,
          "size": "normal",
          "favorited": true
        }
      ]
    },
    "risk": { /* ... */ },
    "attribution": { /* ... */ },
    "construction": { /* ... */ },
    "specialized": { /* ... */ }
  },
  "colorScheme": "bloomberg-default",
  "compactMode": false,
  "showExportButtons": true
}
```

---

## 🛠️ Implementation Steps

### Phase 1: Backend Foundation (1-2 hours)

**1.1 Database Setup**
- Create `dashboard_preferences` table
- Add migration script
- Test CRUD operations

**1.2 API Endpoints**
- `GET /api/dashboard/preferences` - Get user's preferences
- `POST /api/dashboard/preferences` - Save preferences
- `PUT /api/dashboard/preferences/:viewName` - Update view
- `DELETE /api/dashboard/preferences/:viewName` - Delete view
- `POST /api/dashboard/preferences/:viewName/activate` - Set as active

**1.3 Default Preferences**
- Generate default preferences on first access
- Include all 20 charts visible by default
- Natural ordering (as designed)

### Phase 2: Frontend UI Components (2-3 hours)

**2.1 Chart Controls Component**
```html
<div class="chart-controls">
  <button class="favorite-btn" data-chart-id="chart-attribution">
    <span class="star-icon">★</span>
  </button>
  <select class="size-selector">
    <option value="compact">Compact</option>
    <option value="normal" selected>Normal</option>
    <option value="expanded">Expanded</option>
  </select>
  <button class="visibility-toggle" data-chart-id="chart-attribution">
    <span class="eye-icon">👁</span>
  </button>
  <button class="drag-handle" draggable="true">
    <span class="grip-icon">⋮⋮</span>
  </button>
</div>
```

**2.2 View Selector**
```html
<div class="view-selector">
  <select id="dashboard-view-select">
    <option value="default" selected>Default View</option>
    <option value="daily-review">Daily Review</option>
    <option value="client-meeting">Client Meeting</option>
  </select>
  <button id="save-view-btn">Save As...</button>
  <button id="manage-views-btn">Manage Views</button>
</div>
```

**2.3 Favorites Tab**
```html
<div class="dashboard-tabs">
  <button class="dashboard-tab" data-tab="favorites">
    Favorites ⭐ <span id="favorites-count">0</span>
  </button>
  <!-- existing tabs -->
</div>

<div id="tab-favorites" class="tab-content hidden">
  <div id="favorites-grid" class="charts-grid">
    <!-- Favorited charts appear here -->
  </div>
</div>
```

### Phase 3: Drag & Drop Implementation (2 hours)

**3.1 HTML5 Drag & Drop**
```javascript
class ChartDragDrop {
  constructor() {
    this.draggedElement = null;
    this.init();
  }

  init() {
    document.querySelectorAll('.chart-container').forEach(chart => {
      chart.setAttribute('draggable', 'true');
      chart.addEventListener('dragstart', this.handleDragStart.bind(this));
      chart.addEventListener('dragover', this.handleDragOver.bind(this));
      chart.addEventListener('drop', this.handleDrop.bind(this));
      chart.addEventListener('dragend', this.handleDragEnd.bind(this));
    });
  }

  handleDragStart(e) {
    this.draggedElement = e.currentTarget;
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  }

  handleDrop(e) {
    e.preventDefault();
    if (this.draggedElement !== e.currentTarget) {
      // Swap positions
      const parent = e.currentTarget.parentNode;
      const draggedIndex = Array.from(parent.children).indexOf(this.draggedElement);
      const targetIndex = Array.from(parent.children).indexOf(e.currentTarget);

      if (draggedIndex < targetIndex) {
        parent.insertBefore(this.draggedElement, e.currentTarget.nextSibling);
      } else {
        parent.insertBefore(this.draggedElement, e.currentTarget);
      }

      // Save new order
      this.saveChartOrder();
    }
    return false;
  }

  saveChartOrder() {
    const order = Array.from(document.querySelectorAll('.chart-container')).map((el, idx) => ({
      id: el.dataset.chartId,
      order: idx
    }));

    window.dashboardCustomization.savePreferences({ chartOrder: order });
  }
}
```

### Phase 4: Preferences Management (2 hours)

**4.1 DashboardCustomization Class**
```javascript
class DashboardCustomization {
  constructor() {
    this.preferences = null;
    this.currentView = 'default';
    this.init();
  }

  async init() {
    await this.loadPreferences();
    this.applyPreferences();
    this.setupEventListeners();
  }

  async loadPreferences() {
    const response = await fetch('/api/dashboard/preferences');
    if (response.ok) {
      this.preferences = await response.json();
    } else {
      this.preferences = this.getDefaultPreferences();
    }
  }

  async savePreferences(updates = {}) {
    this.preferences = { ...this.preferences, ...updates };

    const response = await fetch('/api/dashboard/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.preferences)
    });

    if (response.ok) {
      this.showToast('Preferences saved!');
    }
  }

  applyPreferences() {
    const currentTab = this.getCurrentTab();
    const tabPrefs = this.preferences.tabs[currentTab];

    if (!tabPrefs) return;

    // Apply visibility
    tabPrefs.charts.forEach(chart => {
      const el = document.getElementById(chart.id);
      if (el) {
        el.style.display = chart.visible ? 'block' : 'none';
      }
    });

    // Apply order
    this.reorderCharts(tabPrefs.charts);

    // Apply favorites
    this.updateFavorites();
  }

  toggleChartVisibility(chartId) {
    const currentTab = this.getCurrentTab();
    const chart = this.preferences.tabs[currentTab].charts.find(c => c.id === chartId);
    if (chart) {
      chart.visible = !chart.visible;
      this.savePreferences();
      this.applyPreferences();
    }
  }

  toggleFavorite(chartId) {
    const currentTab = this.getCurrentTab();
    const chart = this.preferences.tabs[currentTab].charts.find(c => c.id === chartId);
    if (chart) {
      chart.favorited = !chart.favorited;
      this.savePreferences();
      this.updateFavorites();
    }
  }

  updateFavorites() {
    const favoritesGrid = document.getElementById('favorites-grid');
    if (!favoritesGrid) return;

    favoritesGrid.innerHTML = '';

    // Collect all favorited charts across tabs
    Object.keys(this.preferences.tabs).forEach(tabName => {
      this.preferences.tabs[tabName].charts.forEach(chart => {
        if (chart.favorited) {
          const chartEl = document.getElementById(chart.id);
          if (chartEl) {
            const clone = chartEl.cloneNode(true);
            clone.dataset.sourceTab = tabName;
            favoritesGrid.appendChild(clone);
          }
        }
      });
    });

    // Update count
    const count = favoritesGrid.children.length;
    document.getElementById('favorites-count').textContent = count;
  }

  getDefaultPreferences() {
    return {
      viewName: 'default',
      tabs: {
        performance: {
          charts: [
            { id: 'chart-attribution', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-excess-return', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-drawdown', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-rolling-stats', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        risk: {
          charts: [
            { id: 'chart-risk-decomposition', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-var', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-correlation', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-stress', visible: true, order: 3, size: 'normal', favorited: false },
            { id: 'chart-concentration-treemap', visible: true, order: 4, size: 'normal', favorited: false }
          ]
        },
        attribution: {
          charts: [
            { id: 'chart-regional', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-sector-rotation', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-peer-benchmarking', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-alpha-decay', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        construction: {
          charts: [
            { id: 'chart-efficient-frontier', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-turnover', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-liquidity', visible: true, order: 2, size: 'normal', favorited: false },
            { id: 'chart-tca-boxplot', visible: true, order: 3, size: 'normal', favorited: false }
          ]
        },
        specialized: {
          charts: [
            { id: 'chart-alternatives', visible: true, order: 0, size: 'normal', favorited: false },
            { id: 'chart-esg-radar', visible: true, order: 1, size: 'normal', favorited: false },
            { id: 'chart-goals', visible: true, order: 2, size: 'normal', favorited: false }
          ]
        }
      },
      colorScheme: 'bloomberg-default',
      compactMode: false,
      showExportButtons: true
    };
  }
}
```

### Phase 5: View Management (1-2 hours)

**5.1 Save View Dialog**
```html
<div id="save-view-modal" class="modal hidden">
  <div class="modal-content">
    <h3>Save Dashboard View</h3>
    <input type="text" id="view-name-input" placeholder="Enter view name..." />
    <div class="modal-actions">
      <button id="save-view-confirm">Save</button>
      <button id="save-view-cancel">Cancel</button>
    </div>
  </div>
</div>
```

**5.2 Manage Views Dialog**
```html
<div id="manage-views-modal" class="modal hidden">
  <div class="modal-content">
    <h3>Manage Dashboard Views</h3>
    <div id="views-list">
      <!-- List of saved views with delete/activate buttons -->
    </div>
    <button id="close-manage-views">Close</button>
  </div>
</div>
```

### Phase 6: Polish & Testing (1 hour)

**6.1 Animations**
- Smooth chart reordering
- Fade in/out for visibility toggle
- Star animation for favorites

**6.2 Keyboard Shortcuts**
- `Ctrl+S` - Save current view
- `Ctrl+F` - Toggle favorite on selected chart
- `Ctrl+H` - Hide selected chart
- `Ctrl+R` - Reset to default

**6.3 Error Handling**
- Handle save failures
- Validate view names
- Confirm before delete

---

## 📊 File Structure

### Backend
```
/backend/src/
├── routes/
│   └── dashboard.js (new)          # Dashboard preferences API
├── services/
│   └── dashboardService.js (new)   # Preferences CRUD logic
└── migrations/
    └── 007_dashboard_preferences.sql (new)
```

### Frontend
```
/frontend/
├── views/
│   └── partials/
│       └── dashboard-customization-controls.ejs (new)
└── public/
    ├── js/
    │   ├── dashboard-customization.js (new)
    │   └── chart-drag-drop.js (new)
    └── css/
        └── dashboard-customization.css (new)
```

---

## ⏱️ Estimated Timeline

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Backend Foundation | 2h | ⏳ Pending |
| 2 | Frontend UI Components | 3h | ⏳ Pending |
| 3 | Drag & Drop | 2h | ⏳ Pending |
| 4 | Preferences Management | 2h | ⏳ Pending |
| 5 | View Management | 2h | ⏳ Pending |
| 6 | Polish & Testing | 1h | ⏳ Pending |
| **Total** | | **12h** | |

---

## 🎯 Success Criteria

- ✅ Users can show/hide charts
- ✅ Users can reorder charts via drag & drop
- ✅ Users can favorite charts
- ✅ Favorites tab shows all pinned charts
- ✅ Users can save multiple named views
- ✅ Preferences persist across sessions
- ✅ Preferences sync across tabs
- ✅ Export/import functionality works
- ✅ Smooth animations and transitions
- ✅ Mobile responsive (touch drag)

---

## 💡 Future Enhancements

- [ ] Shared views (team collaboration)
- [ ] View templates marketplace
- [ ] Advanced chart customization (colors, fonts, sizes)
- [ ] Scheduled view switching
- [ ] AI-suggested layouts based on usage patterns

---

**Ready to implement!** 🚀
