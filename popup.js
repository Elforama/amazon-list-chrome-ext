// Amazon Shopping List - Popup Logic

(function () {
  'use strict';

  // === State ===
  let shoppingList = [];
  let recipes = [];
  let editingRecipe = null; // { index, recipe } when editing, or { index: -1, recipe } for new

  // === Helpers ===

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatPrice(price) {
    if (price == null) return null;
    return '$' + price.toFixed(2);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  // === Data Layer ===

  async function loadData() {
    const data = await chrome.storage.local.get(['shoppingList', 'recipes']);
    shoppingList = data.shoppingList || [];
    recipes = data.recipes || [];
  }

  async function saveList() {
    await chrome.storage.local.set({ shoppingList });
  }

  async function saveRecipes() {
    await chrome.storage.local.set({ recipes });
  }

  // === Tab Switching ===

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

        // Reset recipe edit view when switching tabs
        if (tab.dataset.tab === 'recipes') {
          showRecipeListView();
        }
      });
    });
  }

  // === Shopping List ===

  function renderList() {
    const container = document.getElementById('list-items');
    const emptyState = document.getElementById('list-empty');
    const footer = document.getElementById('list-footer');

    if (shoppingList.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      footer.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    footer.style.display = 'block';

    container.innerHTML = shoppingList
      .map(
        (item, i) => `
      <div class="item-card" data-index="${i}">
        <img src="${escapeHtml(item.image || '')}" alt="" class="item-thumb" onerror="this.style.display='none'">
        <div class="item-info">
          <a href="${escapeHtml(item.url)}" class="item-title" target="_blank" title="${escapeHtml(item.title)}">${escapeHtml(item.title || 'Unknown Product')}</a>
          <span class="item-price ${item.price == null ? 'na' : ''}">${formatPrice(item.price) || 'Price N/A'}</span>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-action="decrease" data-index="${i}">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" data-action="increase" data-index="${i}">+</button>
        </div>
        <button class="remove-btn" data-action="remove" data-index="${i}" title="Remove">&times;</button>
      </div>
    `
      )
      .join('');

    updateTotal();
  }

  function updateTotal() {
    const total = shoppingList.reduce((sum, item) => {
      return sum + (item.price || 0) * item.quantity;
    }, 0);
    document.getElementById('list-total').textContent = '$' + total.toFixed(2);

    const hasUnpriced = shoppingList.some((item) => item.price == null);
    if (hasUnpriced) {
      document.getElementById('list-total').textContent += ' *';
      document.getElementById('list-total').title = 'Some items have no price';
    }
  }

  function setupListEvents() {
    const container = document.getElementById('list-items');
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const index = parseInt(btn.dataset.index);
      const action = btn.dataset.action;

      if (action === 'increase') {
        shoppingList[index].quantity++;
      } else if (action === 'decrease') {
        if (shoppingList[index].quantity > 1) {
          shoppingList[index].quantity--;
        }
      } else if (action === 'remove') {
        shoppingList.splice(index, 1);
      }

      await saveList();
      renderList();
    });

    document.getElementById('btn-add-to-cart').addEventListener('click', () => {
      addToCart(
        shoppingList.map((item) => ({ asin: item.asin, quantity: item.quantity }))
      );
    });

    document.getElementById('btn-clear-list').addEventListener('click', async () => {
      if (shoppingList.length === 0) return;
      shoppingList = [];
      await saveList();
      renderList();
    });
  }

  // === Add to Cart ===

  function addToCart(items) {
    if (items.length === 0) return;
    chrome.runtime.sendMessage({ action: 'ADD_ITEMS_TO_CART', items });
  }

  // === Recipes ===

  function showRecipeListView() {
    document.getElementById('recipe-list-view').style.display = '';
    document.getElementById('recipe-edit-view').style.display = 'none';
    editingRecipe = null;
  }

  function showRecipeEditView() {
    document.getElementById('recipe-list-view').style.display = 'none';
    document.getElementById('recipe-edit-view').style.display = '';
  }

  function renderRecipes() {
    const container = document.getElementById('recipe-list');
    const emptyState = document.getElementById('recipe-empty');

    if (recipes.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = recipes
      .map((recipe, i) => {
        const total = recipe.items.reduce(
          (sum, item) => sum + (item.price || 0) * item.baseQuantity * recipe.multiplier,
          0
        );
        return `
        <div class="recipe-card" data-index="${i}">
          <div class="recipe-header">
            <h3>${escapeHtml(recipe.name)}</h3>
            <span class="recipe-meta">${recipe.items.length} item${recipe.items.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="recipe-multiplier">
            <div class="qty-controls">
              <button class="qty-btn" data-recipe-mult="${i}" data-delta="-1">-</button>
              <span class="qty-value">${recipe.multiplier}x</span>
              <button class="qty-btn" data-recipe-mult="${i}" data-delta="1">+</button>
            </div>
          </div>
          <div class="recipe-total">Total: $${total.toFixed(2)}</div>
          <div class="recipe-actions">
            <button class="btn primary small" data-cart-recipe="${i}">Add to Cart</button>
            <button class="btn secondary small" data-edit-recipe="${i}">Edit</button>
            <button class="btn danger small" data-delete-recipe="${i}">Delete</button>
          </div>
        </div>
      `;
      })
      .join('');
  }

  function renderRecipeEditItems() {
    const container = document.getElementById('recipe-items');
    const emptyState = document.getElementById('recipe-items-empty');

    if (!editingRecipe || editingRecipe.recipe.items.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = editingRecipe.recipe.items
      .map(
        (item, i) => `
      <div class="item-card" data-ri="${i}">
        <img src="${escapeHtml(item.image || '')}" alt="" class="item-thumb" onerror="this.style.display='none'">
        <div class="item-info">
          <span class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || 'Unknown Product')}</span>
          <span class="item-price ${item.price == null ? 'na' : ''}">${formatPrice(item.price) || 'Price N/A'}</span>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-ri-action="decrease" data-ri="${i}">-</button>
          <span class="qty-value">${item.baseQuantity}</span>
          <button class="qty-btn" data-ri-action="increase" data-ri="${i}">+</button>
        </div>
        <button class="remove-btn" data-ri-action="remove" data-ri="${i}" title="Remove">&times;</button>
      </div>
    `
      )
      .join('');
  }

  function startEditRecipe(index) {
    const recipe =
      index === -1
        ? { id: generateId(), name: '', multiplier: 1, items: [] }
        : JSON.parse(JSON.stringify(recipes[index])); // deep clone

    editingRecipe = { index, recipe };

    document.getElementById('recipe-name').value = recipe.name;
    document.getElementById('recipe-multiplier').textContent = String(recipe.multiplier);
    renderRecipeEditItems();
    showRecipeEditView();
  }

  function setupRecipeEvents() {
    const listContainer = document.getElementById('recipe-list');

    // Recipe list actions (multiplier, cart, edit, delete)
    listContainer.addEventListener('click', async (e) => {
      // Multiplier buttons
      const multBtn = e.target.closest('[data-recipe-mult]');
      if (multBtn) {
        const i = parseInt(multBtn.dataset.recipeMult);
        const delta = parseInt(multBtn.dataset.delta);
        const newMult = recipes[i].multiplier + delta;
        if (newMult >= 1) {
          recipes[i].multiplier = newMult;
          await saveRecipes();
          renderRecipes();
        }
        return;
      }

      // Add to cart
      const cartBtn = e.target.closest('[data-cart-recipe]');
      if (cartBtn) {
        const i = parseInt(cartBtn.dataset.cartRecipe);
        const recipe = recipes[i];
        const items = recipe.items.map((item) => ({
          asin: item.asin,
          quantity: item.baseQuantity * recipe.multiplier,
        }));
        addToCart(items);
        return;
      }

      // Edit
      const editBtn = e.target.closest('[data-edit-recipe]');
      if (editBtn) {
        startEditRecipe(parseInt(editBtn.dataset.editRecipe));
        return;
      }

      // Delete
      const deleteBtn = e.target.closest('[data-delete-recipe]');
      if (deleteBtn) {
        const i = parseInt(deleteBtn.dataset.deleteRecipe);
        recipes.splice(i, 1);
        await saveRecipes();
        renderRecipes();
        return;
      }
    });

    // New recipe
    document.getElementById('btn-new-recipe').addEventListener('click', () => {
      startEditRecipe(-1);
    });

    // Edit view: multiplier controls
    document.getElementById('mult-decrease').addEventListener('click', () => {
      if (!editingRecipe) return;
      if (editingRecipe.recipe.multiplier > 1) {
        editingRecipe.recipe.multiplier--;
        document.getElementById('recipe-multiplier').textContent = String(
          editingRecipe.recipe.multiplier
        );
      }
    });

    document.getElementById('mult-increase').addEventListener('click', () => {
      if (!editingRecipe) return;
      editingRecipe.recipe.multiplier++;
      document.getElementById('recipe-multiplier').textContent = String(
        editingRecipe.recipe.multiplier
      );
    });

    // Edit view: recipe item actions
    document.getElementById('recipe-items').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ri-action]');
      if (!btn || !editingRecipe) return;

      const i = parseInt(btn.dataset.ri);
      const action = btn.dataset.riAction;

      if (action === 'increase') {
        editingRecipe.recipe.items[i].baseQuantity++;
      } else if (action === 'decrease') {
        if (editingRecipe.recipe.items[i].baseQuantity > 1) {
          editingRecipe.recipe.items[i].baseQuantity--;
        }
      } else if (action === 'remove') {
        editingRecipe.recipe.items.splice(i, 1);
      }

      renderRecipeEditItems();
    });

    // Add from shopping list
    document.getElementById('btn-add-from-list').addEventListener('click', () => {
      showItemPicker();
    });

    // Add current product from Amazon page
    document.getElementById('btn-add-current-product').addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('amazon.com')) {
          alert('Navigate to an Amazon product page first.');
          return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PRODUCT' });
        if (response && response.product && response.product.asin) {
          const product = response.product;
          // Check if already in recipe
          const exists = editingRecipe.recipe.items.some((item) => item.asin === product.asin);
          if (exists) {
            alert('This product is already in the recipe.');
            return;
          }
          editingRecipe.recipe.items.push({
            asin: product.asin,
            title: product.title,
            price: product.price,
            image: product.image,
            url: product.url,
            baseQuantity: 1,
          });
          renderRecipeEditItems();
        } else {
          alert('Could not detect a product on the current page.');
        }
      } catch (e) {
        alert('Could not read from the current page. Make sure you are on an Amazon product page.');
      }
    });

    // Save recipe
    document.getElementById('btn-save-recipe').addEventListener('click', async () => {
      if (!editingRecipe) return;

      const name = document.getElementById('recipe-name').value.trim();
      if (!name) {
        document.getElementById('recipe-name').focus();
        return;
      }

      editingRecipe.recipe.name = name;

      if (editingRecipe.index === -1) {
        recipes.push(editingRecipe.recipe);
      } else {
        recipes[editingRecipe.index] = editingRecipe.recipe;
      }

      await saveRecipes();
      showRecipeListView();
      renderRecipes();
    });

    // Cancel recipe edit
    document.getElementById('btn-cancel-recipe').addEventListener('click', () => {
      showRecipeListView();
    });
  }

  // === Item Picker (modal for adding shopping list items to a recipe) ===

  function showItemPicker() {
    if (shoppingList.length === 0) {
      alert('Your shopping list is empty. Add products from Amazon first.');
      return;
    }

    const picker = document.getElementById('item-picker');
    const container = document.getElementById('picker-items');

    // Filter out items already in the recipe
    const existingAsins = new Set(editingRecipe.recipe.items.map((item) => item.asin));

    const available = shoppingList.filter((item) => !existingAsins.has(item.asin));
    if (available.length === 0) {
      alert('All shopping list items are already in this recipe.');
      return;
    }

    container.innerHTML = available
      .map(
        (item, i) => `
      <label class="picker-item">
        <input type="checkbox" value="${i}" data-asin="${escapeHtml(item.asin)}">
        <span class="picker-item-title">${escapeHtml(item.title || 'Unknown')}</span>
        <span class="picker-item-price">${formatPrice(item.price) || 'N/A'}</span>
      </label>
    `
      )
      .join('');

    picker.style.display = '';
  }

  function setupPickerEvents() {
    document.getElementById('btn-picker-confirm').addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#picker-items input[type="checkbox"]:checked');
      checkboxes.forEach((cb) => {
        const asin = cb.dataset.asin;
        const item = shoppingList.find((item) => item.asin === asin);
        if (item) {
          editingRecipe.recipe.items.push({
            asin: item.asin,
            title: item.title,
            price: item.price,
            image: item.image,
            url: item.url,
            baseQuantity: item.quantity,
          });
        }
      });

      document.getElementById('item-picker').style.display = 'none';
      renderRecipeEditItems();
    });

    document.getElementById('btn-picker-cancel').addEventListener('click', () => {
      document.getElementById('item-picker').style.display = 'none';
    });
  }

  // === Storage Change Listener ===
  // If the content script adds an item while the popup is open, refresh the list
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.shoppingList) {
        shoppingList = changes.shoppingList.newValue || [];
        renderList();
      }
      if (changes.recipes) {
        recipes = changes.recipes.newValue || [];
        // Only re-render recipe list if not currently editing
        if (!editingRecipe) {
          renderRecipes();
        }
      }
    }
  });

  // === Init ===

  document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupTabs();
    setupListEvents();
    setupRecipeEvents();
    setupPickerEvents();
    renderList();
    renderRecipes();
  });
})();
