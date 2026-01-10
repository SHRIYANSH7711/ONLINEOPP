// js/app.js
class CanTechApp {
    constructor() {
        this.cart = [];
        this.menuItems = [];
        this.outlets = [];
        this.bookmarks = [];
        this.paymentProcessor = new RealPaymentProcessor(this);
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadBookmarks();
        await this.loadUserData();
        await this.loadMenuData();
        this.setupSearch();
        this.setupScrolling();
        this.setupProfileDropdown();
        this.setupStickyNavbar();
    }

    setupEventListeners() {
        const menuToggle = document.querySelector('.menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                menuToggle.classList.toggle('is-active');
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
                document.body.classList.toggle('menu-open');
            });

            overlay.addEventListener('click', () => {
                menuToggle.classList.remove('is-active');
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('menu-open');
            });

            const sidebarLinks = sidebar.querySelectorAll('a');
            sidebarLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        menuToggle.classList.remove('is-active');
                        sidebar.classList.remove('active');
                        overlay.classList.remove('active');
                        document.body.classList.remove('menu-open');
                    }
                });
            });
        }

        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.checkout());
        }
    }

    setupProfileDropdown() {
        const profileIcon = document.querySelector('.user');
        if (!profileIcon) return;
        
        //Check if dropdown already exists to prevent duplicates
        let dropdown = profileIcon.parentElement.querySelector('.profile-dropdown');
        
        if (dropdown) {
            dropdown.remove(); // Remove existing to prevent duplicates
        }
        
        dropdown = document.createElement('div');
        dropdown.className = 'profile-dropdown';
        dropdown.innerHTML = `
        <div class="profile-info">
        <div class="profile-avatar">${this.getInitials()}</div>
        <div class="profile-details">
        <strong id="dropdown-name">Loading...</strong>
        <small id="dropdown-email">Loading...</small>
        </div>
        </div>
        <div class="profile-menu">
        <a href="settings.html" class="profile-menu-item">
        <ion-icon name="settings-outline"></ion-icon>
        Settings
        </a>
        <a href="#" onclick="auth.logout(); return false;" class="profile-menu-item">
        <ion-icon name="log-out-outline"></ion-icon>
        Logout
        </a>
        </div>
        `;
        
        profileIcon.parentElement.style.position = 'relative';
        profileIcon.parentElement.appendChild(dropdown);
        
        //Prevent duplicate event listeners
        profileIcon.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
            
            const user = auth.getCurrentUser();
            if (user) {
                const nameEl = dropdown.querySelector('#dropdown-name');
                const emailEl = dropdown.querySelector('#dropdown-email');
                if (nameEl) nameEl.textContent = user.name;
                if (emailEl) emailEl.textContent = user.email;
            }
        };
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileIcon.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });
    }

    getInitials() {
        const user = auth.getCurrentUser();
        if (user && user.name) {
            return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        return 'U';
    }

    getImageHTML(imageUrl, itemName, className = 'detail-img') {
        if (imageUrl && imageUrl !== 'images/food/default.jpg') {
            return `
                <img class="${className}" 
                     src="${imageUrl}" 
                     alt="${itemName}" 
                     loading="lazy"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="image-placeholder" style="display: none;">
                    🍽️
                    <span class="no-image-text">${itemName}</span>
                </div>
            `;
        } else {
            return `
                <div class="image-placeholder">
                    🍽️
                    <span class="no-image-text">${itemName}</span>
                </div>
            `;
        }
    }

    async loadUserData() {
        try {
            const user = auth.getCurrentUser();
            if (user) {
                const userNameEl = document.getElementById('user-name');
                if (userNameEl) {
                    userNameEl.textContent = user.name;
                }
            }

            await this.updateWalletBalance();
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async updateWalletBalance() {
        try {
            const walletData = await api.getWallet();
            const balanceEl = document.getElementById('wallet-balance');
            if (balanceEl) {
                balanceEl.textContent = parseFloat(walletData.balance).toFixed(2);
            }
        } catch (error) {
            console.error('Error updating wallet balance:', error);
        }
    }

    async loadMenuData() {
        try {
            this.showLoading(true);
            const menuData = await api.getMenu();
            this.menuItems = menuData;
            
            this.outlets = [...new Set(menuData.map(item => item.outlet_name))];
            
            this.renderOutlets();
            this.renderPopularItems();
            this.renderAllMenuItems();
        } catch (error) {
            console.error('Error loading menu:', error);
            this.showError('Failed to load menu items');
        } finally {
            this.showLoading(false);
        }
    }

    loadBookmarks() {
        const savedBookmarks = localStorage.getItem('bookmarks');
        if (savedBookmarks) {
            this.bookmarks = JSON.parse(savedBookmarks);
        }
        this.updateBookmarkCount();
    }
    
    saveBookmarks() {
        localStorage.setItem('bookmarks', JSON.stringify(this.bookmarks));
    }
    
    toggleBookmark(menuItemId, event) {
        if (event) {
            event.stopPropagation();
        }
        
        const itemIndex = this.bookmarks.findIndex(b => b === menuItemId);
        
        if (itemIndex > -1) {
            this.bookmarks.splice(itemIndex, 1);
            this.showNotification('Removed from bookmarks');
        } else {
            this.bookmarks.push(menuItemId);
            this.showNotification('Added to bookmarks!');
        }
        
        this.saveBookmarks();
        this.updateBookmarkCount();
        this.updateBookmarkIcons();
    }
    
    updateBookmarkCount() {
        const bookmarkCountEl = document.getElementById('bookmark-count');
        if (bookmarkCountEl) {
            bookmarkCountEl.textContent = this.bookmarks.length;
        }
    }
    
    updateBookmarkIcons() {
        document.querySelectorAll('.detail-favorites').forEach(icon => {
            const itemId = parseInt(icon.dataset.itemId);
            if (this.bookmarks.includes(itemId)) {
                icon.name = 'bookmark';
                icon.style.color = '#ffc107';
            } else {
                icon.name = 'bookmark-outline';
                icon.style.color = '#e74c3c';
            }
        });
    }
    
    displayBookmarks() {
        const bookmarkList = document.getElementById('bookmark-list');
        if (!bookmarkList) return;
        
        if (this.bookmarks.length === 0) {
            bookmarkList.innerHTML = `
            <div class="empty-bookmarks">
                <ion-icon name="bookmark-outline"></ion-icon>
                <h3>No Bookmarks Yet</h3>
                <p>Save your favorite items here!</p>
            </div>
            `;
            return;
        }
        
        const bookmarkedItems = this.menuItems.filter(item => 
            this.bookmarks.includes(item.id)
        );
        
        bookmarkList.innerHTML = bookmarkedItems.map(item => `
            <div class="bookmark-item">
            ${this.getImageHTML(item.image_url, item.name, 'bookmark-img')}
            <div class="bookmark-info">
                <div class="bookmark-name">${item.name}</div>
                <div class="bookmark-outlet">${item.outlet_name}</div>
                <div class="bookmark-price">₹${parseFloat(item.price).toFixed(2)}</div>
            </div>
            <div class="bookmark-actions">
                <button class="bookmark-add-cart" onclick="app.addToCart(${item.id}); return false;">
                    Add to Cart
                </button>
                <button class="bookmark-remove" onclick="app.toggleBookmark(${item.id}); app.displayBookmarks(); return false;">
                    Remove
                </button>
            </div>
        </div>
        `).join('');
    }

    toggleBookmarkPopup() {
        const bookmarkPopup = document.getElementById('bookmark-popup');
        if (bookmarkPopup) {
            const isActive = bookmarkPopup.classList.contains('active');
            
            if (isActive) {
                bookmarkPopup.classList.remove('active');
            } else {
                bookmarkPopup.classList.add('active');
                this.displayBookmarks();
            }
        }
    }
    
    closeBookmarkPopup() {
        const bookmarkPopup = document.getElementById('bookmark-popup');
        if (bookmarkPopup) {
            bookmarkPopup.classList.remove('active');
        }
    }

    renderOutlets() {
        const container = document.getElementById('outlets-container');
        if (!container) return;

        const outletsHTML = this.outlets.map(outlet => {
            const initial = outlet.charAt(0).toUpperCase();
            return `
                <div class="filter-card" onclick="app.filterByOutlet('${outlet}')">
                    <div class="filter-icon">
                        <div class="image-placeholder filter-img-placeholder">
                            ${initial}
                        </div>
                    </div>
                    <p>${outlet}</p>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="filter-card" onclick="app.filterByOutlet('All')">
                <div class="filter-icon">
                    <div class="image-placeholder filter-img-placeholder">
                        All
                    </div>
                </div>
                <p>All</p>
            </div>
            ${outletsHTML}
        `;
    }

    renderPopularItems() {
        const container = document.getElementById('popular-items');
        if (!container) return;
        
        const popularItems = this.menuItems.slice(0, 4);
        
        const popularHTML = popularItems.map(item => `
            <div class="highlight-card" onclick="app.addToCart(${item.id})">
                ${this.getImageHTML(item.image_url, item.name, 'highlight-img')}
                <div class="highlight-desc">
                    <h4>${item.name}</h4>
                    <p style="color: #7f8c8d; font-weight: 500;">${item.outlet_name}</p>
                    <p style="font-size: 1.15rem; font-weight: 700; color: #0e6253;">₹${parseFloat(item.price).toFixed(2)}</p>
                    <button class="add-to-cart-btn" onclick="event.stopPropagation(); app.addToCart(${item.id})">
                        Add to Cart
                    </button>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = popularHTML;
    }

    renderAllMenuItems(filterOutlet = 'All') {
        const container = document.getElementById('menu');
        if (!container) return;
        
        let itemsToShow = this.menuItems;
        if (filterOutlet !== 'All') {
            itemsToShow = this.menuItems.filter(item => item.outlet_name === filterOutlet);
        }
        
        const menuHTML = itemsToShow.map(item => {
            const isBookmarked = this.bookmarks.includes(item.id);
            return `
            <div class="detail-card" data-category="${item.outlet_name}">
            ${this.getImageHTML(item.image_url, item.name, 'detail-img')}
            <div class="detail-desc">
            <div class="detail-name">
            <h4>${item.name}</h4>
            <p class="detail-sub">${item.outlet_name}</p>
            <p class="price">₹${parseFloat(item.price).toFixed(2)}</p>
            <button class="add-to-cart-btn" onclick="event.stopPropagation(); app.addToCart(${item.id})">
            Add To Cart
            </button>
            </div>
            <ion-icon 
            class="detail-favorites" 
            name="${isBookmarked ? 'bookmark' : 'bookmark-outline'}"
            data-item-id="${item.id}"
            style="color: ${isBookmarked ? '#ffc107' : '#e74c3c'}"
            onclick="event.stopPropagation(); app.toggleBookmark(${item.id}, event)">
            </ion-icon>
            </div>
            </div>
            `;
        }).join('');
        
        container.innerHTML = menuHTML;
    }

    filterByOutlet(outlet) {
        this.renderAllMenuItems(outlet);
        
        const titleEl = document.querySelector('.main-detail .main-title');
        if (titleEl) {
            titleEl.textContent = outlet === 'All' ? 'All Items' : `${outlet} Menu`;
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('search-bar');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            
            const popularSection = document.querySelector('.main-highlight');
            const outletsSection = document.querySelector('.main-filter');
            const menuSection = document.querySelector('.main-detail');
            
            if (query) {
                if (popularSection) popularSection.style.display = 'none';
                if (outletsSection) outletsSection.style.display = 'none';
                if (menuSection) menuSection.style.display = 'block';
                
                this.filterMenuItems(query);
            } else {
                if (popularSection) popularSection.style.display = 'block';
                if (outletsSection) outletsSection.style.display = 'block';
                if (menuSection) menuSection.style.display = 'block';
                
                this.renderAllMenuItems();
            }
        });
    }

    filterMenuItems(query) {
        const menuContainer = document.getElementById('menu');
        if (!menuContainer) return;

        const filteredItems = this.menuItems.filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.outlet_name.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query))
        );

        if (filteredItems.length === 0) {
            menuContainer.innerHTML = '<div class="no-results">No items found matching your search.</div>';
            return;
        }

        const menuHTML = filteredItems.map(item => `
            <div class="detail-card" data-category="${item.outlet_name}">
                ${this.getImageHTML(item.image_url, item.name, 'detail-img')}
                <div class="detail-desc">
                    <div class="detail-name">
                        <h4>${item.name}</h4>
                        <p class="detail-sub">${item.outlet_name}</p>
                        <p class="price">₹${parseFloat(item.price).toFixed(2)}</p>
                        <button class="add-to-cart-btn" onclick="event.stopPropagation(); app.addToCart(${item.id})">
                            Add To Cart
                        </button>
                    </div>
                    <ion-icon class="detail-favorites" name="bookmark-outline"></ion-icon>
                </div>
            </div>
        `).join('');
        
        menuContainer.innerHTML = menuHTML;
    }

    addToCart(menuItemId) {
        const item = this.menuItems.find(item => item.id === menuItemId);
        if (!item) return;
        
        const existingItem = this.cart.find(cartItem => cartItem.menu_item_id === menuItemId);
        
        if (existingItem) {
            existingItem.qty++;
        } else {
            this.cart.push({
                menu_item_id: menuItemId,
                name: item.name,
                price: parseFloat(item.price),
                outlet_name: item.outlet_name,
                vendor_id: item.vendor_id,
                qty: 1
            });
        }
        
        this.updateCartDisplay();
        this.showNotification(`${item.name} added to cart!`);
        
        const floatingBadge = document.getElementById('floating-cart-badge');
        if (floatingBadge) {
            floatingBadge.classList.add('pulse');
            setTimeout(() => {
                floatingBadge.classList.remove('pulse');
            }, 600);
        }
    }

    removeFromCart(menuItemId) {
        this.cart = this.cart.filter(item => item.menu_item_id !== menuItemId);
        this.updateCartDisplay();
    }

    updateCartQuantity(menuItemId, change) {
        const item = this.cart.find(cartItem => cartItem.menu_item_id === menuItemId);
        if (!item) return;

        item.qty += change;
        
        if (item.qty <= 0) {
            this.removeFromCart(menuItemId);
        } else {
            this.updateCartDisplay();
        }
    }

    updateCartDisplay() {
        const cartItemsBody = document.querySelector('#cart-items tbody');
        const cartCountEl = document.getElementById('cart-count');
        const cartTotalEl = document.getElementById('cart-total');
        
        const floatingBadge = document.getElementById('floating-cart-badge');
        const floatingCountEl = document.getElementById('floating-cart-count');
        const floatingTotalEl = document.getElementById('floating-cart-total');

        if (!cartItemsBody || !cartCountEl || !cartTotalEl) return;

        cartItemsBody.innerHTML = '';

        let totalCount = 0;
        let totalAmount = 0;

        this.cart.forEach(item => {
            const itemTotal = item.price * item.qty;
            totalCount += item.qty;
            totalAmount += itemTotal;

            const row = cartItemsBody.insertRow();
            row.innerHTML = `
                <td>${item.name}</td>
                <td>${item.outlet_name}</td>
                <td class="item-count">${item.qty}</td>
                <td class="item-price">₹${item.price.toFixed(2)}</td>
                <td class="item-total">₹${itemTotal.toFixed(2)}</td>
                <td class="actions-cell">
                    <button class="decrease-btn" onclick="app.updateCartQuantity(${item.menu_item_id}, -1)">➖</button>
                    <button class="increase-btn" onclick="app.updateCartQuantity(${item.menu_item_id}, 1)">➕</button>
                </td>
            `;
        });

        cartCountEl.textContent = totalCount;
        cartTotalEl.textContent = totalAmount.toFixed(2);

        if (floatingBadge && floatingCountEl && floatingTotalEl) {
            floatingCountEl.textContent = totalCount;
            floatingTotalEl.textContent = totalAmount.toFixed(2);
            
            if (totalCount > 0) {
                floatingBadge.classList.add('active');
            } else {
                floatingBadge.classList.remove('active');
            }
        }
    }
    
    async checkout() {
        if (this.cart.length === 0) {
            this.showError('Your cart is empty!');
            return;
        }
        
        this.paymentProcessor.startCheckout();
    }

    setupStickyNavbar() {
        const navbar = document.querySelector('.main-navbar');
        if (!navbar) return;
        
        let lastScroll = 0;
        
        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        });
    }

    setupScrolling() {
        const backBtn = document.querySelector('.back');
        const nextBtn = document.querySelector('.next');
        const highlightWrapper = document.querySelector('.highlight-wrapper');

        if (backBtn && nextBtn && highlightWrapper) {
            backBtn.addEventListener('click', () => {
                highlightWrapper.scrollBy({ left: -200, behavior: 'smooth' });
            });

            nextBtn.addEventListener('click', () => {
                highlightWrapper.scrollBy({ left: 200, behavior: 'smooth' });
            });
        }

        const backMenusBtn = document.querySelector('.back-menus');
        const nextMenusBtn = document.querySelector('.next-menus');
        const filterWrapper = document.querySelector('.filter-wrapper');

        if (backMenusBtn && nextMenusBtn && filterWrapper) {
            backMenusBtn.addEventListener('click', () => {
                filterWrapper.scrollBy({ left: -150, behavior: 'smooth' });
            });

            nextMenusBtn.addEventListener('click', () => {
                filterWrapper.scrollBy({ left: 150, behavior: 'smooth' });
            });
        }
    }

    toggleCartPopup() {
        const cartPopup = document.getElementById('cart-popup');
        if (cartPopup) {
            cartPopup.classList.toggle('active');
        }
    }

    closeCart() {
        const cartPopup = document.getElementById('cart-popup');
        if (cartPopup) {
            cartPopup.classList.remove('active');
        }
    }

    showLoading(show) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    showError(message) {
        alert('Error: ' + message);
    }

    showSuccess(message) {
        alert('Success: ' + message);
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #00b894;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// ============================================
// REAL UPI PAYMENT PROCESSOR
// Add this after the CanTechApp class in app.js
// ============================================

class RealPaymentProcessor {
    constructor(app) {
        this.app = app;
        this.currentVendorIndex = 0;
        this.vendorOrders = [];
        this.completedPayments = [];
        this.failedPayments = [];
        this.razorpayLoaded = false;
        this.loadRazorpayScript();
    }

    loadRazorpayScript() {
        if (document.querySelector('script[src*="razorpay"]')) {
            this.razorpayLoaded = true;
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => {
                console.log('✅ Razorpay loaded');
                this.razorpayLoaded = true;
                resolve(true);
            };
            script.onerror = () => {
                console.error('❌ Razorpay failed to load');
                resolve(false);
            };
            document.body.appendChild(script);
        });
    }

    segregateByVendor(cartItems) {
        const vendorMap = new Map();
        
        cartItems.forEach(item => {
            if (!vendorMap.has(item.outlet_name)) {
                vendorMap.set(item.outlet_name, {
                    vendor_name: item.outlet_name,
                    vendor_id: item.vendor_id,
                    items: [],
                    total: 0
                });
            }
            
            const vendor = vendorMap.get(item.outlet_name);
            vendor.items.push(item);
            vendor.total += item.price * item.qty;
        });
        
        return Array.from(vendorMap.values());
    }

    async startCheckout() {
        if (this.app.cart.length === 0) {
            this.app.showError('Your cart is empty!');
            return;
        }

        if (!this.razorpayLoaded) {
            await this.loadRazorpayScript();
        }

        this.vendorOrders = this.segregateByVendor(this.app.cart);
        this.currentVendorIndex = 0;
        this.completedPayments = [];
        this.failedPayments = [];

        await this.processNextVendor();
    }

    async processNextVendor() {
        if (this.currentVendorIndex >= this.vendorOrders.length) {
            this.completeCheckout();
            return;
        }

        const currentVendor = this.vendorOrders[this.currentVendorIndex];
        
        try {
            this.app.showLoading(true);
            const vendorInfo = await api.getVendorUPI(currentVendor.vendor_id);
            this.app.showLoading(false);
            
            currentVendor.vendor_upi_id = vendorInfo.upi_id;
            
            if (!vendorInfo.upi_id) {
                this.app.showError(`${currentVendor.vendor_name} hasn't set up UPI yet. Please contact vendor.`);
                this.failedPayments.push({
                    vendor: currentVendor.vendor_name,
                    reason: 'Vendor UPI not configured'
                });
                this.currentVendorIndex++;
                this.processNextVendor();
                return;
            }

            await this.initiateRazorpayPayment(currentVendor);

        } catch (error) {
            this.app.showLoading(false);
            console.error('Vendor info fetch failed:', error);
            this.app.showError('Failed to fetch vendor details');
        }
    }

    async initiateRazorpayPayment(vendorOrder) {
        try {
            this.app.showLoading(true);

            const orderData = await api.createRazorpayOrder({
                amount: vendorOrder.total,
                vendor_name: vendorOrder.vendor_name,
                vendor_upi_id: vendorOrder.vendor_upi_id,
                items: vendorOrder.items
            });

            this.app.showLoading(false);

            const user = auth.getCurrentUser();

            const options = {
                key: orderData.key_id,
                amount: orderData.amount,
                currency: orderData.currency,
                name: 'Onlineपेटपूजा',
                description: `Payment to ${vendorOrder.vendor_name}`,
                order_id: orderData.order_id,
                prefill: {
                    name: user?.name || '',
                    email: user?.email || '',
                    contact: user?.phone || ''
                },
                notes: {
                    vendor_name: vendorOrder.vendor_name,
                    vendor_upi: vendorOrder.vendor_upi_id
                },
                theme: {
                    color: '#0e6253'
                },
                method: {
                    upi: true,
                    card: true,
                    wallet: true,
                    netbanking: true
                },
                handler: async (response) => {
                    await this.handlePaymentSuccess(response, vendorOrder, orderData.amount);
                },
                modal: {
                    ondismiss: () => {
                        this.handlePaymentFailure(vendorOrder, 'Payment cancelled by user');
                    }
                }
            };

            if (typeof Razorpay !== 'undefined') {
                const rzp = new Razorpay(options);
                
                rzp.on('payment.failed', (response) => {
                    this.handlePaymentFailure(vendorOrder, response.error.description);
                });

                rzp.open();
            } else {
                throw new Error('Razorpay not loaded');
            }

        } catch (error) {
            this.app.showLoading(false);
            console.error('Razorpay initialization failed:', error);
            this.handlePaymentFailure(vendorOrder, error.message);
        }
    }

    async handlePaymentSuccess(razorpayResponse, vendorOrder, amount) {
        try {
            this.app.showLoading(true);

            const verifyData = await api.verifyPayment({
                razorpay_order_id: razorpayResponse.razorpay_order_id,
                razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                razorpay_signature: razorpayResponse.razorpay_signature,
                vendor_name: vendorOrder.vendor_name,
                vendor_id: vendorOrder.vendor_id,
                items: vendorOrder.items,
                amount: amount
            });

            if (verifyData.success) {
                this.completedPayments.push({
                    vendor: vendorOrder.vendor_name,
                    token: verifyData.token,
                    amount: verifyData.amount,
                    payment_id: verifyData.payment_id
                });

                this.removeVendorItemsFromCart(vendorOrder);

                this.app.showNotification(`✅ Payment successful! Token: ${verifyData.token}`);
                
                this.app.showLoading(false);
                
                this.currentVendorIndex++;
                setTimeout(() => this.processNextVendor(), 1000);

            } else {
                throw new Error('Payment verification failed');
            }

        } catch (error) {
            this.app.showLoading(false);
            console.error('Payment verification error:', error);
            this.handlePaymentFailure(vendorOrder, 'Payment verification failed');
        }
    }

    handlePaymentFailure(vendorOrder, reason) {
        this.failedPayments.push({
            vendor: vendorOrder.vendor_name,
            reason: reason
        });

        if (confirm(`Payment to ${vendorOrder.vendor_name} failed: ${reason}\n\nWould you like to retry?`)) {
            this.initiateRazorpayPayment(vendorOrder);
        } else {
            this.currentVendorIndex++;
            if (this.currentVendorIndex < this.vendorOrders.length) {
                this.processNextVendor();
            } else {
                this.completeCheckout();
            }
        }
    }

    removeVendorItemsFromCart(vendorOrder) {
        this.app.cart = this.app.cart.filter(item => 
            item.outlet_name !== vendorOrder.vendor_name
        );
        this.app.updateCartDisplay();
    }

    async completeCheckout() {
        await this.app.updateWalletBalance();
        this.showCheckoutSummary();

        if (this.failedPayments.length === 0 && this.app.cart.length === 0) {
            setTimeout(() => {
                window.location.href = 'bills.html';
            }, 3000);
        }
    }

    showCheckoutSummary() {
        const summaryHTML = `
            <div class="checkout-summary-modal active" id="checkout-summary-modal">
                <div class="checkout-summary-content">
                    <h2>Payment Summary</h2>
                    
                    ${this.completedPayments.length > 0 ? `
                        <div class="summary-section success-section">
                            <h3>✅ Successful Payments (${this.completedPayments.length})</h3>
                            ${this.completedPayments.map(payment => `
                                <div class="summary-item">
                                    <strong>${payment.vendor}</strong>
                                    <span>Token: ${payment.token}</span>
                                    <span>Amount: ₹${payment.amount.toFixed(2)}</span>
                                    <span style="font-size: 0.85rem; color: #666;">Payment ID: ${payment.payment_id}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${this.failedPayments.length > 0 ? `
                        <div class="summary-section failed-section">
                            <h3>❌ Failed Payments (${this.failedPayments.length})</h3>
                            ${this.failedPayments.map(payment => `
                                <div class="summary-item">
                                    <strong>${payment.vendor}</strong>
                                    <span>${payment.reason}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <button class="btn-primary" onclick="closeCheckoutSummary()">
                        ${this.completedPayments.length > 0 ? 'View Bills' : 'Close'}
                    </button>
                </div>
            </div>
        `;

        const existing = document.getElementById('checkout-summary-modal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', summaryHTML);
    }
}

// ============================================
// GLOBAL FUNCTIONS
// ============================================

function closeCheckoutSummary() {
    const modal = document.getElementById('checkout-summary-modal');
    if (modal) modal.remove();
    
    if (app.paymentProcessor.completedPayments.length > 0) {
        window.location.href = 'bills.html';
    }
}

function toggleCartPopup() {
    app.toggleCartPopup();
}

function closeCart() {
    app.closeCart();
}

function toggleBookmarkPopup() {
    app.toggleBookmarkPopup();
}

function closeBookmarkPopup() {
    app.closeBookmarkPopup();
}

// ============================================
// INITIALIZE APP
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    window.app = new CanTechApp();
});