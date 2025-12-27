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

  async signup(name, email, password, role, outletId) {
    const response = await api.signup({ 
    name, 
    email, 
    password, 
    role,
    outletId // Include outlet ID
    });
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
    // Check if warning already exists
    if (document.getElementById('email-verification-banner')) {
        return;
    }

    const warning = document.createElement('div');
    warning.id = 'email-verification-banner';
    warning.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ffc107, #ffb300);
        color: #333;
        padding: 15px 20px;
        text-align: center;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideDown 0.3s ease;
    `;
    warning.innerHTML = `
        <div style="max-width: 1200px; margin: 0 auto;">
            <strong style="font-size: 1.1rem;">⚠️ Email Verification Required</strong>
            <p style="margin: 8px 0 12px 0; font-size: 0.95rem;">
                Please verify your email to access all features. Check your inbox!
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="resendVerification()" style="
                    background: #0e6253;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.9rem;
                ">
                    📧 Resend Verification Email
                </button>
                <a href="/settings.html" style="
                    background: white;
                    color: #0e6253;
                    border: 2px solid #0e6253;
                    padding: 8px 18px;
                    border-radius: 8px;
                    text-decoration: none;
                    display: inline-block;
                    font-weight: 600;
                    font-size: 0.9rem;
                ">
                    ✉️ Update Email
                </a>
                <button onclick="document.getElementById('email-verification-banner').remove()" style="
                    background: transparent;
                    color: #333;
                    border: 2px solid #333;
                    padding: 8px 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.9rem;
                ">
                    ✕ Dismiss
                </button>
            </div>
        </div>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from {
                transform: translateY(-100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.insertBefore(warning, document.body.firstChild);

    // Add padding to body to prevent content overlap
    document.body.style.paddingTop = warning.offsetHeight + 'px';
    
    // Adjust for mobile
    window.addEventListener('resize', () => {
        const banner = document.getElementById('email-verification-banner');
        if (banner) {
            document.body.style.paddingTop = banner.offsetHeight + 'px';
        }
    });
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
  
  // Check if on a protected page
  if (protectedPages.includes(currentPage)) {
    // First check authentication
    if (!auth.isAuthenticated()) {
      window.location.href = '/login.html';
      return;
    }
    
    // Then check email verification
    const user = auth.getCurrentUser();
    if (!user.email_verified) {
      // Redirect to verification page with message
      window.location.href = '/verify-email.html?status=pending';
      return;
    }
  }
}

document.addEventListener('DOMContentLoaded', checkAuth);
