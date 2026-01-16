// js/realtime-update.js
class RealtimeUpdates {
    constructor() {
        this.pollInterval = null;
        this.lastMenuHash = null;
        this.lastOutletStatuses = new Map();
        this.lastOrderStatuses = new Map(); 
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
            // Check menu updates
            const response = await api.request('/menu-updates');
            
            if (response.hash !== this.lastMenuHash) {
                console.log('📡 Menu updates detected - reloading silently');
                this.lastMenuHash = response.hash;
                
                if (window.app && typeof window.app.loadMenuData === 'function') {
                    await window.app.loadMenuData();
                }
            }
            
            // Check outlet status changes
            response.outlets.forEach(outlet => {
                const prevStatus = this.lastOutletStatuses.get(outlet.id);
                if (prevStatus !== undefined && prevStatus !== outlet.is_online) {
                    console.log(`📡 ${outlet.outlet_name} is now ${outlet.is_online ? 'ONLINE' : 'OFFLINE'}`);
                }
                this.lastOutletStatuses.set(outlet.id, outlet.is_online);
            });

            // NEW: Check order status updates (for students/customers)
            await this.checkOrderUpdates();
            
        } catch (error) {
            if (error.message !== 'Failed to fetch') {
                console.error('Polling error:', error);
            }
        }
    }

    async checkOrderUpdates() {
        try {
            const user = auth.getCurrentUser();
            
            // Only check for customer/student users
            if (!user || user.role === 'vendor') return;

            const orders = await api.getOrders();
            
            orders.forEach(order => {
                const previousStatus = this.lastOrderStatuses.get(order.id);
                
                // If status changed, show notification
                if (previousStatus && previousStatus !== order.status) {
                    this.showOrderStatusNotification(order, previousStatus);
                }
                
                this.lastOrderStatuses.set(order.id, order.status);
            });
        } catch (error) {
            // Silent fail - don't spam console
        }
    }

    showOrderStatusNotification(order, previousStatus) {
        const statusMessages = {
            'confirmed': {
                title: '✅ Order Confirmed!',
                message: `Your order ${order.token} has been confirmed`,
                color: '#3498db'
            },
            'preparing': {
                title: '👨‍🍳 Order Being Prepared',
                message: `Your order ${order.token} is being prepared`,
                color: '#f39c12'
            },
            'ready': {
                title: '🎉 Order Ready!',
                message: `Your order ${order.token} is ready for pickup!`,
                color: '#00b894'
            },
            'completed': {
                title: '✅ Order Completed',
                message: `Order ${order.token} completed. Thank you!`,
                color: '#27ae60'
            }
        };

        const statusInfo = statusMessages[order.status];
        if (!statusInfo) return;

        // Show browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(statusInfo.title, {
                body: statusInfo.message,
                icon: '/images/logo.png', // Add your logo
                badge: '/images/badge.png'
            });
        }

        // Show in-page notification
        this.showInPageNotification(statusInfo.title, statusInfo.message, statusInfo.color);

        // Play sound (optional)
        this.playNotificationSound();
    }

    showInPageNotification(title, message, color) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 350px;
            animation: slideInRight 0.4s ease, fadeOut 0.4s ease 4.6s;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem;">
                ${title}
            </div>
            <div style="font-size: 0.9rem;">
                ${message}
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.4s ease';
            setTimeout(() => notification.remove(), 400);
        }, 5000);
    }

    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFApGn+DyvmwhBjWO1vPTgjMGI3fH8NyPQAoUXrTp66hVFA==');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {
            // Silent fail
        }
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

window.realtimeUpdates = new RealtimeUpdates();

// Request notification permission on load (for customer dashboard)
document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        // Wait a bit before asking for permission
        setTimeout(() => {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            });
        }, 5000);
    }
});