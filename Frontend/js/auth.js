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

  isEmailVerified() {
    return this.user && this.user.email_verified === true;
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

  requireEmailVerification(currentPage) {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }

     // Allow access to settings page for email update
    const allowedUnverifiedPages = ['settings.html', 'verify-email.html'];
    const pageName = window.location.pathname.split('/').pop();
    
    if (!this.isEmailVerified() && !allowedUnverifiedPages.includes(pageName)) {
      this.showEmailVerificationWarning();
      return false;
    }
    
    return true;
  }

  showEmailVerificationWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ffc107;
      color: #333;
      padding: 15px 20px;
      text-align: center;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    warning.innerHTML = `
      <strong>⚠️ Email Verification Required</strong>
      <p style="margin: 5px 0;">Please verify your email to access all features.</p>
      <button onclick="resendVerification()" style="
        background: #0e6253;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        margin: 5px;
      ">
        Resend Verification Email
      </button>
      <a href="/settings.html" style="
        background: white;
        color: #0e6253;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        text-decoration: none;
        display: inline-block;
        margin: 5px;
      ">
        Update Email Address
      </a>
    `;
    document.body.insertBefore(warning, document.body.firstChild);
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

// Global function for resending verification
async function resendVerification() {
  try {
    const response = await api.resendVerification();
    alert('Verification email sent! Please check your inbox.');
  } catch (error) {
    alert('Failed to resend verification email: ' + error.message);
  }
}

// Check authentication on protected pages
function checkAuth() {
  const protectedPages = [
    'dashboard.html', 'bills.html', 'wallet.html', 
    'notifications.html', 'orders-placed.html', 'contact.html',
    'vendor-dashboard.html'
  ];
  
  const currentPage = window.location.pathname.split('/').pop();
  
  if (protectedPages.includes(currentPage)) {
    auth.requireAuth();
    
    // Require email verification for non-settings pages
    if (currentPage !== 'settings.html') {
      auth.requireEmailVerification(currentPage);
    }
  }
}

document.addEventListener('DOMContentLoaded', checkAuth);
