/**
 * Bulk Actions Manager
 * Handle multi-select and batch operations
 */

class BulkActionsManager {
  constructor(options = {}) {
    this.options = {
      tableSelector: options.tableSelector || 'table',
      checkboxSelector: options.checkboxSelector || '.bulk-select-checkbox',
      selectAllSelector: options.selectAllSelector || '.bulk-select-all',
      onSelectionChange: options.onSelectionChange || null,
      actions: options.actions || [],
      ...options
    };

    this.selectedItems = new Set();
    this.allItems = [];
    this.bar = null;
    this.progressModal = null;
    this.init();
  }

  init() {
    this.createBulkBar();
    this.setupEventListeners();
    this.scanItems();
  }

  createBulkBar() {
    // Create bulk actions bar
    this.bar = document.createElement('div');
    this.bar.className = 'bulk-actions-bar';
    this.bar.innerHTML = `
      <div class="bulk-actions-count">
        <span class="bulk-actions-count-number">0</span>
        <span>selected</span>
      </div>

      <div class="bulk-actions-buttons">
        ${this.renderActionButtons()}
      </div>

      <button class="bulk-actions-close" aria-label="Clear selection">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    document.body.appendChild(this.bar);

    // Close button handler
    this.bar.querySelector('.bulk-actions-close').addEventListener('click', () => {
      this.clearSelection();
    });
  }

  renderActionButtons() {
    const defaultActions = [
      {
        id: 'export',
        label: 'Export',
        icon: `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>`,
        handler: (items) => this.handleExport(items)
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>`,
        class: 'danger',
        handler: (items) => this.handleDelete(items)
      }
    ];

    const actions = this.options.actions.length > 0 ? this.options.actions : defaultActions;

    return actions.map(action => `
      <button class="bulk-action-btn ${action.class || ''}" data-action="${action.id}">
        ${action.icon}
        ${action.label}
      </button>
    `).join('');
  }

  setupEventListeners() {
    // Select all checkbox
    const selectAll = document.querySelector(this.options.selectAllSelector);
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectAll();
        } else {
          this.clearSelection();
        }
      });
    }

    // Individual checkboxes - use event delegation
    document.addEventListener('change', (e) => {
      if (e.target.matches(this.options.checkboxSelector) && !e.target.matches(this.options.selectAllSelector)) {
        const itemId = e.target.dataset.itemId || e.target.value;
        if (e.target.checked) {
          this.selectItem(itemId, e.target);
        } else {
          this.deselectItem(itemId, e.target);
        }
      }
    });

    // Action buttons
    this.bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.bulk-action-btn');
      if (btn) {
        const actionId = btn.dataset.action;
        this.executeAction(actionId);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape to clear selection
      if (e.key === 'Escape' && this.selectedItems.size > 0) {
        this.clearSelection();
      }

      // Ctrl+A to select all (in table context)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.isTableFocused()) {
        e.preventDefault();
        this.selectAll();
      }
    });
  }

  scanItems() {
    // Scan all items in table
    const table = document.querySelector(this.options.tableSelector);
    if (!table) return;

    const checkboxes = table.querySelectorAll(this.options.checkboxSelector);
    this.allItems = Array.from(checkboxes)
      .filter(cb => !cb.matches(this.options.selectAllSelector))
      .map(cb => cb.dataset.itemId || cb.value);
  }

  selectItem(itemId, checkbox) {
    this.selectedItems.add(itemId);

    // Visual feedback
    const row = checkbox.closest('tr');
    if (row) {
      row.classList.add('selected', 'just-selected');
      setTimeout(() => row.classList.remove('just-selected'), 600);
    }

    this.updateUI();
    this.triggerSelectionChange();
  }

  deselectItem(itemId, checkbox) {
    this.selectedItems.delete(itemId);

    // Remove visual feedback
    const row = checkbox.closest('tr');
    if (row) {
      row.classList.remove('selected');
    }

    this.updateUI();
    this.triggerSelectionChange();
  }

  selectAll() {
    this.scanItems(); // Refresh items list

    const checkboxes = document.querySelectorAll(this.options.checkboxSelector);
    checkboxes.forEach(cb => {
      if (!cb.matches(this.options.selectAllSelector)) {
        cb.checked = true;
        const itemId = cb.dataset.itemId || cb.value;
        this.selectedItems.add(itemId);

        const row = cb.closest('tr');
        if (row) row.classList.add('selected');
      }
    });

    this.updateUI();
    this.triggerSelectionChange();

    if (window.toast) {
      toast.info(`Selected all ${this.selectedItems.size} items`);
    }
  }

  clearSelection() {
    this.selectedItems.clear();

    const checkboxes = document.querySelectorAll(this.options.checkboxSelector);
    checkboxes.forEach(cb => {
      cb.checked = false;
      const row = cb.closest('tr');
      if (row) row.classList.remove('selected');
    });

    this.updateUI();
    this.triggerSelectionChange();
  }

  updateUI() {
    const count = this.selectedItems.size;

    // Update count
    const countElement = this.bar.querySelector('.bulk-actions-count-number');
    if (countElement) {
      countElement.textContent = count;
    }

    // Show/hide bar
    if (count > 0) {
      this.bar.classList.add('show');
    } else {
      this.bar.classList.remove('show');
    }

    // Update select all checkbox state
    const selectAll = document.querySelector(this.options.selectAllSelector);
    if (selectAll) {
      if (count === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      } else if (count === this.allItems.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
      } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
      }
    }
  }

  triggerSelectionChange() {
    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(Array.from(this.selectedItems));
    }

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('bulkselectionchange', {
      detail: {
        selected: Array.from(this.selectedItems),
        count: this.selectedItems.size
      }
    }));
  }

  executeAction(actionId) {
    if (this.selectedItems.size === 0) {
      if (window.toast) {
        toast.warning('No items selected');
      }
      return;
    }

    const selectedArray = Array.from(this.selectedItems);

    // Find custom action handler
    const customAction = this.options.actions.find(a => a.id === actionId);
    if (customAction && customAction.handler) {
      customAction.handler(selectedArray);
      return;
    }

    // Default handlers
    switch(actionId) {
      case 'export':
        this.handleExport(selectedArray);
        break;
      case 'delete':
        this.handleDelete(selectedArray);
        break;
      default:
        console.warn(`No handler for action: ${actionId}`);
    }
  }

  async handleExport(items) {
    if (window.toast) {
      toast.info(`Exporting ${items.length} items...`);
    }

    // Trigger export event for custom handling
    window.dispatchEvent(new CustomEvent('bulkexport', {
      detail: { items }
    }));
  }

  async handleDelete(items) {
    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete ${items.length} item(s)? This action cannot be undone.`);
    if (!confirmed) return;

    this.showProgress('Deleting items...', items.length);

    // Simulate deletion (replace with actual API calls)
    for (let i = 0; i < items.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      this.updateProgress(i + 1, items.length);

      // Trigger delete event for each item
      window.dispatchEvent(new CustomEvent('bulkdelete', {
        detail: { itemId: items[i] }
      }));
    }

    this.hideProgress();
    this.clearSelection();

    if (window.toast) {
      toast.success(`Deleted ${items.length} items`);
    }
  }

  showProgress(title, total) {
    if (!this.progressModal) {
      this.progressModal = document.createElement('div');
      this.progressModal.className = 'bulk-progress';
      this.progressModal.innerHTML = `
        <div class="bulk-progress-header">
          <div class="bulk-progress-title">${title}</div>
          <button class="bulk-progress-close">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="bulk-progress-bar">
          <div class="bulk-progress-fill" style="width: 0%"></div>
        </div>
        <div class="bulk-progress-status">
          <span class="bulk-progress-current">0 / ${total}</span>
          <span class="bulk-progress-percent">0%</span>
        </div>
      `;
      document.body.appendChild(this.progressModal);

      this.progressModal.querySelector('.bulk-progress-close').addEventListener('click', () => {
        this.hideProgress();
      });
    }

    this.progressModal.classList.add('show');
  }

  updateProgress(current, total) {
    if (!this.progressModal) return;

    const percent = Math.round((current / total) * 100);

    this.progressModal.querySelector('.bulk-progress-fill').style.width = `${percent}%`;
    this.progressModal.querySelector('.bulk-progress-current').textContent = `${current} / ${total}`;
    this.progressModal.querySelector('.bulk-progress-percent').textContent = `${percent}%`;
  }

  hideProgress() {
    if (this.progressModal) {
      this.progressModal.classList.remove('show');
    }
  }

  isTableFocused() {
    const table = document.querySelector(this.options.tableSelector);
    return table && table.contains(document.activeElement);
  }

  getSelectedItems() {
    return Array.from(this.selectedItems);
  }

  getSelectedCount() {
    return this.selectedItems.size;
  }
}

// Initialize bulk actions on tables
document.addEventListener('DOMContentLoaded', () => {
  // Auto-initialize for tables with bulk-actions class
  const tables = document.querySelectorAll('table.bulk-actions-enabled');

  tables.forEach(table => {
    const bulkManager = new BulkActionsManager({
      tableSelector: `#${table.id}`,
      onSelectionChange: (items) => {
        console.log('Selection changed:', items);
      }
    });

    // Store reference
    table.bulkManager = bulkManager;
  });
});

