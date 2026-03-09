// Amazon Shopping List - Content Script
// Runs on Amazon product pages to extract product data and inject "Add to List" button

(function () {
  'use strict';

  // Avoid double-injection
  if (document.querySelector('#asl-add-to-list-btn')) return;

  function extractASIN() {
    // Try URL patterns first
    const dpMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    if (dpMatch) return dpMatch[1];

    const gpMatch = window.location.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/);
    if (gpMatch) return gpMatch[1];

    // Fallback: DOM attribute
    const el = document.querySelector('[data-asin]:not([data-asin=""])');
    if (el) return el.getAttribute('data-asin');

    return null;
  }

  function isWholeFoodsPage() {
    const params = new URLSearchParams(window.location.search);
    return params.get('fpw') === 'alm' || params.has('almBrandId');
  }

  function extractProductData() {
    const asin = extractASIN();
    if (!asin) return null;

    // Title
    const titleEl = document.querySelector('#productTitle');
    const title = titleEl ? titleEl.textContent.trim() : '';

    // Price - multiple fallback selectors
    let price = null;
    const priceSelectors = [
      '.a-price .a-offscreen',
      '.priceToPay .a-offscreen',
      '#corePrice_feature_div .a-offscreen',
      '#price_inside_buybox',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
    ];
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        const match = text.match(/[\d,.]+/);
        if (match) {
          price = parseFloat(match[0].replace(/,/g, ''));
          break;
        }
      }
    }

    // Image
    const imageEl =
      document.querySelector('#landingImage') ||
      document.querySelector('#imgBlkFront') ||
      document.querySelector('#main-image');
    const image = imageEl
      ? imageEl.getAttribute('data-old-hires') || imageEl.src
      : '';

    const url = `https://www.amazon.com/dp/${asin}`;

    return { asin, title, price, image, url };
  }

  function showToast(message, isError) {
    // Remove existing toast
    const existing = document.querySelector('.asl-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'asl-toast' + (isError ? ' asl-error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger show
    requestAnimationFrame(() => {
      toast.classList.add('asl-show');
    });

    setTimeout(() => {
      toast.classList.remove('asl-show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function showRecipePicker(recipes, onSelect) {
    const existing = document.querySelector('#asl-recipe-picker-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'asl-recipe-picker-overlay';

    const modal = document.createElement('div');
    modal.className = 'asl-recipe-picker-modal';

    const header = document.createElement('h3');
    header.className = 'asl-recipe-picker-title';
    header.textContent = 'Add to Recipe';
    modal.appendChild(header);

    if (recipes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'asl-recipe-picker-empty';
      empty.textContent = 'No recipes yet. Create one in the extension popup first.';
      modal.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'asl-recipe-picker-list';

      recipes.forEach((recipe, i) => {
        const item = document.createElement('button');
        item.className = 'asl-recipe-picker-item';
        item.type = 'button';

        const name = document.createElement('span');
        name.className = 'asl-recipe-picker-item-name';
        name.textContent = recipe.name;

        const meta = document.createElement('span');
        meta.className = 'asl-recipe-picker-item-meta';
        meta.textContent = recipe.items.length + ' item' + (recipe.items.length !== 1 ? 's' : '');

        item.appendChild(name);
        item.appendChild(meta);
        item.addEventListener('click', () => {
          onSelect(i);
          overlay.remove();
        });

        list.appendChild(item);
      });

      modal.appendChild(list);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'asl-recipe-picker-cancel';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    modal.appendChild(cancelBtn);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    document.body.appendChild(overlay);
  }

  async function handleAddToRecipe() {
    const product = extractProductData();
    if (!product) {
      showToast('Could not detect product. Try refreshing.', true);
      return;
    }

    try {
      const data = await chrome.storage.local.get(['recipes']);
      const recipes = data.recipes || [];

      showRecipePicker(recipes, async (recipeIndex) => {
        const freshData = await chrome.storage.local.get(['recipes']);
        const freshRecipes = freshData.recipes || [];

        if (recipeIndex >= freshRecipes.length) {
          showToast('Recipe not found. It may have been deleted.', true);
          return;
        }

        const recipe = freshRecipes[recipeIndex];
        const exists = recipe.items.some((item) => item.asin === product.asin);
        if (exists) {
          showToast('Already in "' + recipe.name + '".');
          return;
        }

        recipe.items.push({
          asin: product.asin,
          title: product.title,
          price: product.price,
          image: product.image,
          url: product.url,
          baseQuantity: 1,
        });

        freshRecipes[recipeIndex] = recipe;
        await chrome.storage.local.set({ recipes: freshRecipes });
        showToast('Added to "' + recipe.name + '"!');
      });
    } catch (e) {
      console.error('ASL: Failed to load recipes', e);
      showToast('Failed to load recipes. Try again.', true);
    }
  }

  async function handleAddToList() {
    const product = extractProductData();
    if (!product) {
      showToast('Could not detect product. Try refreshing.', true);
      return;
    }

    try {
      const data = await chrome.storage.local.get(['shoppingList']);
      const list = data.shoppingList || [];
      const existing = list.find((item) => item.asin === product.asin);

      if (existing) {
        existing.quantity += 1;
        existing.price = product.price || existing.price;
        existing.title = product.title || existing.title;
        existing.image = product.image || existing.image;
        showToast(`Quantity updated to ${existing.quantity}!`);
      } else {
        list.push({ ...product, quantity: 1 });
        showToast('Added to shopping list!');
      }

      await chrome.storage.local.set({ shoppingList: list });
    } catch (e) {
      console.error('ASL: Failed to save product', e);
      showToast('Failed to save. Try again.', true);
    }
  }

  function injectButton(anchorEl) {
    if (document.querySelector('#asl-add-to-list-btn')) return;

    const button = document.createElement('button');
    button.id = 'asl-add-to-list-btn';
    button.type = 'button';
    button.textContent = '+ Add to Shopping List';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAddToList();
    });

    if (anchorEl) {
      // Insert after the Add to Cart button's container
      const container =
        anchorEl.closest('#addToCart_feature_div') ||
        anchorEl.closest('#add-to-cart-form') ||
        anchorEl.parentElement;
      if (container) {
        container.insertAdjacentElement('afterend', button);
        return;
      }
    }

    // Fallback: floating button
    button.classList.add('asl-floating');
    document.body.appendChild(button);
  }

  function injectRecipeButton(anchorEl) {
    if (document.querySelector('#asl-add-to-recipe-btn')) return;

    const button = document.createElement('button');
    button.id = 'asl-add-to-recipe-btn';
    button.type = 'button';
    button.textContent = '+ Add to Recipe';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAddToRecipe();
    });

    const listBtn = document.querySelector('#asl-add-to-list-btn');
    if (listBtn) {
      if (listBtn.classList.contains('asl-floating')) {
        button.classList.add('asl-floating');
        document.body.appendChild(button);
      } else {
        listBtn.insertAdjacentElement('afterend', button);
      }
      return;
    }

    if (anchorEl) {
      const container =
        anchorEl.closest('#addToCart_feature_div') ||
        anchorEl.closest('#add-to-cart-form') ||
        anchorEl.parentElement;
      if (container) {
        container.insertAdjacentElement('afterend', button);
        return;
      }
    }

    button.classList.add('asl-floating');
    document.body.appendChild(button);
  }

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_PRODUCT') {
      const product = extractProductData();
      sendResponse({ product });
    }
    if (message.action === 'CLICK_ADD_TO_CART') {
      // Wait for the buy box button (may be lazy-loaded), then click it
      waitForBuyBox().then((btn) => {
        if (btn) {
          btn.click();
          // Fallback: if the click didn't navigate, submit the form directly
          const form = btn.closest('form');
          if (form) setTimeout(() => form.submit(), 500);
        }
        sendResponse({ clicked: !!btn });
      });
      return true; // keep message port open for async response
    }
  });

  // Wait for buy box to appear (may be lazy-loaded)
  const ADD_TO_CART_SELECTOR =
    '#add-to-cart-button, #add-to-cart-button-ubb, input[name="submit.add-to-cart"], #freshAddToCartButton';

  function waitForBuyBox(timeout = 5000) {
    return new Promise((resolve) => {
      const btn = document.querySelector(ADD_TO_CART_SELECTOR);
      if (btn) {
        resolve(btn);
        return;
      }

      const observer = new MutationObserver(() => {
        const btn = document.querySelector(ADD_TO_CART_SELECTOR);
        if (btn) {
          observer.disconnect();
          resolve(btn);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Init
  async function init() {
    const asin = extractASIN();
    if (!asin) return; // Not a product page

    const buyBoxBtn = await waitForBuyBox();
    injectButton(buyBoxBtn);

    if (isWholeFoodsPage()) {
      injectRecipeButton(buyBoxBtn);
    }
  }

  init();
})();
