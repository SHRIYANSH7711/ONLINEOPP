// js/brand.js
const BRAND_NAME = "Onlineपेटपूजा";
const BRAND_SHORT_NAME = "OPP";

(function() {
  function applyBranding() {
    // Update title
    document.title = document.title.replace(/CanTech/g, BRAND_NAME);

    // Update all text nodes with CanTech
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue.includes('CanTech')) {
        node.nodeValue = node.nodeValue.replace(/CanTech/g, BRAND_NAME);
      }
    }
  }

  function applyDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
  }

  function init() {
    applyBranding();
    applyDarkMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Catch dynamic content
  setTimeout(init, 100);
})();