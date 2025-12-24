// js/auth.js
class AuthManager {
  constructor() {
    this.loadUser();
  }

  loadUser() {
    const userData = localStorage.getItem('user');
    this.user = userData ? JSON.parse(userData) : null;
  }

  getCurrentUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!this.user && !!localStorage.getItem('authToken');
  }

  async login(email, password) {
    const response = await api.login({ email, password });
    this.user = response.user;
    return response;
  }

  async signup(name, email, password, role) {
    const response = await api.signup({ name, email, password, role });
    this.user = response.user;
    return response;
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
      const path = this.user.role === 'vendor' ? '/vendor-dashboard.html' : '/dashboard.html';
      window.location.href = path;
      return true;
    }
    return false;
  }
}

// Global instance
const auth = new AuthManager();

// Check authentication on protected pages
function checkAuth() {
  const protectedPages = ['dashboard.html', 'bills.html', 'wallet.html', 'notifications.html'];
  if (protectedPages.includes(window.location.pathname.split('/').pop())) {
    auth.requireAuth();
  }
}

document.addEventListener('DOMContentLoaded', checkAuth);