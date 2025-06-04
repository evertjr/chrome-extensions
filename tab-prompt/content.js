// Content script for Tab Prompt extension
// This script runs in the context of web pages

// Currently, the main functionality is handled via script injection from popup.js
// This file is included for future extensibility and to match the manifest structure

// Listen for messages from the extension popup if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    const title = document.title || "Untitled Page";

    // Create a clone to avoid modifying the actual page
    const clonedDoc = document.cloneNode(true);
    const elementsToRemove = clonedDoc.querySelectorAll(
      "script, style, noscript"
    );
    elementsToRemove.forEach((el) => el.remove());

    // Get text content from body
    const body = clonedDoc.body || clonedDoc.documentElement;
    let textContent = body.textContent || body.innerText || "";

    // Clean up the text
    textContent = textContent
      .replace(/\s+/g, " ") // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, "\n") // Replace multiple newlines with single newline
      .trim(); // Remove leading/trailing whitespace

    sendResponse({
      title: title,
      content: textContent,
    });
  }

  return true; // Keep the message channel open for async response
});
