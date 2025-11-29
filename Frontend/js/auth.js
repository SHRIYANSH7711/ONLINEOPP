// js/auth.js
class AuthManager {
  constructor() {
    this.user = null;
    this.loadUser();
  }

  loadUser() {
    const userData = localStorage.getItem('user');
    if (userData) {
      this.user = JSON.parse(userData);
    }
  }

  getCurrentUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!this.user && !!localStorage.getItem('authToken');
  }

  async login(email, password) {
    try {
      const response = await api.login({ email, password });
      this.user = response.user;
      return response;
    } catch (error) {
      throw error;
    }
  }

 async signup(name, email, password, role) {
    try {
        const response = await api.signup({ name, email, password, role });
        this.user = response.user;
        return response;
    } catch (error) {
        throw error;
    }
}

  logout() {
    this.user = null;
    api.logout();
    window.location.href = '/login.html';
  }

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

 redirectIfAuthenticated() {
    if (this.isAuthenticated()) {
        const user = this.getCurrentUser();
        if (user.role === 'vendor') {
            window.location.href = '/vendor-dashboard.html';
        } else {
            window.location.href = '/dashboard.html';
        }
        return true;
    }
    return false;
}
}

// Create global instance
const auth = new AuthManager();

// Check authentication on protected pages
function checkAuth() {
  const protectedPages = ['dashboard.html', 'bills.html', 'wallet.html', 'notifications.html'];
  const currentPage = window.location.pathname.split('/').pop();
  
  if (protectedPages.includes(currentPage)) {
    auth.requireAuth();
  }
}

// Run auth check when DOM is loaded
document.addEventListener('DOMContentLoaded', checkAuth);