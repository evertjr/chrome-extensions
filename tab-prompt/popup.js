(async () => {
  // Get the active tab in the current window
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const url = tab.url || "";
  const urlEl = document.getElementById("url");
  urlEl.textContent = url;

  // Load saved max length setting
  const { maxLength = 100000 } = await chrome.storage.sync.get({
    maxLength: 100000,
  });
  const maxLengthInput = document.getElementById("maxLength");
  maxLengthInput.value = maxLength;

  // Save max length setting when changed
  maxLengthInput.addEventListener("change", async () => {
    const newMaxLength = parseInt(maxLengthInput.value) || 100000;
    await chrome.storage.sync.set({ maxLength: newMaxLength });
  });

  // Get page content and update stats
  let pageContent = "";
  let pageTitle = "";

  try {
    // Inject content script to get page content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractPageContent,
    });

    if (results && results[0] && results[0].result) {
      const { title, content } = results[0].result;
      pageTitle = title;
      pageContent = content;
      updateStats(content.length);
    }
  } catch (error) {
    showInfo("Error extracting page content");
  }

  // Copy button functionality
  document.getElementById("copyBtn").addEventListener("click", async () => {
    if (!pageContent) {
      showInfo("No content to copy");
      return;
    }

    const currentMaxLength = parseInt(maxLengthInput.value) || 100000;
    let contentToCopy = pageContent;

    // Truncate if necessary
    if (contentToCopy.length > currentMaxLength) {
      contentToCopy = contentToCopy.substring(0, currentMaxLength);
    }

    // Format the content with page title
    const formattedContent = `<${pageTitle}>\n${contentToCopy}\n</${pageTitle}>`;

    try {
      await navigator.clipboard.writeText(formattedContent);
      showSuccessMessage();
    } catch (error) {
      // Fallback for older browsers or when clipboard API fails
      try {
        const textArea = document.createElement("textarea");
        textArea.value = formattedContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showSuccessMessage();
      } catch (fallbackError) {
        showInfo("Failed to copy to clipboard");
      }
    }
  });

  function updateStats(length) {
    const statsEl = document.getElementById("stats");
    const currentMaxLength = parseInt(maxLengthInput.value) || 100000;
    const willBeTruncated = length > currentMaxLength;
    const finalLength = willBeTruncated ? currentMaxLength : length;

    statsEl.textContent = `Characters: ${length.toLocaleString()}${
      willBeTruncated ? ` → ${finalLength.toLocaleString()} (truncated)` : ""
    }`;
  }

  function showSuccessMessage() {
    const successMsg = document.getElementById("successMessage");
    successMsg.style.display = "block";
    setTimeout(() => {
      successMsg.style.display = "none";
    }, 2000);
  }

  function showInfo(message) {
    const infoEl = document.getElementById("info");
    infoEl.textContent = message;
    setTimeout(() => {
      infoEl.textContent = "";
    }, 3000);
  }

  // Update stats when max length changes
  maxLengthInput.addEventListener("input", () => {
    if (pageContent) {
      updateStats(pageContent.length);
    }
  });
})();

// Function to be injected into the page to extract content
function extractPageContent() {
  // Get page title
  const title = document.title || "Untitled Page";

  // Remove script and style elements
  const elementsToRemove = document.querySelectorAll("script, style, noscript");
  const clonedDoc = document.cloneNode(true);
  const clonedElementsToRemove = clonedDoc.querySelectorAll(
    "script, style, noscript"
  );
  clonedElementsToRemove.forEach((el) => el.remove());

  // Get text content from body
  const body = clonedDoc.body || clonedDoc.documentElement;
  let textContent = body.textContent || body.innerText || "";

  // Clean up the text
  textContent = textContent
    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
    .replace(/\n\s*\n/g, "\n") // Replace multiple newlines with single newline
    .trim(); // Remove leading/trailing whitespace

  return {
    title: title,
    content: textContent,
  };
}
