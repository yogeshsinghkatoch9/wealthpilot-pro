/**
 * WealthPilot Pro - Keyboard Shortcuts System
 * Provides global keyboard shortcuts for navigation and actions
 */

(function() {
  'use strict';

  // Shortcut definitions
  const shortcuts = {
    // Navigation shortcuts (Alt + Key)
    'alt+d': { action: () => navigate('/dashboard'), description: 'Go to Dashboard', category: 'Navigation' },
    'alt+h': { action: () => navigate('/holdings'), description: 'Go to Holdings', category: 'Navigation' },
    'alt+p': { action: () => navigate('/portfolios'), description: 'Go to Portfolios', category: 'Navigation' },
    'alt+w': { action: () => navigate('/watchlist'), description: 'Go to Watchlist', category: 'Navigation' },
    'alt+a': { action: () => navigate('/alerts'), description: 'Go to Alerts', category: 'Navigation' },
    'alt+t': { action: () => navigate('/transactions'), description: 'Go to Transactions', category: 'Navigation' },
    'alt+s': { action: () => navigate('/screener'), description: 'Go to Screener', category: 'Navigation' },
    'alt+n': { action: () => navigate('/analytics'), description: 'Go to Analytics', category: 'Navigation' },
    'alt+m': { action: () => navigate('/market-overview'), description: 'Go to Market Overview', category: 'Navigation' },
    'alt+c': { action: () => navigate('/crypto-portfolio'), description: 'Go to Crypto', category: 'Navigation' },
    'alt+x': { action: () => navigate('/tax-dashboard'), description: 'Go to Tax Dashboard', category: 'Navigation' },
    'alt+i': { action: () => navigate('/ai-assistant'), description: 'Go to AI Assistant', category: 'Navigation' },

    // Action shortcuts (Ctrl/Cmd + Key)
    'ctrl+k': { action: openCommandPalette, description: 'Open Command Palette', category: 'Actions' },
    'cmd+k': { action: openCommandPalette, description: 'Open Command Palette', category: 'Actions' },
    'ctrl+/': { action: toggleShortcutsHelp, description: 'Toggle Keyboard Shortcuts Help', category: 'Actions' },
    'ctrl+shift+t': { action: toggleTheme, description: 'Toggle Dark/Light Theme', category: 'Actions' },
    'ctrl+r': { action: refreshData, description: 'Refresh Data', category: 'Actions' },
    'ctrl+shift+s': { action: quickSearch, description: 'Quick Symbol Search', category: 'Actions' },
    'ctrl+b': { action: openBuyModal, description: 'Buy/Add Holding', category: 'Actions' },
    'ctrl+e': { action: openExportMenu, description: 'Export Data', category: 'Actions' },
    'ctrl+n': { action: openNewPortfolio, description: 'New Portfolio', category: 'Actions' },
    'ctrl+shift+a': { action: openAddAlert, description: 'Add Price Alert', category: 'Actions' },

    // UI shortcuts
    'escape': { action: closeModals, description: 'Close Modals/Menus', category: 'UI' },
    '?': { action: toggleShortcutsHelp, description: 'Show Keyboard Shortcuts', category: 'UI' },
    'f': { action: toggleFullscreen, description: 'Toggle Fullscreen', category: 'UI' },
    's': { action: toggleSidebar, description: 'Toggle Sidebar', category: 'UI' },

    // Vim-style navigation (g + letter)
    'g d': { action: () => navigate('/dividends'), description: 'Go to Dividends', category: 'Navigation' },
    'g e': { action: () => navigate('/esg'), description: 'Go to ESG Analysis', category: 'Navigation' },
    'g r': { action: () => navigate('/reports'), description: 'Go to Reports', category: 'Navigation' },
    'g s': { action: () => navigate('/settings'), description: 'Go to Settings', category: 'Navigation' },
    'g o': { action: () => navigate('/options-chain'), description: 'Go to Options', category: 'Navigation' },
    'g f': { action: () => navigate('/fundamentals'), description: 'Go to Fundamentals', category: 'Navigation' },
    'g t': { action: () => navigate('/technical-analysis'), description: 'Go to Technicals', category: 'Navigation' },
    'g c': { action: () => navigate('/calendar'), description: 'Go to Calendar', category: 'Navigation' },

    // Table navigation (when focused)
    'j': { action: () => tableNavigate('down'), description: 'Next row', category: 'Table' },
    'k': { action: () => tableNavigate('up'), description: 'Previous row', category: 'Table' },
    'enter': { action: tableSelect, description: 'Select/Open row', category: 'Table' },
  };

  // Vim-style navigation buffer
  let keyBuffer = '';
  let keyBufferTimeout = null;

  // State
  let shortcutsEnabled = true;
  let helpVisible = false;

  // Initialize keyboard shortcuts
  function init() {
    document.addEventListener('keydown', handleKeyDown);
    createHelpModal();
    createCommandPalette();
    console.log('⌨️ Keyboard shortcuts initialized. Press ? for help.');
  }

  // Handle keydown events
  function handleKeyDown(e) {
    // Skip if typing in input fields
    if (isTypingInInput(e.target)) {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    // Skip if shortcuts disabled
    if (!shortcutsEnabled) return;

    // Build key combination string
    const key = buildKeyString(e);

    // Check for vim-style multi-key shortcuts (e.g., "g d")
    if (key.length === 1 && /[a-z]/.test(key)) {
      clearTimeout(keyBufferTimeout);
      keyBuffer += key;

      const bufferKey = keyBuffer.trim();
      if (shortcuts[bufferKey]) {
        e.preventDefault();
        shortcuts[bufferKey].action();
        keyBuffer = '';
        return;
      }

      // Clear buffer after 1 second
      keyBufferTimeout = setTimeout(() => {
        keyBuffer = '';
      }, 1000);

      // If buffer is too long, clear it
      if (keyBuffer.length > 3) {
        keyBuffer = '';
      }
      return;
    }

    // Check for direct shortcuts
    if (shortcuts[key]) {
      e.preventDefault();
      shortcuts[key].action();
      keyBuffer = '';
    }
  }

  // Build key combination string
  function buildKeyString(e) {
    const parts = [];

    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('cmd');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey && parts.length > 0) parts.push('shift');

    const key = e.key.toLowerCase();
    if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
      parts.push(key);
    }

    return parts.join('+');
  }

  // Check if user is typing in an input field
  function isTypingInInput(target) {
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
  }

  // Navigation helper
  function navigate(path) {
    window.location.href = path;
  }

  // Refresh data
  function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.click();
    } else if (typeof refreshPrices === 'function') {
      refreshPrices();
    } else {
      location.reload();
    }
    showToast('Refreshing data...', 'info');
  }

  // Toggle theme
  function toggleTheme() {
    if (typeof window.toggleTheme === 'function') {
      window.toggleTheme();
    } else {
      // Fallback theme toggle
      const current = document.documentElement.dataset.theme;
      const newTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = newTheme;
      localStorage.setItem('theme', newTheme);
      showToast(`Theme: ${newTheme}`, 'info');
    }
  }

  // Close all modals
  function closeModals() {
    // Close shortcuts help
    const helpModal = document.getElementById('shortcutsHelp');
    if (helpModal && !helpModal.classList.contains('hidden')) {
      helpModal.classList.add('hidden');
      helpVisible = false;
      return;
    }

    // Close command palette
    const cmdPalette = document.getElementById('commandPalette');
    if (cmdPalette && !cmdPalette.classList.contains('hidden')) {
      cmdPalette.classList.add('hidden');
      return;
    }

    // Close other modals
    document.querySelectorAll('.modal, [role="dialog"]').forEach(modal => {
      if (!modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    });

    // Close dropdowns
    document.querySelectorAll('.dropdown-menu:not(.hidden)').forEach(dropdown => {
      dropdown.classList.add('hidden');
    });
  }

  // Toggle shortcuts help modal
  function toggleShortcutsHelp() {
    const helpModal = document.getElementById('shortcutsHelp');
    if (!helpModal) return;

    helpVisible = !helpVisible;
    if (helpVisible) {
      helpModal.classList.remove('hidden');
      helpModal.classList.add('flex');
    } else {
      helpModal.classList.add('hidden');
      helpModal.classList.remove('flex');
    }
  }

  // Quick symbol search
  function quickSearch() {
    const searchInput = document.querySelector('[data-search-input], #symbolSearch, input[type="search"]');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      openCommandPalette();
    }
  }

  // Open buy/add holding modal
  function openBuyModal() {
    const buyBtn = document.querySelector('[data-action="buy"], #addHoldingBtn, button:has-text("Add"), button:has-text("Buy")');
    if (buyBtn) {
      buyBtn.click();
    } else {
      showToast('Navigate to a portfolio to add holdings', 'info');
    }
  }

  // Open export menu
  function openExportMenu() {
    const exportBtn = document.querySelector('[data-action="export"], #exportBtn, button:has-text("Export")');
    if (exportBtn) {
      exportBtn.click();
    } else {
      navigate('/exports');
    }
  }

  // Open new portfolio modal
  function openNewPortfolio() {
    const newBtn = document.querySelector('[data-action="new-portfolio"], #newPortfolioBtn');
    if (newBtn) {
      newBtn.click();
    } else {
      navigate('/portfolios?action=new');
    }
  }

  // Open add alert modal
  function openAddAlert() {
    const alertBtn = document.querySelector('[data-action="add-alert"], #addAlertBtn');
    if (alertBtn) {
      alertBtn.click();
    } else {
      navigate('/alerts?action=new');
    }
  }

  // Toggle fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      showToast('Fullscreen mode', 'info');
    } else {
      document.exitFullscreen();
    }
  }

  // Toggle sidebar
  function toggleSidebar() {
    const sidebar = document.querySelector('aside, [data-sidebar], .sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('-translate-x-full');
    }
  }

  // Table navigation state
  let selectedRowIndex = -1;

  // Navigate table rows
  function tableNavigate(direction) {
    const table = document.querySelector('table tbody, [data-table] tbody');
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    if (rows.length === 0) return;

    // Remove previous selection
    rows.forEach(row => row.classList.remove('ring-2', 'ring-primary-500', 'bg-primary-500/10'));

    // Update index
    if (direction === 'down') {
      selectedRowIndex = Math.min(selectedRowIndex + 1, rows.length - 1);
    } else {
      selectedRowIndex = Math.max(selectedRowIndex - 1, 0);
    }

    // Highlight new row
    const selectedRow = rows[selectedRowIndex];
    if (selectedRow) {
      selectedRow.classList.add('ring-2', 'ring-primary-500', 'bg-primary-500/10');
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Select table row
  function tableSelect() {
    const table = document.querySelector('table tbody, [data-table] tbody');
    if (!table || selectedRowIndex < 0) return;

    const rows = table.querySelectorAll('tr');
    const selectedRow = rows[selectedRowIndex];
    if (selectedRow) {
      const link = selectedRow.querySelector('a');
      if (link) {
        link.click();
      } else {
        selectedRow.click();
      }
    }
  }

  // Open command palette
  function openCommandPalette() {
    const cmdPalette = document.getElementById('commandPalette');
    if (cmdPalette) {
      cmdPalette.classList.remove('hidden');
      cmdPalette.classList.add('flex');
      const input = cmdPalette.querySelector('input');
      if (input) {
        input.focus();
        input.value = '';
      }
    }
  }

  // Create help modal
  function createHelpModal() {
    const existingModal = document.getElementById('shortcutsHelp');
    if (existingModal) return;

    const theme = document.documentElement.dataset.theme || 'dark';
    const isLight = theme === 'light';

    const modal = document.createElement('div');
    modal.id = 'shortcutsHelp';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="card p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto ${isLight ? 'bg-white' : 'bg-slate-900'}">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold ${isLight ? 'text-gray-900' : 'text-white'}">Keyboard Shortcuts</h2>
          <button onclick="document.getElementById('shortcutsHelp').classList.add('hidden')" class="p-2 rounded hover:bg-slate-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="space-y-6">
          ${renderShortcutCategories()}
        </div>

        <div class="mt-6 pt-4 border-t ${isLight ? 'border-gray-200' : 'border-slate-700'}">
          <p class="text-sm ${isLight ? 'text-gray-500' : 'text-slate-400'}">
            Press <kbd class="kbd">?</kbd> or <kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">/</kbd> to toggle this help
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        helpVisible = false;
      }
    });
  }

  // Render shortcut categories
  function renderShortcutCategories() {
    const categories = {};

    Object.entries(shortcuts).forEach(([key, shortcut]) => {
      const category = shortcut.category || 'Other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({ key, ...shortcut });
    });

    const theme = document.documentElement.dataset.theme || 'dark';
    const isLight = theme === 'light';

    return Object.entries(categories).map(([category, items]) => `
      <div>
        <h3 class="text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-slate-300'} mb-3">${category}</h3>
        <div class="grid grid-cols-2 gap-2">
          ${items.map(item => `
            <div class="flex items-center justify-between p-2 rounded ${isLight ? 'bg-gray-50' : 'bg-slate-800'}">
              <span class="text-sm ${isLight ? 'text-gray-600' : 'text-slate-400'}">${item.description}</span>
              <kbd class="kbd">${formatKey(item.key)}</kbd>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Format key for display
  function formatKey(key) {
    return key
      .replace('ctrl', 'Ctrl')
      .replace('cmd', '⌘')
      .replace('alt', 'Alt')
      .replace('shift', 'Shift')
      .replace(/\+/g, ' + ')
      .replace(' ', 'Space')
      .toUpperCase();
  }

  // Create command palette
  function createCommandPalette() {
    const existingPalette = document.getElementById('commandPalette');
    if (existingPalette) return;

    const theme = document.documentElement.dataset.theme || 'dark';
    const isLight = theme === 'light';

    const palette = document.createElement('div');
    palette.id = 'commandPalette';
    palette.className = 'fixed inset-0 z-50 hidden items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm';
    palette.innerHTML = `
      <div class="card w-full max-w-xl mx-4 overflow-hidden ${isLight ? 'bg-white' : 'bg-slate-900'}">
        <div class="p-4 border-b ${isLight ? 'border-gray-200' : 'border-slate-700'}">
          <input type="text" id="commandInput" placeholder="Type a command or search..."
            class="w-full px-4 py-3 rounded-lg ${isLight ? 'bg-gray-100 text-gray-900' : 'bg-slate-800 text-white'} border-none outline-none text-lg"
            autocomplete="off">
        </div>
        <div id="commandResults" class="max-h-96 overflow-y-auto">
          ${renderCommandItems()}
        </div>
      </div>
    `;

    document.body.appendChild(palette);

    // Handle input
    const input = palette.querySelector('#commandInput');
    input.addEventListener('input', (e) => filterCommands(e.target.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        palette.classList.add('hidden');
      } else if (e.key === 'Enter') {
        const firstResult = palette.querySelector('.command-item');
        if (firstResult) firstResult.click();
      }
    });

    // Close on backdrop click
    palette.addEventListener('click', (e) => {
      if (e.target === palette) {
        palette.classList.add('hidden');
      }
    });
  }

  // Command items for palette
  const commands = [
    // Navigation
    { icon: '📊', label: 'Go to Dashboard', action: () => navigate('/dashboard') },
    { icon: '📈', label: 'Go to Holdings', action: () => navigate('/holdings') },
    { icon: '💼', label: 'Go to Portfolios', action: () => navigate('/portfolios') },
    { icon: '👁️', label: 'Go to Watchlist', action: () => navigate('/watchlist') },
    { icon: '🔔', label: 'Go to Alerts', action: () => navigate('/alerts') },
    { icon: '💵', label: 'Go to Transactions', action: () => navigate('/transactions') },
    { icon: '🔍', label: 'Go to Screener', action: () => navigate('/screener') },
    { icon: '📉', label: 'Go to Analytics', action: () => navigate('/analytics') },
    { icon: '🌐', label: 'Go to Market Overview', action: () => navigate('/market-overview') },
    { icon: '₿', label: 'Go to Crypto Portfolio', action: () => navigate('/crypto-portfolio') },
    { icon: '🌱', label: 'Go to ESG Analysis', action: () => navigate('/esg') },
    { icon: '💰', label: 'Go to Dividends', action: () => navigate('/dividends') },
    { icon: '📄', label: 'Go to Reports', action: () => navigate('/reports') },
    { icon: '⚙️', label: 'Go to Settings', action: () => navigate('/settings') },
    { icon: '💸', label: 'Go to Tax Dashboard', action: () => navigate('/tax-dashboard') },
    { icon: '🤖', label: 'Go to AI Assistant', action: () => navigate('/ai-assistant') },
    { icon: '📅', label: 'Go to Calendar', action: () => navigate('/calendar') },
    { icon: '📊', label: 'Go to Fundamentals', action: () => navigate('/fundamentals') },
    { icon: '📈', label: 'Go to Technical Analysis', action: () => navigate('/technical-analysis') },
    { icon: '⚡', label: 'Go to Options Chain', action: () => navigate('/options-chain') },
    { icon: '⚠️', label: 'Go to Risk Analysis', action: () => navigate('/risk-analysis') },
    { icon: '🏢', label: 'Go to Sector Heatmap', action: () => navigate('/sector-heatmap') },
    // Actions
    { icon: '🎯', label: 'Run Simulator', action: () => navigate('/simulator') },
    { icon: '🌓', label: 'Toggle Theme', action: toggleTheme },
    { icon: '🔄', label: 'Refresh Data', action: refreshData },
    { icon: '⌨️', label: 'Show Keyboard Shortcuts', action: toggleShortcutsHelp },
    { icon: '➕', label: 'Add Holding', action: openBuyModal },
    { icon: '📤', label: 'Export Data', action: openExportMenu },
    { icon: '📁', label: 'New Portfolio', action: openNewPortfolio },
    { icon: '🔔', label: 'Add Price Alert', action: openAddAlert },
    { icon: '⛶', label: 'Toggle Fullscreen', action: toggleFullscreen },
    { icon: '◧', label: 'Toggle Sidebar', action: toggleSidebar },
  ];

  // Render command items
  function renderCommandItems() {
    const theme = document.documentElement.dataset.theme || 'dark';
    const isLight = theme === 'light';

    return commands.map((cmd, i) => `
      <div class="command-item flex items-center gap-3 px-4 py-3 cursor-pointer ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-800'}" data-index="${i}">
        <span class="text-xl">${cmd.icon}</span>
        <span class="${isLight ? 'text-gray-900' : 'text-white'}">${cmd.label}</span>
      </div>
    `).join('');
  }

  // Filter commands
  function filterCommands(query) {
    const results = document.getElementById('commandResults');
    if (!results) return;

    const theme = document.documentElement.dataset.theme || 'dark';
    const isLight = theme === 'light';

    const filtered = commands.filter(cmd =>
      cmd.label.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      results.innerHTML = `<div class="px-4 py-8 text-center ${isLight ? 'text-gray-500' : 'text-slate-400'}">No results found</div>`;
      return;
    }

    results.innerHTML = filtered.map((cmd, i) => `
      <div class="command-item flex items-center gap-3 px-4 py-3 cursor-pointer ${isLight ? 'hover:bg-gray-100' : 'hover:bg-slate-800'}" data-index="${i}">
        <span class="text-xl">${cmd.icon}</span>
        <span class="${isLight ? 'text-gray-900' : 'text-white'}">${cmd.label}</span>
      </div>
    `).join('');

    // Add click handlers
    results.querySelectorAll('.command-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        filtered[i].action();
        document.getElementById('commandPalette').classList.add('hidden');
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.KeyboardShortcuts = {
    enable: () => { shortcutsEnabled = true; },
    disable: () => { shortcutsEnabled = false; },
    showHelp: toggleShortcutsHelp,
    openCommandPalette: openCommandPalette
  };

})();

// Add keyboard shortcut styles
const kbdStyles = document.createElement('style');
kbdStyles.textContent = `
  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--kbd-bg, #374151);
    color: var(--kbd-color, #d1d5db);
    border: 1px solid var(--kbd-border, #4b5563);
    border-radius: 0.25rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  [data-theme="light"] .kbd {
    --kbd-bg: #f3f4f6;
    --kbd-color: #374151;
    --kbd-border: #d1d5db;
  }
`;
document.head.appendChild(kbdStyles);
