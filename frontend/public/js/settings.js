/**
 * Settings Page JavaScript
 * Handles all settings form submissions and API calls
 */

// Global fetch options with credentials
const fetchOptions = {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
};

// ============================================
// PROFILE TAB
// ============================================
async function saveProfile(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    const response = await fetch('/api/settings/profile', {
      ...fetchOptions,
      method: 'PUT',
      body: JSON.stringify({
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        phone: formData.get('phone'),
        timezone: formData.get('timezone'),
        theme: formData.get('theme')
      })
    });

    if (response.ok) {
      showToast('Profile updated successfully', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to update profile', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function resetForm() {
  document.getElementById('profile-form').reset();
}

function uploadAvatar() {
  document.getElementById('avatar-upload').click();
}

// Initialize profile form
document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', saveProfile);
  }

  const avatarUpload = document.getElementById('avatar-upload');
  if (avatarUpload) {
    avatarUpload.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      showToast('Avatar upload coming soon', 'info');
    });
  }
});

// ============================================
// PREFERENCES TAB
// ============================================
async function savePreferences(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    // Update user preferences (currency)
    await fetch('/api/settings/profile', {
      ...fetchOptions,
      method: 'PUT',
      body: JSON.stringify({
        currency: formData.get('currency')
      })
    });

    // Update settings
    const response = await fetch('/api/settings', {
      ...fetchOptions,
      method: 'PUT',
      body: JSON.stringify({
        defaultPortfolioId: formData.get('defaultPortfolioId') || null,
        dashboardLayout: formData.get('dashboardLayout')
      })
    });

    if (response.ok) {
      showToast('Preferences saved successfully', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to save preferences', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function resetPreferencesForm() {
  document.getElementById('preferences-form').reset();
}

// Initialize preferences form
document.addEventListener('DOMContentLoaded', () => {
  const preferencesForm = document.getElementById('preferences-form');
  if (preferencesForm) {
    preferencesForm.addEventListener('submit', savePreferences);
  }
});

// ============================================
// NOTIFICATIONS TAB
// ============================================
async function saveNotifications(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  try {
    const response = await fetch('/api/settings', {
      ...fetchOptions,
      method: 'PUT',
      body: JSON.stringify({
        emailNotifications: formData.get('emailNotifications') === 'on',
        pushNotifications: formData.get('pushNotifications') === 'on',
        alertsEnabled: true,
        priceAlerts: formData.get('priceAlerts') === 'on',
        dividendAlerts: formData.get('dividendAlerts') === 'on',
        earningsAlerts: formData.get('earningsAlerts') === 'on',
        weeklyReport: formData.get('weeklyReport') === 'on',
        monthlyReport: formData.get('monthlyReport') === 'on'
      })
    });

    if (response.ok) {
      showToast('Notification settings saved successfully', 'success');
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function resetNotificationsForm() {
  document.getElementById('notifications-form').reset();
}

// Initialize notifications form
document.addEventListener('DOMContentLoaded', () => {
  const notificationsForm = document.getElementById('notifications-form');
  if (notificationsForm) {
    notificationsForm.addEventListener('submit', saveNotifications);
  }
});

// ============================================
// API KEYS TAB
// ============================================
function showCreateApiKeyModal() {
  document.getElementById('create-api-key-modal').classList.remove('hidden');
}

function hideCreateApiKeyModal() {
  document.getElementById('create-api-key-modal').classList.add('hidden');
  document.getElementById('create-api-key-form').reset();
}

function hideShowApiKeyModal() {
  document.getElementById('show-api-key-modal').classList.add('hidden');
  window.location.reload();
}

async function toggleApiKey(keyId, isActive) {
  try {
    const response = await fetch(`/api/settings/api-keys/${keyId}`, {
      ...fetchOptions,
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });

    if (response.ok) {
      showToast(`API key ${isActive ? 'activated' : 'deactivated'}`, 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to update API key', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

async function deleteApiKey(keyId, keyName) {
  if (!confirm(`Are you sure you want to delete "${keyName}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/settings/api-keys/${keyId}`, {
      ...fetchOptions,
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('API key deleted', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to delete API key', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function copyApiKey() {
  const apiKey = document.getElementById('new-api-key').textContent;
  navigator.clipboard.writeText(apiKey).then(() => {
    showToast('API key copied to clipboard', 'success');
  });
}

// Initialize API keys form
document.addEventListener('DOMContentLoaded', () => {
  const createApiKeyForm = document.getElementById('create-api-key-form');
  if (createApiKeyForm) {
    createApiKeyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);

      try {
        const response = await fetch('/api/settings/api-keys', {
          ...fetchOptions,
          method: 'POST',
          body: JSON.stringify({
            name: formData.get('name'),
            expiresIn: formData.get('expiresIn') ? parseInt(formData.get('expiresIn')) : null
          })
        });

        const data = await response.json();

        if (response.ok) {
          hideCreateApiKeyModal();
          document.getElementById('new-api-key').textContent = data.apiKey;
          document.getElementById('show-api-key-modal').classList.remove('hidden');
        } else {
          showToast(data.error || 'Failed to create API key', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showToast('Network error', 'error');
      }
    });
  }
});

// ============================================
// SECURITY TAB
// ============================================
async function changePassword(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const newPassword = formData.get('newPassword');
  const confirmPassword = formData.get('confirmPassword');

  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const response = await fetch('/api/settings/password', {
      ...fetchOptions,
      method: 'POST',
      body: JSON.stringify({
        currentPassword: formData.get('currentPassword'),
        newPassword,
        confirmPassword
      })
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Password changed successfully', 'success');
      form.reset();
    } else {
      showToast(data.error || 'Failed to change password', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function resetPasswordForm() {
  document.getElementById('password-form').reset();
}

async function revokeSession(sessionId) {
  if (!confirm('Are you sure you want to revoke this session?')) {
    return;
  }

  try {
    const response = await fetch(`/api/settings/sessions/${sessionId}`, {
      ...fetchOptions,
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Session revoked', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to revoke session', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

async function revokeAllSessions() {
  if (!confirm('Are you sure you want to revoke all other sessions? You will remain logged in on this device.')) {
    return;
  }
  showToast('Revoke all sessions coming soon', 'info');
}

// Initialize security form
document.addEventListener('DOMContentLoaded', () => {
  const passwordForm = document.getElementById('password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', changePassword);
  }
});

// ============================================
// DATA & PRIVACY TAB
// ============================================
async function exportData() {
  try {
    const response = await fetch('/api/settings/export-data', {
      ...fetchOptions,
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();

      // Create a download link
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wealthpilot-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('Data exported successfully', 'success');
    } else {
      const data = await response.json();
      showToast(data.error || 'Failed to export data', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Network error', 'error');
  }
}

function showDeleteAccountModal() {
  document.getElementById('delete-account-modal').classList.remove('hidden');
}

function hideDeleteAccountModal() {
  document.getElementById('delete-account-modal').classList.add('hidden');
  document.getElementById('delete-account-form').reset();
}

// Initialize data & privacy form
document.addEventListener('DOMContentLoaded', () => {
  const deleteAccountForm = document.getElementById('delete-account-form');
  if (deleteAccountForm) {
    deleteAccountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);

      if (formData.get('confirmation') !== 'DELETE') {
        showToast('Please type DELETE to confirm', 'error');
        return;
      }

      try {
        const response = await fetch('/api/settings/account', {
          ...fetchOptions,
          method: 'DELETE',
          body: JSON.stringify({
            password: formData.get('password'),
            confirmation: formData.get('confirmation')
          })
        });

        if (response.ok) {
          showToast('Account deleted successfully. Redirecting...', 'success');
          setTimeout(() => window.location.href = '/logout', 2000);
        } else {
          const data = await response.json();
          showToast(data.error || 'Failed to delete account', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        showToast('Network error', 'error');
      }
    });
  }
});

// Make functions globally available
window.saveProfile = saveProfile;
window.resetForm = resetForm;
window.uploadAvatar = uploadAvatar;
window.savePreferences = savePreferences;
window.resetPreferencesForm = resetPreferencesForm;
window.saveNotifications = saveNotifications;
window.resetNotificationsForm = resetNotificationsForm;
window.showCreateApiKeyModal = showCreateApiKeyModal;
window.hideCreateApiKeyModal = hideCreateApiKeyModal;
window.hideShowApiKeyModal = hideShowApiKeyModal;
window.toggleApiKey = toggleApiKey;
window.deleteApiKey = deleteApiKey;
window.copyApiKey = copyApiKey;
window.changePassword = changePassword;
window.resetPasswordForm = resetPasswordForm;
window.revokeSession = revokeSession;
window.revokeAllSessions = revokeAllSessions;
window.exportData = exportData;
window.showDeleteAccountModal = showDeleteAccountModal;
window.hideDeleteAccountModal = hideDeleteAccountModal;
