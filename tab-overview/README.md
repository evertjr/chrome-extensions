# Tab Overview Chrome Extension

Tab Overview is a Safari-style grid view for Chrome that shows all your open tabs as visual cards with live thumbnails. Instantly see, search, and switch between tabs in a beautiful, accessible overview.

## Features

- **Visual Grid:** See all your open tabs as cards with live thumbnails and titles.
- **Quick Search:** Instantly filter tabs by title or URL using the search bar.
- **Keyboard Navigation:** Navigate the grid and activate tabs using arrow keys and Enter/Space.
- **Close Tabs:** Close any tab directly from the overview.
- **Pinned Overview:** The overview opens as a pinned tab for easy access.
- **Fast Thumbnails:** Captures a real thumbnail of the current tab before opening the overview for the best accuracy.

## Installation

1. **Download or Clone the Repository**
   - Download this folder to your computer, or clone it with:
     ```
     git clone <repo-url>
     ```
2. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/` in your Chrome browser.
   - Enable **Developer mode** (toggle in the top right).
3. **Load the Extension**
   - Click **Load unpacked**.
   - Select the `tab-overview` folder inside this project.

## Usage

- **Open the Overview:**
  - Click the Tab Overview icon in your Chrome toolbar, or
  - Use the keyboard shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>0</kbd> (Windows/Linux) or <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>0</kbd> (Mac).
- **Search Tabs:**
  - Start typing in the search bar to filter tabs by title or URL.
- **Switch Tabs:**
  - Click any card to switch to that tab.
  - Use arrow keys to move between cards, and press <kbd>Enter</kbd> or <kbd>Space</kbd> to activate.
- **Close Tabs:**
  - Click the close (×) button on any card to close that tab.
- **Exit Overview:**
  - Press <kbd>Esc</kbd> to close the overview tab.

## Permissions

- `tabs`, `storage`, `activeTab`: Required to read tab info, store thumbnails, and switch/close tabs.

## Notes

- The extension captures a thumbnail of the current tab just before opening the overview for the most accurate preview.
- The overview opens as a pinned tab and reloads automatically to stay up to date.

---

Enjoy a faster, more visual way to manage your Chrome tabs!
