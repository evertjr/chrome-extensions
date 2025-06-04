# Tab Prompt

A Chrome extension that extracts and copies page text content to clipboard in a structured format.

## Features

- **Extract Text Content**: Automatically extracts all text content from the current page, removing HTML tags and scripts
- **Customizable Length Limit**: Set a maximum character limit (default: 100,000 characters) with real-time character count
- **Structured Format**: Copies content in the format:
  ```
  <page-title>
  text content without html tags
  </page-title>
  ```
- **Clean Design**: Uses the same modern UI design as the Tab Discard Helper extension
- **Smart Text Cleaning**: Removes extra whitespace and normalizes line breaks
- **Clipboard Integration**: One-click copy to clipboard with success feedback

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `tab-prompt` folder
4. The extension icon will appear in your toolbar

## Usage

1. Navigate to any webpage
2. Click the Tab Prompt extension icon
3. Adjust the max length setting if needed (changes are automatically saved)
4. Click "Copy Page Content" to copy the formatted text to your clipboard
5. The extension shows character count and indicates if content will be truncated

## Permissions

- **activeTab**: To access the current tab's content
- **storage**: To save your max length preference
- **scripting**: To inject content extraction script
- **host_permissions**: To work on all websites

## Technical Details

- Uses Chrome Extension Manifest V3
- Implements content script injection for secure text extraction
- Fallback clipboard methods for maximum compatibility
- Persistent storage for user preferences
