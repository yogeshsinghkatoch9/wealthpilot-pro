/**
 * WealthPilot Pro - Mega Menu Navigation
 * Bloomberg-style dropdown navigation system
 */

class MegaMenu {
  constructor() {
    this.activeMenu = null;
    this.closeTimeout = null;
    this.hoverDelay = 150;
    this.closeDelay = 200;

    this.init();
  }

  init() {
    // Get elements
    this.navItems = document.querySelectorAll('.topnav-item[data-menu]');
    this.megamenu = document.getElementById('megamenu');
    this.megamenuContent = document.getElementById('megamenu-content');

    if (!this.megamenu) return;

    // Bind events
    this.navItems.forEach(item => {
      item.addEventListener('mouseenter', () => this.handleItemEnter(item));
      item.addEventListener('mouseleave', () => this.handleItemLeave());
      item.addEventListener('click', (e) => this.handleItemClick(e, item));
    });

    this.megamenu.addEventListener('mouseenter', () => this.handleMenuEnter());
    this.megamenu.addEventListener('mouseleave', () => this.handleMenuLeave());

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenu();
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topnav-item') && !e.target.closest('#megamenu')) {
        this.closeMenu();
      }
    });

    // User menu dropdown
    this.initUserMenu();

    // Mobile menu
    this.initMobileMenu();

    // Search shortcut
    this.initSearchShortcut();
  }

  handleItemEnter(item) {
    this.cancelClose();

    setTimeout(() => {
      if (item.matches(':hover')) {
        this.openMenu(item);
      }
    }, this.hoverDelay);
  }

  handleItemLeave() {
    this.scheduleClose();
  }

  handleMenuEnter() {
    this.cancelClose();
  }

  handleMenuLeave() {
    this.scheduleClose();
  }

  handleItemClick(e, item) {
    e.preventDefault();
    const menuName = item.dataset.menu;

    if (this.activeMenu === menuName) {
      this.closeMenu();
    } else {
      this.openMenu(item);
    }
  }

  openMenu(item) {
    const menuName = item.dataset.menu;

    if (this.activeMenu === menuName) return;

    this.activeMenu = menuName;

    // Update nav items
    this.navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // Load and show menu content
    this.loadMenuContent(menuName);
    this.megamenu.classList.add('open');
  }

  closeMenu() {
    this.activeMenu = null;
    this.megamenu.classList.remove('open');
    this.navItems.forEach(n => n.classList.remove('active'));
  }

  scheduleClose() {
    this.closeTimeout = setTimeout(() => {
      this.closeMenu();
    }, this.closeDelay);
  }

  cancelClose() {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  }

  loadMenuContent(menuName) {
    const content = this.getMenuContent(menuName);
    if (this.megamenuContent) {
      this.megamenuContent.innerHTML = content;
    }
  }

  getMenuContent(menuName) {
    const menus = {
      markets: this.getMarketsMenu(),
      portfolio: this.getPortfolioMenu(),
      analysis: this.getAnalysisMenu(),
      tools: this.getToolsMenu(),
      research: this.getResearchMenu()
    };
    return menus[menuName] || '';
  }

  getMarketsMenu() {
    return `
      <div class="megamenu-grid megamenu-grid-4">
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Overview</h3>
          <ul class="megamenu-links">
            <li><a href="/market" class="megamenu-link">Market Dashboard</a></li>
            <li><a href="/market-breadth" class="megamenu-link">Market Breadth</a></li>
            <li><a href="/market-movers" class="megamenu-link">Top Movers</a></li>
            <li><a href="/sentiment" class="megamenu-link">Market Sentiment</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Sectors</h3>
          <ul class="megamenu-links">
            <li><a href="/sectors" class="megamenu-link">Sector Overview</a></li>
            <li><a href="/sector-rotation" class="megamenu-link">Sector Rotation</a></li>
            <li><a href="/sector-heatmap" class="megamenu-link">Sector Heatmap</a></li>
            <li><a href="/etf-analyzer" class="megamenu-link">ETF Analyzer</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Calendar</h3>
          <ul class="megamenu-links">
            <li><a href="/economic-calendar" class="megamenu-link">Economic Calendar</a></li>
            <li><a href="/earnings-calendar" class="megamenu-link">Earnings Calendar</a></li>
            <li><a href="/dividend-calendar" class="megamenu-link">Dividend Calendar</a></li>
            <li><a href="/ipo-tracker" class="megamenu-link">IPO Tracker</a></li>
            <li><a href="/spac-tracker" class="megamenu-link">SPAC Tracker</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Quick Stats</h3>
          <div class="megamenu-stats">
            <div class="megamenu-stat">
              <div class="megamenu-stat-label">S&P 500</div>
              <div class="megamenu-stat-value positive">+0.45%</div>
            </div>
            <div class="megamenu-stat">
              <div class="megamenu-stat-label">NASDAQ</div>
              <div class="megamenu-stat-value positive">+0.72%</div>
            </div>
            <div class="megamenu-stat">
              <div class="megamenu-stat-label">DOW</div>
              <div class="megamenu-stat-value negative">-0.12%</div>
            </div>
            <div class="megamenu-stat">
              <div class="megamenu-stat-label">VIX</div>
              <div class="megamenu-stat-value">14.32</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getPortfolioMenu() {
    return `
      <div class="megamenu-grid megamenu-grid-4">
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Overview</h3>
          <ul class="megamenu-links">
            <li><a href="/" class="megamenu-link">Dashboard</a></li>
            <li><a href="/portfolio" class="megamenu-link">Portfolio Summary</a></li>
            <li><a href="/performance" class="megamenu-link">Performance</a></li>
            <li><a href="/attribution" class="megamenu-link">Attribution</a></li>
            <li><a href="/compare-portfolios" class="megamenu-link">Compare Portfolios</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Holdings</h3>
          <ul class="megamenu-links">
            <li><a href="/holdings" class="megamenu-link">All Holdings</a></li>
            <li><a href="/watchlist" class="megamenu-link">Watchlist</a></li>
            <li><a href="/tax-lots" class="megamenu-link">Tax Lots</a></li>
            <li><a href="/concentration" class="megamenu-link">Concentration Risk</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Activity</h3>
          <ul class="megamenu-links">
            <li><a href="/transactions" class="megamenu-link">Transactions</a></li>
            <li><a href="/journal" class="megamenu-link">Trading Journal</a></li>
            <li><a href="/import-wizard" class="megamenu-link">Import Wizard</a></li>
            <li><a href="/share-portfolio" class="megamenu-link">Share Portfolio</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Quick Actions</h3>
          <div class="megamenu-featured">
            <div class="megamenu-featured-title">Add Transaction</div>
            <div class="megamenu-featured-desc">Record buy, sell, or dividend transactions</div>
            <a href="/transactions?action=new" class="megamenu-featured-link">Add Now &rarr;</a>
          </div>
        </div>
      </div>
    `;
  }

  getAnalysisMenu() {
    return `
      <div class="megamenu-grid megamenu-grid-6">
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Fundamentals</h3>
          <ul class="megamenu-links">
            <li><a href="/analytics" class="megamenu-link">Analytics</a></li>
            <li><a href="/research" class="megamenu-link">Research</a></li>
            <li><a href="/gross-margin" class="megamenu-link">Gross Margin</a></li>
            <li><a href="/margin-expansion" class="megamenu-link">Margin Expansion</a></li>
            <li><a href="/revenue-per-employee" class="megamenu-link">Rev/Employee</a></li>
            <li><a href="/price-to-sales" class="megamenu-link">Price to Sales</a></li>
            <li><a href="/debt-maturity" class="megamenu-link">Debt Maturity</a></li>
            <li><a href="/interest-coverage" class="megamenu-link">Interest Coverage</a></li>
            <li><a href="/working-capital" class="megamenu-link">Working Capital</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Technical</h3>
          <ul class="megamenu-links">
            <li><a href="/charts" class="megamenu-link">Charts</a></li>
            <li><a href="/technicals" class="megamenu-link">Technical Analysis</a></li>
            <li><a href="/moving-averages" class="megamenu-link">Moving Averages</a></li>
            <li><a href="/rsi" class="megamenu-link">RSI Indicator</a></li>
            <li><a href="/macd" class="megamenu-link">MACD</a></li>
            <li><a href="/bollinger-bands" class="megamenu-link">Bollinger Bands</a></li>
            <li><a href="/stochastic" class="megamenu-link">Stochastic</a></li>
            <li><a href="/adx-indicator" class="megamenu-link">ADX Indicator</a></li>
            <li><a href="/fibonacci" class="megamenu-link">Fibonacci</a></li>
            <li><a href="/volume-profile" class="megamenu-link">Volume Profile</a></li>
            <li><a href="/momentum-screener" class="megamenu-link">Momentum</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Options</h3>
          <ul class="megamenu-links">
            <li><a href="/options-chain" class="megamenu-link">Options Chain</a></li>
            <li><a href="/options-greeks" class="megamenu-link">Options Greeks</a></li>
            <li><a href="/options-straddle" class="megamenu-link">Straddles</a></li>
            <li><a href="/iv-surface" class="megamenu-link">IV Surface</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Income</h3>
          <ul class="megamenu-links">
            <li><a href="/dividends" class="megamenu-link">Dividends</a></li>
            <li><a href="/dividend-screener" class="megamenu-link">Dividend Screener</a></li>
            <li><a href="/dividend-yield-curve" class="megamenu-link">Yield Curve</a></li>
            <li><a href="/payout-ratio" class="megamenu-link">Payout Ratio</a></li>
            <li><a href="/income-projections" class="megamenu-link">Projections</a></li>
            <li><a href="/drip" class="megamenu-link">DRIP Calculator</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Risk</h3>
          <ul class="megamenu-links">
            <li><a href="/risk" class="megamenu-link">Risk Analysis</a></li>
            <li><a href="/stress-test" class="megamenu-link">Stress Test</a></li>
            <li><a href="/correlation" class="megamenu-link">Correlation</a></li>
            <li><a href="/factors" class="megamenu-link">Factor Analysis</a></li>
            <li><a href="/esg" class="megamenu-link">ESG Ratings</a></li>
            <li><a href="/esg-breakdown" class="megamenu-link">ESG Breakdown</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Research</h3>
          <ul class="megamenu-links">
            <li><a href="/stock-compare" class="megamenu-link">Stock Compare</a></li>
            <li><a href="/peer-rankings" class="megamenu-link">Peer Rankings</a></li>
            <li><a href="/insider-trading" class="megamenu-link">Insider Trading</a></li>
            <li><a href="/insider-transactions" class="megamenu-link">Insider Txns</a></li>
            <li><a href="/earnings-whispers" class="megamenu-link">Earnings Whispers</a></li>
            <li><a href="/mutual-funds" class="megamenu-link">Mutual Funds</a></li>
          </ul>
        </div>
      </div>
    `;
  }

  getToolsMenu() {
    return `
      <div class="megamenu-grid megamenu-grid-4">
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Trading</h3>
          <ul class="megamenu-links">
            <li><a href="/scanner" class="megamenu-link">Stock Scanner</a></li>
            <li><a href="/paper-trading" class="megamenu-link">Paper Trading</a></li>
            <li><a href="/copy-trading" class="megamenu-link">Copy Trading</a></li>
            <li><a href="/backtest" class="megamenu-link">Backtest</a></li>
            <li><a href="/optimizer" class="megamenu-link">Optimizer</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Planning</h3>
          <ul class="megamenu-links">
            <li><a href="/goals" class="megamenu-link">Goals</a></li>
            <li><a href="/rebalancer" class="megamenu-link">Rebalancer</a></li>
            <li><a href="/position-sizing" class="megamenu-link">Position Sizing</a></li>
            <li><a href="/calculators" class="megamenu-link">Calculators</a></li>
            <li><a href="/margin" class="megamenu-link">Margin Calculator</a></li>
            <li><a href="/real-estate" class="megamenu-link">Real Estate</a></li>
            <li><a href="/bonds" class="megamenu-link">Bonds</a></li>
          </ul>
          <h3 class="megamenu-column-title" style="margin-top: 1rem;">Tax</h3>
          <ul class="megamenu-links">
            <li><a href="/tax-dashboard" class="megamenu-link">Tax Dashboard</a></li>
            <li><a href="/tax-opportunities" class="megamenu-link">Harvest Opportunities</a></li>
            <li><a href="/tax-lots" class="megamenu-link">Tax Lots</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Alerts & Monitoring</h3>
          <ul class="megamenu-links">
            <li><a href="/alerts" class="megamenu-link">Price Alerts</a></li>
            <li><a href="/alerts-history" class="megamenu-link">Alert History</a></li>
            <li><a href="/currency" class="megamenu-link">Currency</a></li>
            <li><a href="/crypto-portfolio" class="megamenu-link">Crypto Portfolio</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">AI & Integrations</h3>
          <ul class="megamenu-links">
            <li><a href="/finance-assistant" class="megamenu-link megamenu-link-new">Finance Assistant <span class="megamenu-badge">NEW</span></a></li>
            <li><a href="/assistant" class="megamenu-link">AI Assistant</a></li>
            <li><a href="/broker" class="megamenu-link">Broker Connect</a></li>
            <li><a href="/api" class="megamenu-link">API Access</a></li>
            <li><a href="/templates" class="megamenu-link">Templates</a></li>
          </ul>
        </div>
      </div>
    `;
  }

  getResearchMenu() {
    return `
      <div class="megamenu-grid megamenu-grid-4">
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">News & Insights</h3>
          <ul class="megamenu-links">
            <li><a href="/news" class="megamenu-link">Market News</a></li>
            <li><a href="/reports" class="megamenu-link">AI Reports</a></li>
            <li><a href="/calendar" class="megamenu-link">Calendar</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Community</h3>
          <ul class="megamenu-links">
            <li><a href="/social" class="megamenu-link">Social Feed</a></li>
            <li><a href="/leaderboard" class="megamenu-link">Leaderboard</a></li>
            <li><a href="/forum" class="megamenu-link">Forum</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Learning</h3>
          <ul class="megamenu-links">
            <li><a href="/education" class="megamenu-link">Education Center</a></li>
          </ul>
        </div>
        <div class="megamenu-column">
          <h3 class="megamenu-column-title">Featured</h3>
          <div class="megamenu-featured">
            <div class="megamenu-featured-title">AI Market Analysis</div>
            <div class="megamenu-featured-desc">Get AI-powered insights on your portfolio</div>
            <a href="/assistant" class="megamenu-featured-link">Try AI Assistant &rarr;</a>
          </div>
        </div>
      </div>
    `;
  }

  // User Menu Dropdown
  initUserMenu() {
    const userBtn = document.querySelector('.topnav-user');
    const userDropdown = document.querySelector('.account-dropdown');

    if (!userBtn || !userDropdown) return;

    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topnav-user') && !e.target.closest('.account-dropdown')) {
        userDropdown.classList.remove('open');
      }
    });
  }

  // Mobile Menu
  initMobileMenu() {
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mobileOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileClose = document.querySelector('.mobile-menu-close');
    const menuSections = document.querySelectorAll('.mobile-menu-section');

    if (!mobileBtn || !mobileOverlay) return;

    // Toggle mobile menu
    mobileBtn.addEventListener('click', () => {
      mobileOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    // Close mobile menu
    const closeMobile = () => {
      mobileOverlay.classList.remove('open');
      document.body.style.overflow = '';
    };

    if (mobileClose) {
      mobileClose.addEventListener('click', closeMobile);
    }

    mobileOverlay.addEventListener('click', (e) => {
      if (e.target === mobileOverlay) {
        closeMobile();
      }
    });

    // Accordion sections
    menuSections.forEach(section => {
      const trigger = section.querySelector('.mobile-menu-trigger');
      if (trigger) {
        trigger.addEventListener('click', () => {
          // Close other sections
          menuSections.forEach(s => {
            if (s !== section) s.classList.remove('open');
          });
          // Toggle current section
          section.classList.toggle('open');
        });
      }
    });
  }

  // Search Shortcut (Ctrl+K / Cmd+K)
  initSearchShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // Open search modal or focus search input
        const searchBtn = document.querySelector('.topnav-search');
        if (searchBtn) {
          searchBtn.click();
        }
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.megaMenu = new MegaMenu();
});
