// js/app.js
class CanTechApp {
    constructor() {
        this.cart = [];
        this.menuItems = [];
        this.outlets = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadUserData();
        await this.loadMenuData();
        this.setupSearch();
        this.setupScrolling();
    }

    setupEventListeners() {
    // Mobile menu toggle with overlay
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    // Create overlay if it doesn't exist
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (menuToggle && sidebar) {
        // Toggle sidebar
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('is-active');
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.classList.toggle('menu-open'); // Prevent body scroll
        });

        // Close sidebar when clicking overlay
        overlay.addEventListener('click', () => {
            menuToggle.classList.remove('is-active');
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('menu-open');
        });

        // Close sidebar when clicking a link on mobile
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

    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => this.checkout());
    }
}

    async loadUserData() {
        try {
            const user = auth.getCurrentUser();
            if (user) {
                const userNameEl = document.getElementById('user-name');
                if (userNameEl) {
                    // FIX: Use the actual user's name from the user object
                    userNameEl.textContent = user.name;
                }
            }

            // Load wallet balance
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
            
            // Group by outlets
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

    renderOutlets() {
        const container = document.getElementById('outlets-container');
        if (!container) return;

        const outletsHTML = this.outlets.map(outlet => `
            <div class="filter-card" onclick="app.filterByOutlet('${outlet}')">
                <div class="filter-icon">
                    <img class="filter-img" src="images/outlets/${outlet.toLowerCase().replace(/\s+/g, '_')}.jpg" 
                         alt="${outlet}" onerror="this.src='images/outlets/default.jpg'">
                </div>
                <p>${outlet}</p>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="filter-card" onclick="app.filterByOutlet('All')">
                <div class="filter-icon">
                    <img class="filter-img" src="images/outlets/all.jpg" alt="All" onerror="this.src='images/outlets/default.jpg'">
                </div>
                <p>All</p>
            </div>
            ${outletsHTML}
        `;
    }

    renderPopularItems() {
        const container = document.getElementById('popular-items');
        if (!container) return;

        // Get first 4 items as popular (you can implement actual popularity logic)
        const popularItems = this.menuItems.slice(0, 4);

        const popularHTML = popularItems.map(item => `
            <div class="highlight-card" onclick="app.addToCart(${item.id})">
                <img class="highlight-img" src="${item.image_url || 'images/food/default.jpg'}" 
                     alt="${item.name}" onerror="this.src='images/food/default.jpg'">
                <div class="highlight-desc">
                    <h4>${item.name}</h4>
                    <p style="color: #a7a7a7;">${item.outlet_name}</p>
                    <p>₹${parseFloat(item.price).toFixed(2)}</p>
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

        const menuHTML = itemsToShow.map(item => `
            <div class="detail-card" data-category="${item.outlet_name}">
                <img class="detail-img" src="${item.image_url || 'images/food/default.jpg'}" 
                     alt="${item.name}" onerror="this.src='images/food/default.jpg'">
                <div class="detail-desc">
                    <div class="detail-name">
                        <h4>${item.name}</h4>
                        <p class="detail-sub">${item.outlet_name}</p>
                        <p class="price">₹${parseFloat(item.price).toFixed(2)}</p>
                        <button class="add-to-cart-btn" onclick="app.addToCart(${item.id})">
                            Add To Cart
                        </button>
                    </div>
                    <ion-icon class="detail-favorites" name="bookmark-outline"></ion-icon>
                </div>
            </div>
        `).join('');

        container.innerHTML = menuHTML;
    }

    filterByOutlet(outlet) {
        this.renderAllMenuItems(outlet);
        
        // Update title
        const titleEl = document.querySelector('.main-detail .main-title');
        if (titleEl) {
            titleEl.textContent = outlet === 'All' ? 'All Items' : `${outlet} Menu`;
        }
    }

    addToCart(menuItemId) {
        const item = this.menuItems.find(item => item.id === menuItemId);
        if (!item) return;

        // Check if item already in cart
        const existingItem = this.cart.find(cartItem => cartItem.menu_item_id === menuItemId);
        
        if (existingItem) {
            existingItem.qty++;
        } else {
            this.cart.push({
                menu_item_id: menuItemId,
                name: item.name,
                price: parseFloat(item.price),
                outlet_name: item.outlet_name,
                qty: 1
            });
        }

        this.updateCartDisplay();
        this.showNotification(`${item.name} added to cart!`);
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

        if (!cartItemsBody || !cartCountEl || !cartTotalEl) return;

        // Clear existing items
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
    }

    async checkout() {
        if (this.cart.length === 0) {
            this.showError('Your cart is empty!');
            return;
        }

        try {
            this.showLoading(true);

            const orderData = {
                items: this.cart.map(item => ({
                    menu_item_id: item.menu_item_id,
                    qty: item.qty
                }))
            };

            const response = await api.createOrder(orderData);
            
            // Clear cart
            this.cart = [];
            this.updateCartDisplay();
            this.closeCart();

            // Update wallet balance
            await this.updateWalletBalance();

            // Show success message
            this.showSuccess(`Order placed successfully! Token: ${response.token}`);

            // Redirect to bills page after a short delay
            setTimeout(() => {
                window.location.href = 'bills.html';
            }, 2000);

        } catch (error) {
            console.error('Checkout failed:', error);
            this.showError(error.message || 'Checkout failed');
        } finally {
            this.showLoading(false);
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('search-bar');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.filterMenuItems(query);
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
                <img class="detail-img" src="${item.image_url || 'images/food/default.jpg'}" 
                     alt="${item.name}" onerror="this.src='images/food/default.jpg'">
                <div class="detail-desc">
                    <div class="detail-name">
                        <h4>${item.name}</h4>
                        <p class="detail-sub">${item.outlet_name}</p>
                        <p class="price">₹${parseFloat(item.price).toFixed(2)}</p>
                        <button class="add-to-cart-btn" onclick="app.addToCart(${item.id})">
                            Add To Cart
                        </button>
                    </div>
                    <ion-icon class="detail-favorites" name="bookmark-outline"></ion-icon>
                </div>
            </div>
        `).join('');

        menuContainer.innerHTML = menuHTML;
    }

    setupScrolling() {
        // Setup horizontal scrolling for recommendations
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

        // Setup horizontal scrolling for outlets
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

    // Utility functions
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
        // You can implement a proper notification system
        alert('Error: ' + message);
    }

    showSuccess(message) {
        // You can implement a proper notification system
        alert('Success: ' + message);
    }

    showNotification(message) {
        // Simple notification - you can enhance this
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

// Global functions for onclick handlers
function toggleCartPopup() {
    app.toggleCartPopup();
}

function closeCart() {
    app.closeCart();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CanTechApp();
});