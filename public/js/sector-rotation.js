/**
 * Sector Rotation Interactive Dashboard
 * Handles interactivity for the tabbed interface
 */

class SectorRotationDashboard {
  constructor() {
    this.init();
  }

  init() {
    console.log('Sector Rotation Dashboard initialized');
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to interactive elements
   */
  attachEventListeners() {
    // Handle sector row clicks for additional info
    const sectorRows = document.querySelectorAll('.sector-row');
    sectorRows.forEach(row => {
      row.addEventListener('click', (e) => {
        // Visual feedback
        row.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        setTimeout(() => {
          row.style.backgroundColor = '';
        }, 200);
      });
    });

    // Handle rotation pair hover effects
    const rotationCards = document.querySelectorAll('[class*="rotation-pair"]');
    rotationCards.forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'scale(1.02)';
        card.style.transition = 'all 0.2s ease';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'scale(1)';
      });
    });
  }

  /**
   * Refresh data
   */
  refresh() {
    window.location.reload();
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sectorRotationDashboard = new SectorRotationDashboard();
});
