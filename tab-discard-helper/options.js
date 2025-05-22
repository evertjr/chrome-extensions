// Load current settings into the form
document.addEventListener("DOMContentLoaded", async () => {
  const { idleMinutes, whitelist } = await chrome.storage.sync.get({
    idleMinutes: 15,
    whitelist: [],
  });

  document.getElementById("idleMinutes").value = idleMinutes;
  document.getElementById("whitelist").value = whitelist.join("\n");
});

// Save button
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
    status.textContent = "Saved!";
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
