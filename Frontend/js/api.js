// js/api.js
class APIService {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('authToken');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  removeToken() {
    this.token = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('cart'); // Also clear cart
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        this.removeToken();
        
        // Don't redirect if we're already on login page
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = '/login.html';
        }
        
        throw new Error('Session expired. Please login again.');
      }

      // Handle 429 Too Many Requests
      if (response.status === 429) {
        throw new Error('Too many attempts. Please try again later.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      
      // Network errors
      if (error.message === 'Failed to fetch') {
        throw new Error('Network error. Please check your connection.');
      }
      
      throw error;
    }
  }

  // ==================== AUTH METHODS ====================

  async signup(userData) {
    const response = await this.request('/signup', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    
    if (response.token) {
      this.setToken(response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  }

  async login(credentials) {
    const response = await this.request('/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    
    if (response.token) {
      this.setToken(response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  }

  async logout() {
    this.removeToken();
  }

  // ==================== MENU METHODS ====================

  async getMenu() {
    return this.request('/menu');
  }

  // ==================== ORDER METHODS ====================

  async createOrder(orderData) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  }

  async getOrders() {
    return this.request('/orders');
  }

  // ==================== WALLET METHODS ====================

  async getWallet() {
    return this.request('/wallet');
  }

  async addMoney(amount) {
    return this.request('/wallet/add', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
  }

  // ==================== VENDOR METHODS ====================

  async getVendorOrders() {
    return this.request('/orders/vendor');
  }

  async updateOrderStatus(orderId, status) {
    return this.request(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async getVendorMenuItems() {
    return this.request('/menu/vendor');
  }

  async toggleMenuItemAvailability(itemId, isAvailable) {
    return this.request(`/menu/${itemId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ is_available: isAvailable })
    });
  }
  async addMenuItem(itemData) {
  return this.request('/menu', {
    method: 'POST',
    body: JSON.stringify(itemData)
  });
}

async updateMenuItem(itemId, itemData) {
  return this.request(`/menu/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(itemData)
  });
}

async deleteMenuItem(itemId) {
  return this.request(`/menu/${itemId}`, {
    method: 'DELETE'
  });
}

  // ==================== NOTIFICATION METHODS ====================

  async getNotifications() {
    return this.request('/notifications');
  }

  async markNotificationAsRead(notificationId) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PATCH'
    });
  }

  async markAllNotificationsAsRead() {
    return this.request('/notifications/mark-all-read', {
      method: 'PATCH'
    });
  }

  async getUnreadNotificationCount() {
    return this.request('/notifications/unread-count');
  }
}

// Create global instance
const api = new APIService();