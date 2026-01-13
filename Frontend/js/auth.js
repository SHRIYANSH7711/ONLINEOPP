// js/auth.js
class AuthManager {
  constructor() {
    this.loadUser();
    this.checkSessionExpiry();
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

  isEmailVerified() {
    return this.user && this.user.email_verified === true;
  }

  checkSessionExpiry() {
    const loginTime = localStorage.getItem('loginTime');
    if (!loginTime) return;
    
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    
    if (now - parseInt(loginTime) > twoHours) {
      console.log('Session expired after 2 hours');
      this.logout();
    }
  }

  async login(email, password) {
    const response = await api.login({ email, password });
    this.user = response.user;
    localStorage.setItem('loginTime', Date.now().toString());
    return response;
  }

  async signup(name, email, password, role, outletId) {
    const response = await api.signup({ 
      name, 
      email, 
      password, 
      role,
      outletId
    });
    this.user = response.user;
    localStorage.setItem('loginTime', Date.now().toString());
    return response;
  }

  logout() {
    this.user = null;
    api.logout();
    localStorage.removeItem('loginTime');
    window.location.href = '/login.html';
  }

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  // FIXED: Enhanced verification check that properly handles all cases
  requireEmailVerification() {
    const currentPage = window.location.pathname.split('/').pop();
    const publicPages = ['login.html', 'verify-email.html', 'forgot-password.html', 'reset-password.html', 'index.html', ''];
    
    // Allow public pages without any checks
    if (publicPages.includes(currentPage)) {
      return true;
    }
    
    // For protected pages, check authentication
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }

    // If authenticated but email not verified, redirect to verification
    if (!this.isEmailVerified()) {
      window.location.href = '/verify-email.html?status=pending';
      return false;
    }

    // All checks passed
    return true;
  }

  // FIXED: Better redirect logic for authenticated users
  redirectIfAuthenticated() {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Only redirect if on login/signup pages
    if (currentPage !== 'login.html' && currentPage !== 'index.html') {
      return false;
    }
    
    if (this.isAuthenticated()) {
      // If email not verified, go to verification page
      if (!this.isEmailVerified()) {
        window.location.href = '/verify-email.html?status=pending';
        return true;
      }
      
      // Email verified, go to appropriate dashboard
      const path = this.user.role === 'vendor' ? '/vendor-dashboard.html' : '/dashboard.html';
      window.location.href = path;
      return true;
    }
    return false;
  }
}

// Global instance
const auth = new AuthManager();

// Global function for resending verification
async function resendVerification() {
  try {
    const response = await api.resendVerification();
    alert('Verification email sent! Please check your inbox.');
  } catch (error) {
    alert('Failed to resend verification email: ' + error.message);
  }
}

// FIXED: Proper authentication check that doesn't cause loops
function checkAuth() {
  const currentPage = window.location.pathname.split('/').pop();
  const publicPages = ['login.html', 'verify-email.html', 'forgot-password.html', 'reset-password.html', 'index.html', ''];
  
  // Skip auth check on public pages
  if (publicPages.includes(currentPage)) {
    return;
  }

  // For all protected pages, enforce email verification
  if (!auth.requireEmailVerification()) {
    return; // Will redirect automatically
  }

  const user = auth.getCurrentUser();
  
  // Role-based routing (only after verification passes)
  if (user.role === 'vendor' && currentPage === 'dashboard.html') {
    window.location.href = '/vendor-dashboard.html';
    return;
  }
  
  if (user.role !== 'vendor' && currentPage === 'vendor-dashboard.html') {
    window.location.href = '/dashboard.html';
    return;
  }
}

document.addEventListener('DOMContentLoaded', checkAuth);