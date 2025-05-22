// Tab Overview – Grid UI for Chrome Extension

(async () => {
  const grid = document.getElementById("grid");
  const search = document.getElementById("search");

  /**
   * Set the search bar placeholder using i18n, fallback to English if needed.
   */
  try {
    const { getSearchPlaceholder } = await import("./i18n.js");
    search.placeholder = getSearchPlaceholder();
  } catch (e) {
    search.placeholder = "Search tabs";
    console.error("Could not load i18n module:", e);
  }

  /* ------------------------------------------------------------------ */
  /* focus search bar reliably                                         */
  search.focus(); // browsers sometimes ignore autofocus
  /* ------------------------------------------------------------------ */

  const overviewURL = chrome.runtime.getURL("overview.html");
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(
    (tab) => tab.url !== overviewURL
  );
  const thumbs = await chrome.storage.local.get(
    tabs.map((t) => "thumb_" + t.id)
  );

  /**
   * Build card elements for each tab.
   * @param {Object} tab - Chrome tab object
   * @returns {HTMLDivElement} Card element
   */
  const cards = tabs.map((tab) => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "listitem");
    card.dataset.tabId = tab.id; // Store tab ID for closing

    /* --- info (close button, favicon, title) at top --- */
    const info = document.createElement("div");
    info.className = "info";

    /* close button */
    const closeBtn = document.createElement("div");
    closeBtn.className = "close-btn";
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
    closeBtn.setAttribute("aria-label", "Close tab");
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.tabs.remove(tab.id);
      card.remove();
      chrome.storage.local.remove("thumb_" + tab.id);
    };
    info.appendChild(closeBtn);

    /* favicon */
    if (tab.favIconUrl?.startsWith("http")) {
      const icon = document.createElement("img");
      icon.src = tab.favIconUrl;
      icon.onerror = () => icon.remove(); // no broken glyph
      info.appendChild(icon);
    } else {
      info.classList.add("no-icon");
    }

    /* title */
    const title = document.createElement("span");
    title.textContent = tab.title || tab.url;
    title.setAttribute("title", tab.title || tab.url); // Add tooltip on hover
    info.appendChild(title);

    card.appendChild(info);

    /* -------- thumbnail -------- */
    const img = document.createElement("img");
    img.className = "thumb";
    const thumbData = thumbs["thumb_" + tab.id];
    // Handle both new (object with data) and old (direct string) formats
    const thumbSrc = thumbData?.data || thumbData;

    if (thumbSrc) {
      img.src = thumbSrc;
    } else {
      /* placeholder shows first letter of hostname */
      const host = new URL(tab.url).hostname || "?";
      img.alt = host;
      img.style.objectFit = "cover";
      img.style.background = "#333";
      // Don't set height/width here, let the CSS class handle it
      img.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 400 250'><rect width='400' height='250' fill='%23333'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='96' fill='%23999' font-family='system-ui, -apple-system, sans-serif'>${host[0].toUpperCase()}</text></svg>`
        );
    }
    card.appendChild(img);

    /* --- tab activation on click --- */
    card.onclick = () => chrome.tabs.update(tab.id, { active: true });

    /* data for search */
    card.dataset.title = (tab.title || "").toLowerCase();
    card.dataset.url = (tab.url || "").toLowerCase();

    return card;
  });

  // Batch DOM updates with DocumentFragment
  const frag = document.createDocumentFragment();
  cards.forEach((c) => frag.appendChild(c));
  grid.appendChild(frag);

  /**
   * Get currently visible cards (not filtered out by search).
   * @returns {HTMLDivElement[]} Array of visible card elements
   */
  const visibleCards = () => cards.filter((c) => c.style.display !== "none");

  search.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    cards.forEach((card) => {
      const match =
        !term ||
        card.dataset.title.includes(term) ||
        card.dataset.url.includes(term);
      card.style.display = match ? "" : "none";
    });
  });

  /* -------- keyboard navigation ------------------------------------- */
  let focusIndex = -1; // start with NONE focused

  /**
   * Move focus in the grid by direction.
   * @param {string} direction - 'up', 'down', 'left', 'right'
   */
  function move(direction) {
    const vis = visibleCards();
    if (!vis.length) return;

    /* choose starting card when entering grid with arrows */
    if (focusIndex === -1) focusIndex = 0;

    const current = vis[focusIndex];
    const rect0 = current.getBoundingClientRect();

    // Check if we're in the top row for the "up" direction
    if (direction === "up") {
      // Find if there's any card above this one
      const anyCardAbove = vis.some((card) => {
        const rect = card.getBoundingClientRect();
        return rect.top < rect0.top - 5;
      });

      // If no cards above and we're going up, move focus to search
      if (!anyCardAbove) {
        focusIndex = -1; // Reset focus index
        vis.forEach((c) => (c.tabIndex = -1)); // Make all cards non-tabbable
        search.focus();
        return;
      }
    }

    const closest = (filter) => {
      let best,
        bestDist = Infinity;
      vis.forEach((el, idx) => {
        if (!filter(el)) return;
        const r = el.getBoundingClientRect();
        const dx = r.left - rect0.left;
        const dy = r.top - rect0.top;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          best = idx;
        }
      });
      return best;
    };

    switch (direction) {
      case "right":
        focusIndex = (focusIndex + 1) % vis.length;
        break;
      case "left":
        focusIndex = (focusIndex - 1 + vis.length) % vis.length;
        break;
      case "down":
        focusIndex =
          closest((el) => el.getBoundingClientRect().top > rect0.top + 5) ??
          focusIndex;
        break;
      case "up":
        focusIndex =
          closest((el) => el.getBoundingClientRect().top < rect0.top - 5) ??
          focusIndex;
        break;
    }

    // Update tabindex and set focus
    vis.forEach((card, idx) => {
      card.tabIndex = idx === focusIndex ? 0 : -1;
    });
    vis[focusIndex].focus();
  }

  /* arrow keys from search ► grid */
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      const visible = visibleCards();
      if (visible.length) {
        e.preventDefault();
        e.stopPropagation(); // Prevent window handler from running
        // Sort cards by visual position (top, then left)
        const sortedVisible = [...visible].sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          if (rectA.top < rectB.top) return -1;
          if (rectA.top > rectB.top) return 1;
          if (rectA.left < rectB.left) return -1;
          if (rectA.left > rectB.left) return 1;
          return 0;
        });
        visible.forEach((c) => (c.tabIndex = -1));
        focusIndex = visible.indexOf(sortedVisible[0]);
        sortedVisible[0].tabIndex = 0;
        sortedVisible[0].focus();
      }
      return;
    }

    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      e.stopPropagation(); // Prevent window handler from running
      move(e.key.slice(5).toLowerCase());
    }
  });

  /* arrows / space / enter while cards focused */
  window.addEventListener("keydown", (e) => {
    const map = {
      ArrowRight: "right",
      ArrowLeft: "left",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    if (map[e.key]) {
      e.preventDefault();
      move(map[e.key]);
    }
    if (
      (e.key === "Enter" || e.key === " ") &&
      document.activeElement?.classList.contains("card")
    ) {
      e.preventDefault();
      document.activeElement.click();
    }
    // Keyboard close: Delete or Backspace on a card
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      document.activeElement?.classList.contains("card")
    ) {
      e.preventDefault();
      const card = document.activeElement;
      const tabId = Number(card.dataset.tabId);
      if (tabId) {
        chrome.tabs.remove(tabId);
        // Remove card from DOM and cards array
        const cardIndex = cards.indexOf(card);
        card.remove();
        cards.splice(cardIndex, 1);
        // Find next visible card to focus
        const vis = cards.filter((c) => c.style.display !== "none");
        let nextFocus = null;
        if (vis.length) {
          // Try to focus the next card, or previous if at end
          let nextIdx = vis.findIndex((c) => c.tabIndex === 0);
          if (nextIdx === -1) nextIdx = cardIndex;
          if (nextIdx >= vis.length) nextIdx = vis.length - 1;
          if (nextIdx < 0) nextIdx = 0;
          nextFocus = vis[nextIdx] || vis[0];
          nextFocus.tabIndex = 0;
          nextFocus.focus();
          focusIndex = cards.indexOf(nextFocus);
        } else {
          // No cards left, focus search
          search.focus();
          focusIndex = -1;
        }
      }
    }
  });

  /* ------- Handle tab updates and removals ----- */
  chrome.tabs.onRemoved.addListener((tabId) => {
    // Clean up any cards for tabs that were closed externally
    const cardToRemove = Array.from(grid.children).find(
      (card) => card.dataset.tabId == tabId
    );
    if (cardToRemove) cardToRemove.remove();
  });

  // === Esc switches back to previous tab instead of closing ===========
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      chrome.runtime.sendMessage({ type: "tabOverview:switchBack" });
    }
  });

  /**
   * Close the overview tab safely, retrying if needed.
   * @param {number} tabId - The tab ID to close.
   * @param {number} [delay=200] - Delay in ms.
   * @param {boolean} [retried=false] - Whether this is a retry.
   */
  function closeSelfSafely(tabId, delay = 200, retried = false) {
    setTimeout(() => {
      chrome.tabs.remove(tabId).catch((err) => {
        // First attempt can fail while Chrome thinks the tab is being dragged.
        if (!retried && err?.message?.includes("dragging")) {
          // Try once more a bit later.
          closeSelfSafely(tabId, 200, true);
        }
      });
    }, delay);
  }

  /* -------------------------------------------------------------
     When the Overview tab becomes visible again, rebuild the grid
  -------------------------------------------------------------*/
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      location.reload(); // simplest: reload to pull fresh tab list + thumbs
    } else {
      chrome.tabs.getCurrent((t) => {
        if (t?.id) closeSelfSafely(t.id);
      });
    }
  });
})();
