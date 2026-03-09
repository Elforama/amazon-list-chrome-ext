# Amazon Shopping List & Recipes

A Chrome extension that adds a shopping list and recipe system to Amazon. Save products while browsing, organize them into reusable recipes with quantity multipliers, and bulk add everything to your Amazon cart.

## Features

- **Shopping List** — Click "+ Add to Shopping List" on any Amazon product page to save it. Adjust quantities and see a running total in the popup.
- **Recipes** — Group products into named recipes (e.g. "Taco Night", "Weekly Smoothies"). Each recipe has a multiplier so you can scale quantities up or down.
- **Whole Foods Support** — On Whole Foods product pages, an "+ Add to Recipe" button lets you pick a recipe and add the item directly without opening the popup.
- **Bulk Add to Cart** — One click adds all items (from a shopping list or recipe) to your Amazon cart. The extension navigates to each product page and clicks "Add to Cart" automatically, respecting quantities.
- **Badge Count** — The extension icon shows the total number of items in your shopping list.

## Installation

1. Clone or download this repository:
   ```
   git clone https://github.com/Elforama/amazon-list-chrome-ext.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the cloned `amazon-list-chrome-ext` folder
6. The extension icon will appear in your toolbar — pin it for easy access

## Usage

### Adding Products

1. Navigate to any Amazon product page
2. Click the **+ Add to Shopping List** button below the "Add to Cart" button
3. On Whole Foods product pages, you'll also see an **+ Add to Recipe** button

### Managing Your Shopping List

1. Click the extension icon to open the popup
2. Adjust quantities with the **+** / **-** buttons
3. Remove items with the **x** button
4. Click **Add All to Amazon Cart** to add everything to your cart

### Creating Recipes

1. Open the popup and switch to the **Recipes** tab
2. Click **+ New Recipe** and give it a name
3. Add items from your shopping list or from the current Amazon page
4. Set a **multiplier** to scale all quantities (e.g. 2x doubles everything)
5. Click **Add to Cart** on a recipe to add its items to your Amazon cart

## Project Structure

```
├── manifest.json    # Extension config (Manifest V3)
├── background.js    # Service worker: badge updates + cart orchestration
├── content.js       # Content script: product extraction, button injection
├── content.css      # Styles for injected buttons, toasts, recipe picker
├── popup.html       # Extension popup UI
├── popup.js         # Popup logic: list/recipe management
├── popup.css        # Popup styles
└── icons/           # Extension icons (16, 48, 128px)
```

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist shopping list and recipes locally |
| `activeTab` | Read product data from the current Amazon tab |
| `tabs` | Open cart tabs and orchestrate add-to-cart flow |
| `https://www.amazon.com/*` | Access Amazon product pages |
