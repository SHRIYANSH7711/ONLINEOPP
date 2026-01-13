// Frontend/js/realtime-updates.js
class RealtimeUpdates {
  constructor() {
    this.pollInterval = null;
    this.lastMenuHash = null;
    this.lastOutletStatuses = new Map();
    this.isPolling = false;
  }

  startPolling(interval = 5000) {
    if (this.isPolling) return;
    
    this.isPolling = true;
    console.log('🔄 Real-time updates enabled');
    
    this.checkForUpdates();
    
    this.pollInterval = setInterval(() => {
      this.checkForUpdates();
    }, interval);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.isPolling = false;
    }
  }

  async checkForUpdates() {
    try {
      const response = await api.request('/menu-updates');
      
      if (response.hash !== this.lastMenuHash) {
        console.log('📡 Menu updates detected!');
        this.lastMenuHash = response.hash;
        
        if (window.app && typeof window.app.loadMenuData === 'function') {
          await window.app.loadMenuData();
          this.showUpdateNotification('Menu updated! New items or changes available.');
        }
      }
      
      response.outlets.forEach(outlet => {
        const prevStatus = this.lastOutletStatuses.get(outlet.id);
        if (prevStatus !== undefined && prevStatus !== outlet.is_online) {
          const statusText = outlet.is_online ? 'is now ONLINE 🟢' : 'is now OFFLINE 🔴';
          this.showUpdateNotification(`${outlet.outlet_name} ${statusText}`);
        }
        this.lastOutletStatuses.set(outlet.id, outlet.is_online);
      });
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }

  showUpdateNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #0e6253, #00b894);
      color: white;
      padding: 15px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(14, 98, 83, 0.4);
      z-index: 10000;
      animation: slideInRight 0.4s ease;
      max-width: 350px;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    
    notification.innerHTML = `
      <ion-icon name="sync-circle-outline" style="font-size: 24px;"></ion-icon>
      <div>
        <strong style="display: block; margin-bottom: 4px;">Update Available</strong>
        <span style="font-size: 14px; opacity: 0.9;">${message}</span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.4s ease';
      setTimeout(() => notification.remove(), 400);
    }, 5000);
  }
}

window.realtimeUpdates = new RealtimeUpdates();