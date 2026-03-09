// Amazon Shopping List - Service Worker
// Updates badge count when shopping list changes

function updateBadge(list) {
  const count = (list || []).reduce((sum, item) => sum + item.quantity, 0);
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#ffa41c' });
}

// Update badge when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.shoppingList) {
    updateBadge(changes.shoppingList.newValue);
  }
});

// Set initial badge on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['shoppingList']);
  updateBadge(data.shoppingList);
});

// === Cart Orchestration ===
// Navigates to each product page and clicks "Add to Cart" sequentially

let cartState = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ADD_ITEMS_TO_CART') {
    startCartProcess(message.items);
  }
});

async function startCartProcess(items) {
  if (cartState || items.length === 0) return;

  // Expand quantities: qty 3 → 3 separate entries (one add-to-cart click each)
  const expanded = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expanded.push({ asin: item.asin });
    }
  }

  const tab = await chrome.tabs.create({
    url: `https://www.amazon.com/dp/${expanded[0].asin}`,
  });

  cartState = {
    tabId: tab.id,
    items: expanded,
    currentIndex: 0,
    clickSent: false,
  };

  chrome.tabs.onUpdated.addListener(cartTabListener);
}

function cartTabListener(tabId, changeInfo, tab) {
  if (!cartState || tabId !== cartState.tabId) return;
  if (changeInfo.status !== 'complete') return;
  if (cartState.clickSent) return;

  // Only act when the expected product page has loaded
  const item = cartState.items[cartState.currentIndex];
  if (!tab.url || !tab.url.includes(item.asin)) return;

  cartState.clickSent = true;

  // Give the page a moment for lazy-loaded elements, then click
  setTimeout(async () => {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'CLICK_ADD_TO_CART',
        quantity: item.quantity,
      });
    } catch (e) {
      // Content script not ready, skip item
    }

    // Wait for Amazon to process the cart addition, then advance
    setTimeout(() => advanceCart(), 3000);
  }, 1000);
}

function advanceCart() {
  if (!cartState) return;

  cartState.currentIndex++;
  cartState.clickSent = false;

  if (cartState.currentIndex >= cartState.items.length) {
    // All items processed — show the cart
    chrome.tabs.onUpdated.removeListener(cartTabListener);
    chrome.tabs.update(cartState.tabId, {
      url: 'https://www.amazon.com/cart',
    });
    cartState = null;
    return;
  }

  const prevItem = cartState.items[cartState.currentIndex - 1];
  const nextItem = cartState.items[cartState.currentIndex];

  if (prevItem.asin === nextItem.asin) {
    // Same product again — reload the page so onUpdated fires again
    chrome.tabs.reload(cartState.tabId);
  } else {
    chrome.tabs.update(cartState.tabId, {
      url: `https://www.amazon.com/dp/${nextItem.asin}`,
    });
  }
}

// Clean up if the user closes the cart tab mid-process
chrome.tabs.onRemoved.addListener((tabId) => {
  if (cartState && cartState.tabId === tabId) {
    chrome.tabs.onUpdated.removeListener(cartTabListener);
    cartState = null;
  }
});
