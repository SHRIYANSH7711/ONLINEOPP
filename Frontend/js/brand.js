// js/brand.js
// Global branding configuration
const BRAND_NAME = "Onlineपेटपूजा";
const BRAND_SHORT_NAME = "OPP";

// Apply branding on page load
(function() {
    function applyBranding() {
        // Update page title
        if (document.title.includes('CanTech')) {
            document.title = document.title.replace(/CanTech/g, BRAND_NAME);
        }

        // Update logo in sidebar
        const logoElements = document.querySelectorAll('.logo');
        logoElements.forEach(logo => {
            if (logo.textContent.includes('CanTech')) {
                logo.textContent = BRAND_NAME;
            }
        });

        // Update vendor dashboard title
        const vendorTitle = document.querySelector('.logo');
        if (vendorTitle && vendorTitle.textContent.includes('CanTech Vendor')) {
            vendorTitle.textContent = `${BRAND_NAME} Vendor`;
        }

        // Update any other CanTech references in the page
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeValue.includes('CanTech')) {
                textNodes.push(node);
            }
        }

        textNodes.forEach(textNode => {
            textNode.nodeValue = textNode.nodeValue.replace(/CanTech/g, BRAND_NAME);
        });
    }

    // Apply dark mode if enabled
    function applyDarkMode() {
        const isDark = localStorage.getItem('darkMode') === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
            const sidebar = document.querySelector('.sidebar');
            const main = document.querySelector('.main');
            if (sidebar) sidebar.classList.add('dark-mode');
            if (main) main.classList.add('dark-mode');
        }
    }

    // Run immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyBranding();
            applyDarkMode();
        });
    } else {
        applyBranding();
        applyDarkMode();
    }

    // Also run after a short delay to catch any dynamically loaded content
    setTimeout(() => {
        applyBranding();
        applyDarkMode();
    }, 100);
})();