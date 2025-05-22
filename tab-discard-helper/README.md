# Tab Discard Helper Chrome Extension

Tab Discard Helper is a Chrome extension designed to help you manage memory and CPU usage by automatically discarding (unloading) inactive tabs, or by giving you quick manual control over tab discarding. This helps keep your browser fast and responsive, especially with many open tabs.

## Features

- **Auto-Discard Tabs:** Automatically discards tabs that haven't been used for a while (if enabled).
- **Manual Discard:** Instantly discard any tab with a click or shortcut to free up resources.
- **Whitelist:** Prevent important tabs from being discarded.
- **Status Indicator:** See which tabs are currently discarded or active.
- **Restore Tabs:** Reload discarded tabs with a single click.

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
   - Select the `tab-discard-helper` folder inside this project.

## Usage

- **Manual Discard:**
  - Click the extension icon to discard the current tab, or use the provided keyboard shortcut.
- **Auto-Discard:**
  - Enable auto-discard in the extension options (if available).
- **Whitelist Tabs:**
  - Add sites or tabs to the whitelist to prevent them from being discarded.
- **Restore Tabs:**
  - Click on a discarded tab to reload it instantly.

## Permissions

- `tabs`: Required to read and manage tab states.
- `storage`: To save your settings and whitelist.

## Notes

- Discarded tabs free up memory and CPU, but their content is reloaded when you revisit them.
- Whitelisted tabs will always remain active.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

Developed by Evert Junior.

Keep Chrome running smoothly with Tab Discard Helper!
