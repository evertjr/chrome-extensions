(async () => {
  /* grab active tab */
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const url = tab.url || "";
  const urlEl = id("url");
  urlEl.textContent = url;

  /* ask background for status */
  const status = await chrome.runtime.sendMessage({
    cmd: "getStatus",
    tabId: tab.id,
    url,
  });

  render(status); // initial button labels

  /* ----- button actions ----- */
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
    render({ ...status, permanentlyWhitelisted: !isOn });
  };

  id("tempToggle").onclick = async () => {
    const res = await chrome.runtime.sendMessage({
      cmd: "toggleTempWhitelist",
      tabId: tab.id,
    });
    render({ ...status, tempWhitelisted: res.tempWhitelisted });
  };

  id("pauseToggle").onclick = async () => {
    const res = await chrome.runtime.sendMessage({ cmd: "togglePause" });
    render({ ...status, paused: res.paused });
  };

  /* ----- helpers ----- */
  function render(st) {
    id("permToggle").textContent = st.permanentlyWhitelisted
      ? "Remove from Permanent Whitelist"
      : "Add to Permanent Whitelist";

    id("tempToggle").textContent = st.tempWhitelisted
      ? "Remove Temporary Protection"
      : "Temporarily Protect This Tab";

    id("pauseToggle").textContent = st.paused
      ? "Resume Auto-Discard"
      : "Pause Auto-Discard";

    show(
      st.paused
        ? "Auto-discard is paused."
        : st.tempWhitelisted
        ? "This tab is protected until closed."
        : ""
    );
    Object.assign(status, st); // keep local copy up-to-date
  }

  function show(text) {
    id("info").textContent = text;
  }
  function id(x) {
    return document.getElementById(x);
  }
})();
