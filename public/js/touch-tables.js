/**
 * Touch-Optimized Tables
 * Handles swipe gestures, expand/collapse, and mobile interactions
 */

class TouchTable {
  constructor(tableElement) {
    this.table = tableElement;
    this.rows = [];
    this.selectedRows = new Set();
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.isSwiping = false;

    this.init();
  }

  init() {
    if (window.innerWidth <= 768) {
      this.setupMobileInteractions();
    }

    // Reinitialize on resize
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 768) {
        this.setupMobileInteractions();
      }
    });
  }

  setupMobileInteractions() {
    const rows = this.table.querySelectorAll('tbody tr');

    rows.forEach((row, index) => {
      // Swipe gestures
      if (this.table.classList.contains('touch-table-swipeable')) {
        this.setupSwipeGestures(row);
      }

      // Expandable rows
      if (this.table.classList.contains('touch-table-expandable')) {
        this.setupExpandable(row);
      }

      // Selectable rows
      if (this.table.classList.contains('touch-table-selectable')) {
        this.setupSelectable(row, index);
      }
    });

    // Pull to refresh
    if (this.table.classList.contains('touch-table-refreshable')) {
      this.setupPullToRefresh();
    }
  }

  setupSwipeGestures(row) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;

    row.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    });

    row.addEventListener('touchmove', (e) => {
      if (!isDragging) return;

      currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;
      const deltaY = e.touches[0].clientY - startY;

      // Only swipe if horizontal movement is greater
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        e.preventDefault();
        row.style.transform = `translateX(${deltaX}px)`;
        row.classList.add('swiping');
      }
    });

    row.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;

      const deltaX = currentX - startX;

      // Swipe threshold
      if (Math.abs(deltaX) > 80) {
        if (deltaX > 0) {
          // Swiped right
          row.classList.add('swiped-right');
          this.onSwipeRight(row);
        } else {
          // Swiped left
          row.classList.add('swiped-left');
          this.onSwipeLeft(row);
        }
      } else {
        // Reset
        row.style.transform = '';
        row.classList.remove('swiping');
      }
    });
  }

  onSwipeLeft(row) {
    // Show delete action
    console.log('Swiped left:', row);

    // You can trigger an action here
    const deleteBtn = row.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.style.display = 'flex';
    }

    // Reset after delay or user taps elsewhere
    setTimeout(() => {
      row.style.transform = '';
      row.classList.remove('swiped-left');
    }, 3000);
  }

  onSwipeRight(row) {
    // Show edit action
    console.log('Swiped right:', row);

    // Reset after delay
    setTimeout(() => {
      row.style.transform = '';
      row.classList.remove('swiped-right');
    }, 3000);
  }

  setupExpandable(row) {
    const details = row.querySelector('.touch-table-details');

    if (details) {
      details.style.display = 'none';

      row.addEventListener('click', (e) => {
        // Don't expand if clicking on a button or link
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
          return;
        }

        const isExpanded = row.classList.contains('expanded');

        // Close all other expanded rows
        this.table.querySelectorAll('tbody tr.expanded').forEach(r => {
          r.classList.remove('expanded');
          const d = r.querySelector('.touch-table-details');
          if (d) d.style.display = 'none';
        });

        // Toggle current row
        if (!isExpanded) {
          row.classList.add('expanded');
          details.style.display = 'block';
        }
      });
    }
  }

  setupSelectable(row, index) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'touch-table-checkbox';
    checkbox.dataset.index = index;

    // Insert checkbox at the beginning of the row
    row.insertBefore(checkbox, row.firstChild);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedRows.add(index);
        row.classList.add('selected');
      } else {
        this.selectedRows.delete(index);
        row.classList.remove('selected');
      }

      this.updateBulkActions();
    });
  }

  updateBulkActions() {
    const bulkActionsBar = document.querySelector('.touch-table-bulk-actions');
    const count = this.selectedRows.size;

    if (bulkActionsBar) {
      if (count > 0) {
        bulkActionsBar.classList.add('active');
        const countEl = bulkActionsBar.querySelector('.touch-table-bulk-actions-count');
        if (countEl) {
          countEl.textContent = `${count} selected`;
        }
      } else {
        bulkActionsBar.classList.remove('active');
      }
    }
  }

  setupPullToRefresh() {
    const container = this.table.closest('.touch-table-container');
    if (!container) return;

    let startY = 0;
    let isPulling = false;

    container.addEventListener('touchstart', (e) => {
      if (container.scrollTop === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    });

    container.addEventListener('touchmove', (e) => {
      if (!isPulling) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 80) {
        this.showRefreshIndicator();
      }
    });

    container.addEventListener('touchend', (e) => {
      if (!isPulling) return;
      isPulling = false;

      const currentY = e.changedTouches[0].clientY;
      const diff = currentY - startY;

      if (diff > 80) {
        this.triggerRefresh();
      } else {
        this.hideRefreshIndicator();
      }
    });
  }

  showRefreshIndicator() {
    let indicator = this.table.querySelector('.touch-table-refresh-indicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'touch-table-refresh-indicator pulling';
      indicator.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <div>Release to refresh</div>
      `;
      this.table.parentElement.insertBefore(indicator, this.table);
    } else {
      indicator.classList.add('pulling');
    }
  }

  hideRefreshIndicator() {
    const indicator = this.table.querySelector('.touch-table-refresh-indicator');
    if (indicator) {
      indicator.classList.remove('pulling');
    }
  }

  triggerRefresh() {
    console.log('Refreshing table...');

    // Dispatch custom event
    this.table.dispatchEvent(new CustomEvent('table:refresh'));

    // Show loading state
    this.table.classList.add('touch-table-loading');

    // Hide indicator after a moment
    setTimeout(() => {
      this.hideRefreshIndicator();
      this.table.classList.remove('touch-table-loading');
    }, 1000);
  }

  // Sorting
  setupSorting() {
    const headers = this.table.querySelectorAll('th[data-sort]');

    headers.forEach(header => {
      header.addEventListener('click', () => {
        const sortKey = header.dataset.sort;
        const currentSort = header.classList.contains('sort-asc') ? 'asc' :
                           header.classList.contains('sort-desc') ? 'desc' : null;

        // Remove sorting from all headers
        headers.forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });

        // Toggle sorting
        if (currentSort === 'asc') {
          header.classList.add('sort-desc');
          this.sortTable(sortKey, 'desc');
        } else {
          header.classList.add('sort-asc');
          this.sortTable(sortKey, 'asc');
        }
      });
    });
  }

  sortTable(key, direction) {
    const tbody = this.table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
      const aValue = a.querySelector(`[data-sort-key="${key}"]`)?.textContent || '';
      const bValue = b.querySelector(`[data-sort-key="${key}"]`)?.textContent || '';

      // Try numeric comparison first
      const aNum = parseFloat(aValue.replace(/[^0-9.-]/g, ''));
      const bNum = parseFloat(bValue.replace(/[^0-9.-]/g, ''));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Fallback to string comparison
      return direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
  }

  // Get selected row data
  getSelectedData() {
    const data = [];
    this.selectedRows.forEach(index => {
      const row = this.table.querySelectorAll('tbody tr')[index];
      if (row) {
        const rowData = {};
        row.querySelectorAll('td').forEach(cell => {
          const label = cell.dataset.label;
          if (label) {
            rowData[label] = cell.textContent.trim();
          }
        });
        data.push(rowData);
      }
    });
    return data;
  }

  // Clear selection
  clearSelection() {
    this.selectedRows.clear();
    this.table.querySelectorAll('.touch-table-checkbox').forEach(cb => {
      cb.checked = false;
    });
    this.table.querySelectorAll('tbody tr').forEach(row => {
      row.classList.remove('selected');
    });
    this.updateBulkActions();
  }
}

// Auto-initialize all touch tables
document.addEventListener('DOMContentLoaded', () => {
  const tables = document.querySelectorAll('.touch-table');

  tables.forEach(table => {
    window[`touchTable_${table.id || 'default'}`] = new TouchTable(table);
  });
});

// Expose to global scope
window.TouchTable = TouchTable;

// Usage example:
// const myTable = new TouchTable(document.getElementById('myTable'));
//
// // Listen for refresh event
// myTable.table.addEventListener('table:refresh', () => {
//   console.log('Table is refreshing!');
//   // Fetch new data
// });
//
// // Get selected data
// const selected = myTable.getSelectedData();
// console.log('Selected rows:', selected);