// Expose to global
window.BulkActionsManager = BulkActionsManager;

// Helper function
window.initBulkActions = function(tableSelector, options = {}) {
  return new BulkActionsManager({
    tableSelector,
    ...options
  });
};

// Usage examples:
/*
// Basic usage (auto-detects table)
const bulkManager = new BulkActionsManager();

// Custom table
const bulkManager = new BulkActionsManager({
  tableSelector: '#my-table',
  checkboxSelector: '.my-checkbox',
  selectAllSelector: '#select-all'
});

// Custom actions
const bulkManager = new BulkActionsManager({
  actions: [
    {
      id: 'archive',
      label: 'Archive',
      icon: '<svg>...</svg>',
      handler: (items) => {
        console.log('Archiving:', items);
      }
    },
    {
      id: 'tag',
      label: 'Add Tag',
      icon: '<svg>...</svg>',
      handler: (items) => {
        console.log('Tagging:', items);
      }
    }
  ]
});

// Listen to events
window.addEventListener('bulkselectionchange', (e) => {
  console.log('Selected items:', e.detail.selected);
});

window.addEventListener('bulkexport', (e) => {
  console.log('Export items:', e.detail.items);
});

window.addEventListener('bulkdelete', (e) => {
  console.log('Delete item:', e.detail.itemId);
});
*/
