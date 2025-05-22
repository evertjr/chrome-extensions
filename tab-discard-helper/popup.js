(async () => {
  // Get the active tab in the current window
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const url = tab.url || "";
  const urlEl = id("url");
  urlEl.textContent = url;

  // Query background for current status
  let status = await chrome.runtime.sendMessage({
    cmd: "getStatus",
    tabId: tab.id,
    url,
  });
  render(status);

  // Button actions
  id("discard").onclick = async () => {
    try {
      await chrome.tabs.discard(tab.id);
      window.close();
    } catch {
      show("Cannot discard this tab.");
    }
  };

  id("permToggle").onclick = async () => {
    const { whitelist = [] } = await chrome.storage.sync.get({ whitelist: [] });
    const host = new URL(url).hostname;
    const isOn = whitelist.some((p) => url.includes(p));
    const newList = isOn
      ? whitelist.filter((p) => p !== host && p !== url)
      : [...whitelist, host];
    await chrome.storage.sync.set({ whitelist: newList });
    status = { ...status, permanentlyWhitelisted: !isOn };
    render(status);
  };

  id("tempToggle").onclick = async () => {
    const res = await chrome.runtime.sendMessage({
      cmd: "toggleTempWhitelist",
      tabId: tab.id,
    });
    status = { ...status, tempWhitelisted: res.tempWhitelisted };
    render(status);
  };

  id("pauseToggle").onclick = async () => {
    const res = await chrome.runtime.sendMessage({ cmd: "togglePause" });
    status = { ...status, paused: res.paused };
    render(status);
  };

  id("settingsBtn").onclick = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  /**
   * Render the popup UI based on current status.
   * @param {Object} st - Status object
   */
  function render(st) {
    // Permanent Whitelist Button
    const permBtn = id("permToggle");
    const permIcon = id("permIcon");
    const permLabel = permBtn.querySelector(".btn-label");
    if (st.permanentlyWhitelisted) {
      permBtn.setAttribute("aria-label", "Remove from Permanent Whitelist");
      permBtn.setAttribute("title", "Remove from Permanent Whitelist");
      permIcon.style.filter = "grayscale(0) brightness(0.7)";
      permLabel.textContent = "Whitelist Tab";
    } else {
      permBtn.setAttribute("aria-label", "Add to Permanent Whitelist");
      permBtn.setAttribute("title", "Add to Permanent Whitelist");
      permIcon.style.filter = "none";
      permLabel.textContent = "Whitelist Tab";
    }
    // Temporary Whitelist Button
    const tempBtn = id("tempToggle");
    const tempIcon = id("tempIcon");
    const tempLabel = tempBtn.querySelector(".btn-label");
    if (st.tempWhitelisted) {
      tempBtn.setAttribute("aria-label", "Remove Temporary Protection");
      tempBtn.setAttribute("title", "Remove Temporary Protection");
      tempIcon.style.filter = "grayscale(0) brightness(0.7)";
      tempLabel.textContent = "Protect Tab";
    } else {
      tempBtn.setAttribute("aria-label", "Protect Tab");
      tempBtn.setAttribute("title", "Protect Tab");
      tempIcon.style.filter = "none";
      tempLabel.textContent = "Protect Tab";
    }
    // Pause/Resume Button
    const pauseBtn = id("pauseToggle");
    const pauseIcon = id("pauseIcon");
    const resumeIcon = id("resumeIcon");
    const pauseLabel = id("pauseLabel");
    if (st.paused) {
      pauseBtn.setAttribute("aria-label", "Resume Auto Discard");
      pauseBtn.setAttribute("title", "Resume Auto Discard");
      pauseIcon.style.display = "none";
      resumeIcon.style.display = "block";
      pauseLabel.textContent = "Resume Auto Discard";
      pauseIcon.style.filter = "grayscale(0) brightness(0.7)";
    } else {
      pauseBtn.setAttribute("aria-label", "Pause Auto Discard");
      pauseBtn.setAttribute("title", "Pause Auto Discard");
      pauseIcon.style.display = "block";
      resumeIcon.style.display = "none";
      pauseLabel.textContent = "Pause Auto Discard";
      pauseIcon.style.filter = "none";
    }
    show(
      st.paused
        ? "Auto-discard is paused."
        : st.tempWhitelisted
        ? "This tab is protected until closed."
        : ""
    );
  }

  /**
   * Show a message in the info area.
   * @param {string} text
   */
  function show(text) {
    id("info").textContent = text;
  }
  /**
   * Shorthand for getElementById.
   * @param {string} x
   * @returns {HTMLElement}
   */
  function id(x) {
    return document.getElementById(x);
  }
})();
