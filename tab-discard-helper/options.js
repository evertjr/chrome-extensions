import { getLocalizedText } from "./i18n.js";

/**
 * Load current settings into the options form on DOMContentLoaded.
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Set localized UI text
  document.getElementById("optionsTitle").textContent =
    getLocalizedText("optionsTitle");
  document.getElementById("idleLabelText").textContent =
    getLocalizedText("idleLabel");
  document.getElementById("whitelistLabelText").textContent =
    getLocalizedText("whitelistLabel");
  document.getElementById("whitelistExample").innerHTML =
    getLocalizedText("whitelistExample");
  document.getElementById("save").textContent = getLocalizedText("save");

  const { idleMinutes, whitelist } = await chrome.storage.sync.get({
    idleMinutes: 15,
    whitelist: [],
  });

  document.getElementById("idleMinutes").value = idleMinutes;
  document.getElementById("whitelist").value = whitelist.join("\n");
});

/**
 * Save settings from the form to storage when Save button is clicked.
 */
document.getElementById("save").addEventListener("click", () => {
  const idleMinutes =
    Number(document.getElementById("idleMinutes").value) || 15;
  const whitelist = document
    .getElementById("whitelist")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  chrome.storage.sync.set({ idleMinutes, whitelist }, () => {
    const status = document.getElementById("status");
    status.textContent = getLocalizedText("saved");
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
