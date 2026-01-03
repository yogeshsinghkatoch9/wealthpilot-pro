/**
 * Portfolio Management Fix
 * Ensures modals work and adds better error handling
 * Uses credentials: 'include' for httpOnly cookie authentication
 */

console.log('Portfolio Fix Script Loaded');

// Override openModal to add debugging
if (typeof openModal === 'undefined') {
  window.openModal = function(id) {
    console.log('Opening modal:', id);
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      console.error('Modal not found:', id);
    }
  };

  window.closeModal = function(id) {
    console.log('Closing modal:', id);
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      document.body.style.overflow = '';
    } else {
      console.error('Modal not found:', id);
    }
  };
}

// Add click handler to the ADD PORTFOLIO button as backup
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, setting up portfolio form handlers');

  // Find the create portfolio button
  const createBtn = document.querySelector('[onclick*="createModal"]');
  if (createBtn) {
    console.log('Found create portfolio button');
    // Add backup click handler
    createBtn.addEventListener('click', function(e) {
      console.log('Create portfolio button clicked');
      e.preventDefault();
      openModal('createModal');
    });
  } else {
    console.error('Create portfolio button not found');
  }

  // Test modal exists
  const createModal = document.getElementById('createModal');
  if (createModal) {
    console.log('Create modal found in DOM');
  } else {
    console.error('Create modal NOT found in DOM');
  }

  // Enhanced form submission handler
  const createForm = document.querySelector('#createModal form');
  if (createForm) {
    console.log('Create form found');

    createForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      console.log('Form submitted');

      const formData = new FormData(createForm);
      const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        portfolio_type: formData.get('portfolio_type')
      };

      console.log('Form data:', data);

      if (!data.name) {
        alert('Portfolio name is required');
        return;
      }

      try {
        console.log('Sending request to /api/portfolios');

        // Use credentials: 'include' to send httpOnly cookies
        const response = await fetch('/api/portfolios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(data)
        });

        console.log('Response status:', response.status);

        // Handle 401 Unauthorized
        if (response.status === 401) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
          return;
        }

        const result = await response.json();
        console.log('Response data:', result);

        if (!response.ok) {
          throw new Error(result.error || result.message || 'Failed to create portfolio');
        }

        console.log('Portfolio created successfully!');
        alert('Portfolio created successfully!');
        closeModal('createModal');
        window.location.reload();

      } catch (error) {
        console.error('Error creating portfolio:', error);
        alert('Error creating portfolio: ' + error.message);
      }
    });
  } else {
    console.error('Create form not found');
  }
});

// Helper function to get cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Test modal opening after a short delay
setTimeout(function() {
  console.log('Running modal test...');
  const modal = document.getElementById('createModal');
  if (modal) {
    console.log('Modal element exists');
    console.log('Modal classes:', modal.className);
    console.log('Modal display style:', window.getComputedStyle(modal).display);
  } else {
    console.log('Modal element NOT found');
  }
}, 1000);
