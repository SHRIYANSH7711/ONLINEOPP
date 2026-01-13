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

  //Enhanced verification check that blocks access completely
  requireEmailVerification() {
    const currentPage = window.location.pathname.split('/').pop();
    const allowedUnverifiedPages = ['login.html', 'verify-email.html', 'forgot-password.html', 'reset-password.html', 'index.html'];
    
    // If not authenticated at all, redirect to login
    if (!this.isAuthenticated()) {
      if (!allowedUnverifiedPages.includes(currentPage)) {
        window.location.href = '/login.html';
        return false;
      }
      return true;
    }

    // If authenticated but email not verified
    if (!this.isEmailVerified()) {
      // Only allow access to verification page
      if (currentPage !== 'verify-email.html') {
        // Redirect to verification page with pending status
        window.location.href = '/verify-email.html?status=pending';
        return false;
      }
      return true;
    }

    // Email is verified, allow access
    return true;
  }
  // Users will be completely blocked instead of just warned

  redirectIfAuthenticated() {
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

// UPDATED: Enhanced authentication check with COMPLETE email verification enforcement
function checkAuth() {
  const currentPage = window.location.pathname.split('/').pop();
  const publicPages = ['login.html', 'verify-email.html', 'forgot-password.html', 'reset-password.html', 'index.html'];
  
  // Skip auth check on public pages
  if (publicPages.includes(currentPage)) {
    return;
  }

  // For all other pages, require both authentication AND email verification
  if (!auth.requireEmailVerification()) {
    return; // Will redirect automatically
  }

  const user = auth.getCurrentUser();
  
  // Role-based routing
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