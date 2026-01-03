// js/image-upload.js
// Create this NEW file in Frontend/js/

class ImageUploader {
  constructor() {
    // Cloudinary config - will be fetched from backend
    this.cloudName = null;
    this.uploadPreset = null;
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    this.initCloudinary();
  }

  async initCloudinary() {
    try {
      const config = await api.getCloudinaryConfig();
      this.cloudName = config.cloudName;
      this.uploadPreset = config.uploadPreset;
    } catch (error) {
      console.error('Failed to load Cloudinary config:', error);
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    if (!this.allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Invalid file type. Please upload JPG, PNG, WebP, or GIF images.' 
      };
    }

    if (file.size > this.maxFileSize) {
      return { 
        valid: false, 
        error: `File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB` 
      };
    }

    return { valid: true };
  }

  /**
   * Compress image before upload
   */
  async compressImage(file, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              resolve(new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              }));
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Upload image to Cloudinary
   */
  async uploadToCloudinary(file, onProgress) {
    if (!this.cloudName || !this.uploadPreset) {
      throw new Error('Cloudinary not configured. Please contact support.');
    }

    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Compress image
    const compressedFile = await this.compressImage(file);

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', 'cantech');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          resolve({
            url: response.secure_url,
            publicId: response.public_id,
            width: response.width,
            height: response.height,
            format: response.format
          });
        } else {
          reject(new Error('Upload failed: ' + xhr.statusText));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`);
      xhr.send(formData);
    });
  }

  /**
   * Get preview URL from file
   */
  getPreviewUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create file input and handle selection
   */
  selectFile(accept = 'image/*') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          resolve(file);
        } else {
          reject(new Error('No file selected'));
        }
      };
      
      input.click();
    });
  }
}

// Global instance
const imageUploader = new ImageUploader();