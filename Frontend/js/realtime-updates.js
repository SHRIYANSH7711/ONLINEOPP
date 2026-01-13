// js/realtime-update.js
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
    console.log('🔄 Real-time updates enabled (silent mode)');
    
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
        console.log('📡 Menu updates detected - reloading silently');
        this.lastMenuHash = response.hash;
        
        // SILENT UPDATE - NO NOTIFICATION
        if (window.app && typeof window.app.loadMenuData === 'function') {
          await window.app.loadMenuData();
        }
      }
      
      // Check outlet status changes (also silent)
      response.outlets.forEach(outlet => {
        const prevStatus = this.lastOutletStatuses.get(outlet.id);
        if (prevStatus !== undefined && prevStatus !== outlet.is_online) {
          console.log(`📡 ${outlet.outlet_name} is now ${outlet.is_online ? 'ONLINE' : 'OFFLINE'}`);
          // No notification - just log it
        }
        this.lastOutletStatuses.set(outlet.id, outlet.is_online);
      });
      
    } catch (error) {
      // Silent error handling - don't spam console
      if (error.message !== 'Failed to fetch') {
        console.error('Polling error:', error);
      }
    }
  }
}

window.realtimeUpdates = new RealtimeUpdates();