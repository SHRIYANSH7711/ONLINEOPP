// js/image-loader.js

class ImageLoader {
  constructor() {
    this.cache = new Map();
    this.loadingImages = new Set();
  }

  /**
   * Get initials from outlet name (smart extraction)
   */
  getOutletInitial(outletName) {
    if (!outletName) return '?';
    
    // Special cases for multi-word names
    const name = outletName.trim();
    
    // Check if it's an acronym (all caps, like "CHE")
    if (name === name.toUpperCase() && name.length <= 4) {
      return name;
    }
    
    // Check if starts with number (like "Cafe 2004")
    const words = name.split(/\s+/);
    if (words.length > 1 && /^\d+$/.test(words[1])) {
      // Return first word + number (e.g., "C04" for "Cafe 2004")
      return words[0].charAt(0).toUpperCase() + words[1].slice(-2);
    }
    
    // For regular multi-word names, take first letter of each significant word
    const significantWords = words.filter(w => w.length > 2 && !/^(the|and|of)$/i.test(w));
    if (significantWords.length >= 2) {
      return significantWords.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
    }
    
    // Default: first letter
    return name.charAt(0).toUpperCase();
  }

  /**
   * Get optimized image HTML with smooth loading
   */
  getImageHTML(imageUrl, altText, className = 'item-img', placeholderIcon = '🍽️') {
    const hasValidImage = imageUrl && this.isValidImageUrl(imageUrl);
    const imageId = `img-${Math.random().toString(36).substr(2, 9)}`;

    if (hasValidImage) {
      return `
        <div class="image-container" data-image-id="${imageId}">
          <div class="image-placeholder-skeleton ${className}-skeleton active">
            <div class="skeleton-shimmer"></div>
            <span class="skeleton-icon">${placeholderIcon}</span>
          </div>
          <img 
            class="${className}" 
            data-src="${imageUrl}"
            alt="${altText}"
            style="display: none;"
            loading="lazy"
            onload="imageLoader.handleImageLoad(this)"
            onerror="imageLoader.handleImageError(this, '${placeholderIcon}')"
          >
        </div>
      `;
    } else {
      return `
        <div class="image-placeholder ${className}-placeholder">
          <span class="placeholder-icon">${placeholderIcon}</span>
          <span class="no-image-text">${altText}</span>
        </div>
      `;
    }
  }

  /**
   * Get vendor profile image HTML with smart initials
   */
  getVendorImageHTML(profileImage, outletName) {
    const initial = this.getOutletInitial(outletName);
    const hasValidImage = profileImage && this.isValidImageUrl(profileImage);
    
    if (hasValidImage) {
      return `
        <div class="vendor-image-container">
          <div class="vendor-placeholder-skeleton active">
            <div class="skeleton-shimmer"></div>
            <span class="vendor-initial">${initial}</span>
          </div>
          <img 
            class="vendor-profile-img" 
            data-src="${profileImage}"
            alt="${outletName}"
            style="display: none;"
            loading="lazy"
            onload="imageLoader.handleImageLoad(this)"
            onerror="imageLoader.handleVendorImageError(this, '${initial}')"
          >
        </div>
      `;
    } else {
      return `
        <div class="vendor-profile-placeholder">
          <span class="vendor-initial">${initial}</span>
        </div>
      `;
    }
  }

  /**
   * Initialize lazy loading for all images on page
   */
  initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            this.loadImage(img);
            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px'
      });

      images.forEach(img => imageObserver.observe(img));
    } else {
      images.forEach(img => this.loadImage(img));
    }
  }

  loadImage(img) {
    const src = img.getAttribute('data-src');
    if (!src || this.loadingImages.has(src)) return;

    this.loadingImages.add(src);
    img.src = src;
  }

  handleImageLoad(img) {
    const container = img.closest('.image-container, .vendor-image-container');
    if (container) {
      const skeleton = container.querySelector('.image-placeholder-skeleton, .vendor-placeholder-skeleton');
      if (skeleton) {
        skeleton.classList.remove('active');
        setTimeout(() => skeleton.remove(), 300);
      }
    }
    
    img.style.display = 'block';
    img.classList.add('image-loaded');
    this.loadingImages.delete(img.src);
  }

  handleImageError(img, placeholderIcon = '🍽️') {
    const container = img.closest('.image-container');
    if (container) {
      const altText = img.alt || 'Item';
      container.innerHTML = `
        <div class="image-placeholder ${img.className}-placeholder">
          <span class="placeholder-icon">${placeholderIcon}</span>
          <span class="no-image-text">${altText}</span>
        </div>
      `;
    }
    this.loadingImages.delete(img.getAttribute('data-src'));
  }

  handleVendorImageError(img, initial) {
    const container = img.closest('.vendor-image-container');
    if (container) {
      container.innerHTML = `
        <div class="vendor-profile-placeholder">
          <span class="vendor-initial">${initial}</span>
        </div>
      `;
    }
  }

  isValidImageUrl(url) {
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

// Create global instance
const imageLoader = new ImageLoader();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  imageLoader.initLazyLoading();
});

// Re-initialize when new content is added
const observer = new MutationObserver(() => {
  imageLoader.initLazyLoading();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});