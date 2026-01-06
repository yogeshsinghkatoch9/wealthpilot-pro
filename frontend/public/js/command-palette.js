/**
 * WealthPilot Pro - Command Palette
 * Quick navigation and search across all features
 * Triggered with Cmd/Ctrl + K
 */

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.commands = [];
    this.filteredCommands = [];
    this.recentCommands = this.loadRecent();
    this.favorites = this.loadFavorites();
    
    this.initCommands();
    this.createDOM();
    this.bindEvents();
  }

  initCommands() {
    this.commands = [
      // Dashboard
      { id: 'dashboard', label: 'Dashboard', description: 'Portfolio overview', url: '/', icon: 'home', category: 'Core' },
      { id: 'portfolio', label: 'Portfolio', description: 'Manage holdings', url: '/portfolio', icon: 'briefcase', category: 'Core' },
      { id: 'holdings', label: 'Holdings', description: 'View all positions', url: '/holdings', icon: 'list', category: 'Core' },
      { id: 'transactions', label: 'Transactions', description: 'Transaction history', url: '/transactions', icon: 'repeat', category: 'Core' },
      { id: 'watchlist', label: 'Watchlist', description: 'Tracked stocks', url: '/watchlist', icon: 'eye', category: 'Core' },
      { id: 'snapshot', label: 'Daily Snapshot', description: 'Market summary', url: '/snapshot', icon: 'camera', category: 'Core' },
      
      // Analysis
      { id: 'analytics', label: 'Analytics', description: 'Portfolio analytics', url: '/analytics', icon: 'bar-chart', category: 'Analysis' },
      { id: 'performance', label: 'Performance', description: 'Returns analysis', url: '/performance', icon: 'trending-up', category: 'Analysis' },
      { id: 'sectors', label: 'Sector Allocation', description: 'Sector breakdown', url: '/sectors', icon: 'pie-chart', category: 'Analysis' },
      { id: 'dividends', label: 'Dividends', description: 'Income analysis', url: '/dividends', icon: 'dollar-sign', category: 'Analysis' },
      { id: 'risk', label: 'Risk Analysis', description: 'Risk metrics', url: '/risk', icon: 'shield', category: 'Analysis' },
      { id: 'correlation', label: 'Correlation Matrix', description: 'Asset correlations', url: '/correlation', icon: 'grid', category: 'Analysis' },
      { id: 'tax-lots', label: 'Tax Lots', description: 'Tax lot tracking', url: '/tax-lots', icon: 'file-text', category: 'Analysis' },
      
      // Technical
      { id: 'technicals', label: 'Technical Indicators', description: 'Chart analysis', url: '/technicals', icon: 'activity', category: 'Technical' },
      { id: 'moving-averages', label: 'Moving Averages', description: 'MA analysis', url: '/moving-averages', icon: 'trending-up', category: 'Technical' },
      { id: 'bollinger-bands', label: 'Bollinger Bands', description: 'Volatility bands', url: '/bollinger-bands', icon: 'activity', category: 'Technical' },
      { id: 'volume-profile', label: 'Volume Profile', description: 'Volume analysis', url: '/volume-profile', icon: 'bar-chart-2', category: 'Technical' },
      { id: 'fibonacci', label: 'Fibonacci Levels', description: 'Fib retracements', url: '/fibonacci', icon: 'layers', category: 'Technical' },
      
      // Fundamentals
      { id: 'financials', label: 'Financial Statements', description: 'Company financials', url: '/financials', icon: 'file-text', category: 'Fundamentals' },
      { id: 'valuation', label: 'Valuation Metrics', description: 'P/E, P/B, etc.', url: '/valuation', icon: 'tag', category: 'Fundamentals' },
      { id: 'earnings-calendar', label: 'Earnings Calendar', description: 'Upcoming earnings', url: '/earnings-calendar', icon: 'calendar', category: 'Fundamentals' },
      { id: 'analyst-ratings', label: 'Analyst Ratings', description: 'Wall Street ratings', url: '/analyst-ratings', icon: 'star', category: 'Fundamentals' },
      
      // Tools
      { id: 'scanner', label: 'Stock Scanner', description: 'Screen for stocks', url: '/scanner', icon: 'search', category: 'Tools' },
      { id: 'alerts', label: 'Price Alerts', description: 'Manage alerts', url: '/alerts', icon: 'bell', category: 'Tools' },
      { id: 'calculator', label: 'Calculators', description: 'Financial calcs', url: '/calculators', icon: 'calculator', category: 'Tools' },
      { id: 'rebalancer', label: 'Rebalancer', description: 'Portfolio rebalance', url: '/rebalancer', icon: 'sliders', category: 'Tools' },
      { id: 'import-wizard', label: 'Import Wizard', description: 'Import data', url: '/import-wizard', icon: 'upload', category: 'Tools' },
      { id: 'quick-start', label: 'Quick Start', description: 'Setup wizard', url: '/quick-start', icon: 'zap', category: 'Tools' },
      
      // Reports
      { id: 'reports', label: 'Reports', description: 'Generate reports', url: '/reports', icon: 'file', category: 'Reports' },
      { id: 'tax', label: 'Tax Center', description: 'Tax analysis', url: '/tax', icon: 'file-text', category: 'Reports' },
      { id: 'export', label: 'Export Data', description: 'Download data', url: '/export', icon: 'download', category: 'Reports' },
      
      // Settings
      { id: 'settings', label: 'Settings', description: 'App settings', url: '/settings', icon: 'settings', category: 'Account' },
      { id: 'profile', label: 'Profile', description: 'Your profile', url: '/profile', icon: 'user', category: 'Account' },
      
      // Actions (not navigation)
      { id: 'add-holding', label: 'Add Holding', description: 'Add new position', action: 'addHolding', icon: 'plus-circle', category: 'Actions' },
      { id: 'add-transaction', label: 'Add Transaction', description: 'Record transaction', action: 'addTransaction', icon: 'plus', category: 'Actions' },
      { id: 'refresh-quotes', label: 'Refresh Quotes', description: 'Update prices', action: 'refreshQuotes', icon: 'refresh-cw', category: 'Actions' },
      { id: 'toggle-theme', label: 'Toggle Theme', description: 'Dark/Light mode', action: 'toggleTheme', icon: 'moon', category: 'Actions' },
    ];

    // Add stock search capability
    this.commands.push({
      id: 'search-stock',
      label: 'Search Stock...',
      description: 'Look up any stock',
      action: 'searchStock',
      icon: 'search',
      category: 'Search'
    });
  }

  createDOM() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'command-palette-overlay';
    this.overlay.innerHTML = `
      <div class="command-palette">
        <div class="command-palette-header">
          <svg class="command-palette-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" class="command-palette-input" placeholder="Search pages, actions, or stocks..." autocomplete="off">
          <kbd class="command-palette-shortcut">ESC</kbd>
        </div>
        <div class="command-palette-content">
          <div class="command-palette-results"></div>
        </div>
        <div class="command-palette-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>⌘K</kbd> Toggle</span>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .command-palette-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 9999;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding-top: 15vh;
      }
      .command-palette-overlay.open {
        display: flex;
      }
      .command-palette {
        width: 100%;
        max-width: 640px;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        overflow: hidden;
      }
      .command-palette-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid #334155;
      }
      .command-palette-icon {
        width: 20px;
        height: 20px;
        color: #64748b;
        flex-shrink: 0;
      }
      .command-palette-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 16px;
        color: white;
      }
      .command-palette-input::placeholder {
        color: #64748b;
      }
      .command-palette-shortcut {
        padding: 4px 8px;
        background: #334155;
        border-radius: 4px;
        font-size: 12px;
        color: #94a3b8;
      }
      .command-palette-content {
        max-height: 400px;
        overflow-y: auto;
      }
      .command-palette-results {
        padding: 8px;
      }
      .command-category {
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.05em;
      }
      .command-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .command-item:hover,
      .command-item.selected {
        background: #334155;
      }
      .command-item-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #334155;
        border-radius: 8px;
        color: #94a3b8;
      }
      .command-item.selected .command-item-icon {
        background: #3b82f6;
        color: white;
      }
      .command-item-content {
        flex: 1;
        min-width: 0;
      }
      .command-item-label {
        font-weight: 500;
        color: white;
      }
      .command-item-description {
        font-size: 13px;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .command-item-badge {
        padding: 2px 8px;
        background: #3b82f6;
        border-radius: 4px;
        font-size: 11px;
        color: white;
      }
      .command-item-favorite {
        color: #f59e0b;
      }
      .command-palette-footer {
        display: flex;
        gap: 16px;
        padding: 12px 16px;
        border-top: 1px solid #334155;
        font-size: 12px;
        color: #64748b;
      }
      .command-palette-footer kbd {
        padding: 2px 6px;
        background: #334155;
        border-radius: 4px;
        margin-right: 4px;
      }
      .command-empty {
        padding: 32px;
        text-align: center;
        color: #64748b;
      }
      
      @media (max-width: 640px) {
        .command-palette-overlay {
          padding: 8px;
          padding-top: 8px;
        }
        .command-palette {
          max-height: calc(100vh - 16px);
        }
        .command-palette-footer {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(this.overlay);

    this.input = this.overlay.querySelector('.command-palette-input');
    this.results = this.overlay.querySelector('.command-palette-results');
  }

  bindEvents() {
    // Keyboard shortcut to open
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
      
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Input handling
    this.input.addEventListener('input', () => {
      this.filter(this.input.value);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectPrev();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.add('open');
    this.input.value = '';
    this.input.focus();
    this.filter('');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  filter(query) {
    const q = query.toLowerCase().trim();
    
    if (!q) {
      // Show recent and favorites
      this.filteredCommands = [
        ...this.favorites.map(id => this.commands.find(c => c.id === id)).filter(Boolean),
        ...this.recentCommands.map(id => this.commands.find(c => c.id === id)).filter(Boolean)
      ];
      // Remove duplicates
      this.filteredCommands = [...new Map(this.filteredCommands.map(c => [c.id, c])).values()];
      
      if (this.filteredCommands.length === 0) {
        this.filteredCommands = this.commands.slice(0, 10);
      }
    } else {
      // Search commands
      this.filteredCommands = this.commands.filter(cmd => {
        const searchText = `${cmd.label} ${cmd.description} ${cmd.category}`.toLowerCase();
        return searchText.includes(q);
      });

      // Sort by relevance
      this.filteredCommands.sort((a, b) => {
        const aLabel = a.label.toLowerCase();
        const bLabel = b.label.toLowerCase();
        
        // Exact match first
        if (aLabel === q) return -1;
        if (bLabel === q) return 1;
        
        // Starts with query
        if (aLabel.startsWith(q) && !bLabel.startsWith(q)) return -1;
        if (bLabel.startsWith(q) && !aLabel.startsWith(q)) return 1;
        
        return 0;
      });
    }

    this.selectedIndex = 0;
    this.render();
  }

  render() {
    if (this.filteredCommands.length === 0) {
      this.results.innerHTML = `
        <div class="command-empty">
          <svg class="w-12 h-12 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p>No results found</p>
        </div>
      `;
      return;
    }

    // Group by category
    const grouped = {};
    this.filteredCommands.forEach(cmd => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = [];
      }
      grouped[cmd.category].push(cmd);
    });

    let html = '';
    let globalIndex = 0;

    for (const [category, commands] of Object.entries(grouped)) {
      html += `<div class="command-category">${category}</div>`;
      
      for (const cmd of commands) {
        const isFavorite = this.favorites.includes(cmd.id);
        const isSelected = globalIndex === this.selectedIndex;
        
        html += `
          <div class="command-item ${isSelected ? 'selected' : ''}" data-index="${globalIndex}" data-id="${cmd.id}">
            <div class="command-item-icon">
              ${this.getIcon(cmd.icon)}
            </div>
            <div class="command-item-content">
              <div class="command-item-label">${cmd.label}</div>
              <div class="command-item-description">${cmd.description}</div>
            </div>
            ${isFavorite ? '<span class="command-item-favorite">★</span>' : ''}
          </div>
        `;
        globalIndex++;
      }
    }

    this.results.innerHTML = html;

    // Bind click events
    this.results.querySelectorAll('.command-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedIndex = parseInt(item.dataset.index);
        this.executeSelected();
      });
    });
  }

  getIcon(name) {
    const icons = {
      'home': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>',
      'briefcase': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
      'list': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
      'search': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>',
      'bell': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',
      'bar-chart': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
      'trending-up': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>',
      'settings': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
      'plus': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>',
      'zap': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>'
    };
    
    const path = icons[name] || icons['search'];
    return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${path}</svg>`;
  }

  selectNext() {
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
    this.render();
    this.scrollToSelected();
  }

  selectPrev() {
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.render();
    this.scrollToSelected();
  }

  scrollToSelected() {
    const selected = this.results.querySelector('.command-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelected() {
    const cmd = this.filteredCommands[this.selectedIndex];
    if (!cmd) return;

    // Save to recent
    this.saveRecent(cmd.id);

    if (cmd.url) {
      window.location.href = cmd.url;
    } else if (cmd.action) {
      this.executeAction(cmd.action);
    }

    this.close();
  }

  executeAction(action) {
    switch (action) {
      case 'addHolding':
        window.location.href = '/holdings?action=add';
        break;
      case 'addTransaction':
        window.location.href = '/transactions?action=add';
        break;
      case 'refreshQuotes':
        if (window.refreshPrices) window.refreshPrices();
        break;
      case 'toggleTheme':
        const current = document.documentElement.dataset.theme;
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = newTheme;
        fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: newTheme })
        });
        break;
      case 'searchStock':
        // Prompt for stock symbol
        this.close();
        setTimeout(() => {
          const symbol = prompt('Enter stock symbol (e.g., AAPL, MSFT, GOOGL):');
          if (symbol && symbol.trim()) {
            window.location.href = `/stock/${symbol.trim().toUpperCase()}`;
          }
        }, 100);
        break;
    }
  }

  saveRecent(id) {
    this.recentCommands = [id, ...this.recentCommands.filter(i => i !== id)].slice(0, 5);
    localStorage.setItem('wealthpilot_recent_commands', JSON.stringify(this.recentCommands));
  }

  loadRecent() {
    try {
      return JSON.parse(localStorage.getItem('wealthpilot_recent_commands') || '[]');
    } catch {
      return [];
    }
  }

  toggleFavorite(id) {
    if (this.favorites.includes(id)) {
      this.favorites = this.favorites.filter(i => i !== id);
    } else {
      this.favorites.push(id);
    }
    localStorage.setItem('wealthpilot_favorite_commands', JSON.stringify(this.favorites));
  }

  loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem('wealthpilot_favorite_commands') || '[]');
    } catch {
      return [];
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.commandPalette = new CommandPalette();
});

// Export for module use
if (typeof module !== 'undefined') {
  module.exports = CommandPalette;
}
