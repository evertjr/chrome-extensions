import { getLocalizedText } from "./i18n.js";

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
      show({ text: getLocalizedText("cannotDiscard"), margin: 0.1 });
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

  id("settingsBtn").setAttribute("aria-label", getLocalizedText("settings"));
  id("settingsBtn").setAttribute("title", getLocalizedText("settings"));
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
    // Discard Button
    const discardBtn = id("discard");
    const discardLabel = discardBtn.querySelector(".btn-label");
    discardBtn.setAttribute("aria-label", getLocalizedText("discard"));
    discardBtn.setAttribute("title", getLocalizedText("discard"));
    discardLabel.textContent = getLocalizedText("discard");
    // Permanent Whitelist Button
    const permBtn = id("permToggle");
    const permIcon = id("permIcon");
    const permIconMinus = id("permIconMinus");
    const permLabel = permBtn.querySelector(".btn-label");
    if (st.permanentlyWhitelisted) {
      permBtn.setAttribute("aria-label", getLocalizedText("unwhitelist"));
      permBtn.setAttribute("title", getLocalizedText("unwhitelist"));
      permIcon.style.display = "none";
      permIconMinus.style.display = "block";
      permLabel.textContent = getLocalizedText("unwhitelist");
    } else {
      permBtn.setAttribute("aria-label", getLocalizedText("whitelist"));
      permBtn.setAttribute("title", getLocalizedText("whitelist"));
      permIcon.style.display = "block";
      permIconMinus.style.display = "none";
      permLabel.textContent = getLocalizedText("whitelist");
    }
    // Temporary Whitelist Button
    const tempBtn = id("tempToggle");
    const tempIcon = id("tempIcon");
    const tempIconOff = id("tempIconOff");
    const tempLabel = tempBtn.querySelector(".btn-label");
    if (st.tempWhitelisted) {
      tempBtn.setAttribute("aria-label", getLocalizedText("unprotect"));
      tempBtn.setAttribute("title", getLocalizedText("unprotect"));
      tempIcon.style.display = "none";
      tempIconOff.style.display = "block";
      tempLabel.textContent = getLocalizedText("unprotect");
    } else {
      tempBtn.setAttribute("aria-label", getLocalizedText("protect"));
      tempBtn.setAttribute("title", getLocalizedText("protect"));
      tempIcon.style.display = "block";
      tempIconOff.style.display = "none";
      tempLabel.textContent = getLocalizedText("protect");
    }
    // Pause/Resume Button
    const pauseBtn = id("pauseToggle");
    const pauseIcon = id("pauseIcon");
    const resumeIcon = id("resumeIcon");
    const pauseLabel = id("pauseLabel");
    if (st.paused) {
      pauseBtn.setAttribute("aria-label", getLocalizedText("resume"));
      pauseBtn.setAttribute("title", getLocalizedText("resume"));
      pauseIcon.style.display = "none";
      resumeIcon.style.display = "block";
      pauseLabel.textContent = getLocalizedText("resume");
      pauseIcon.style.filter = "grayscale(0) brightness(0.7)";
    } else {
      pauseBtn.setAttribute("aria-label", getLocalizedText("pause"));
      pauseBtn.setAttribute("title", getLocalizedText("pause"));
      pauseIcon.style.display = "block";
      resumeIcon.style.display = "none";
      pauseLabel.textContent = getLocalizedText("pause");
      pauseIcon.style.filter = "none";
    }
    show(
      st.paused
        ? { text: getLocalizedText("pausedMsg"), margin: 0.5 }
        : st.tempWhitelisted
        ? { text: getLocalizedText("protectedMsg"), margin: 0.5 }
        : { text: "", margin: 0.1 }
    );
  }

  /**
   * Show a message in the info area.
   * @param {object} param0
   */
  function show({ text, margin }) {
    const info = id("info");
    info.textContent = text;
    info.style.marginTop = margin + "rem";
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
