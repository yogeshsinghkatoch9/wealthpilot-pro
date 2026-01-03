/**
 * Push Notifications Manager
 * Handles service worker registration, permission requests, and subscription management
 */

class PushNotificationManager {
  constructor() {
    this.swRegistration = null;
    this.isSubscribed = false;
    this.vapidPublicKey = null;
  }

  /**
   * Initialize push notification support
   */
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      // Register service worker
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');

      // Get VAPID public key
      await this.getVapidKey();

      // Check current subscription status
      const subscription = await this.swRegistration.pushManager.getSubscription();
      this.isSubscribed = subscription !== null;

      return true;
    } catch (error) {
      console.error('Push notification init failed:', error);
      return false;
    }
  }

  /**
   * Get VAPID public key from server
   */
  async getVapidKey() {
    try {
      const response = await fetch('/api/notifications/vapid-key');
      const data = await response.json();
      this.vapidPublicKey = data.publicKey;
    } catch (error) {
      console.error('Failed to get VAPID key:', error);
    }
  }

  /**
   * Check if notifications are supported
   */
  isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  /**
   * Check current permission status
   */
  getPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Request notification permission
   */
  async requestPermission() {
    const permission = await Notification.requestPermission();
    return permission;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe() {
    if (!this.swRegistration) {
      await this.init();
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    try {
      // Subscribe to push
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subscription })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      this.isSubscribed = true;

      // Show success toast
      if (window.toast) {
        window.toast.success('Push notifications enabled!');
      }

      return subscription;
    } catch (error) {
      console.error('Subscribe failed:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    if (!this.swRegistration) {
      await this.init();
    }

    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe locally
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/notifications/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
      }

      this.isSubscribed = false;

      // Show success toast
      if (window.toast) {
        window.toast.info('Push notifications disabled');
      }

      return true;
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      throw error;
    }
  }

  /**
   * Toggle push notification subscription
   */
  async toggle() {
    if (this.isSubscribed) {
      return this.unsubscribe();
    } else {
      return this.subscribe();
    }
  }

  /**
   * Send test notification
   */
  async sendTest() {
    try {
      const response = await fetch('/api/notifications/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        if (window.toast) {
          window.toast.success('Test notification sent!');
        }
      } else {
        if (window.toast) {
          window.toast.error(data.error || 'Failed to send test notification');
        }
      }

      return data;
    } catch (error) {
      console.error('Test notification failed:', error);
      throw error;
    }
  }

  /**
   * Get subscription status
   */
  async getStatus() {
    if (!this.swRegistration) {
      await this.init();
    }

    const subscription = await this.swRegistration?.pushManager?.getSubscription();

    return {
      supported: this.isSupported(),
      permission: this.getPermissionStatus(),
      subscribed: subscription !== null,
      subscription: subscription
    };
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Create notification permission UI
   */
  createPermissionUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const status = this.getPermissionStatus();

    let html = '';

    switch (status) {
      case 'unsupported':
        html = `
          <div class="notification-permission-card notification-permission--unsupported">
            <div class="notification-permission-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <div class="notification-permission-content">
              <h3>Notifications Not Supported</h3>
              <p>Your browser doesn't support push notifications.</p>
            </div>
          </div>
        `;
        break;

      case 'denied':
        html = `
          <div class="notification-permission-card notification-permission--denied">
            <div class="notification-permission-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </div>
            <div class="notification-permission-content">
              <h3>Notifications Blocked</h3>
              <p>Please enable notifications in your browser settings.</p>
            </div>
          </div>
        `;
        break;

      case 'granted':
        html = `
          <div class="notification-permission-card notification-permission--enabled">
            <div class="notification-permission-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div class="notification-permission-content">
              <h3>Notifications Enabled</h3>
              <p>You'll receive alerts for price changes, dividends, and more.</p>
            </div>
            <div class="notification-permission-actions">
              <button class="btn btn-secondary btn-sm" onclick="pushNotifications.sendTest()">
                Send Test
              </button>
              <button class="btn btn-ghost btn-sm" onclick="pushNotifications.unsubscribe().then(() => pushNotifications.createPermissionUI('${containerId}'))">
                Disable
              </button>
            </div>
          </div>
        `;
        break;

      default:
        html = `
          <div class="notification-permission-card notification-permission--prompt">
            <div class="notification-permission-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div class="notification-permission-content">
              <h3>Enable Push Notifications</h3>
              <p>Get instant alerts for price changes, dividends, earnings, and portfolio updates.</p>
            </div>
            <div class="notification-permission-actions">
              <button class="btn btn-primary btn-sm" onclick="pushNotifications.subscribe().then(() => pushNotifications.createPermissionUI('${containerId}')).catch(e => console.error(e))">
                Enable Notifications
              </button>
            </div>
          </div>
        `;
    }

    container.innerHTML = html;
  }
}

// Global instance
window.pushNotifications = new PushNotificationManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.pushNotifications.init();
});
