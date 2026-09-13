"use strict";

(() => {
  const root = document.querySelector(".dish-menu");
  if (!root) return;

  const cards = [...root.querySelectorAll(".dish-card")];
  const sections = [...root.querySelectorAll("[data-dish-section]")];
  const categories = [...root.querySelectorAll("[data-dish-category]")];
  const search = root.querySelector("#dish-search");
  const clearSearch = root.querySelector(".dish-search-clear");
  const picksToggle = root.querySelector(".dish-picks-toggle");
  const picksCount = root.querySelector(".dish-picks-count");
  const resultCount = root.querySelector(".dish-result-count");
  const empty = root.querySelector(".dish-empty");
  const feedback = root.querySelector(".dish-feedback");
  const copyButton = root.querySelector(".dish-copy-link");
  const validIds = new Set(cards.map(card => card.dataset.dishId));
  const storageKey = "cozy-cafe-menu-picks-v1";
  let saved = new Set();
  let category = "all";
  let picksOnly = false;
  let searchTimer;
  let feedbackTimer;
  let storageAvailable = true;

  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(value)) saved = new Set(value.filter(id => validIds.has(id)));
  } catch {
    storageAvailable = false;
  }

  function announce(message) {
    clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedbackTimer = setTimeout(() => { feedback.textContent = ""; }, 6500);
  }

  function savePicks() {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...saved]));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  function updateAddress() {
    const url = new URL(location.href);
    if (category === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", category);
    if (search.value.trim()) url.searchParams.set("q", search.value.trim());
    else url.searchParams.delete("q");
    // Picks belong to this browser; a shared menu link must work for everyone.
    url.searchParams.delete("picks");
    try { history.replaceState(null, "", url); } catch { /* A file preview can still filter. */ }
  }

  function showResults() {
    const controls = root.querySelector(".dish-controls");
    const stickyOffset = parseFloat(getComputedStyle(controls).top) || 0;
    // Filtering a long menu must not strand the visitor at the page footer.
    const top = root.getBoundingClientRect().top + window.scrollY - stickyOffset - 8;
    window.scrollTo({top: Math.max(0, top), behavior: "instant"});
  }

  function render(updateUrl = true) {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    cards.forEach(card => {
      const {dishId, dishKind, dishName} = card.dataset;
      const selected = saved.has(dishId);
      const visible = (category === "all" || category === dishKind)
        && (!picksOnly || selected)
        && words.every(word => dishName.toLocaleLowerCase().includes(word));
      card.hidden = !visible;
      if (visible) count += 1;
      const favorite = card.querySelector(".dish-favorite");
      favorite.setAttribute("aria-pressed", String(selected));
      favorite.setAttribute("aria-label", selected ? `Remove ${dishName} from your picks` : `Save ${dishName} to your picks`);
    });
    sections.forEach(section => {
      section.hidden = ![...section.querySelectorAll(".dish-card")].some(card => !card.hidden);
    });
    categories.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.dishCategory === category)));
    picksToggle.setAttribute("aria-pressed", String(picksOnly));
    picksCount.textContent = String(saved.size);
    root.querySelector(".dish-picks-note").hidden = !picksOnly || saved.size === 0;
    root.querySelector(".dish-picks-note p").textContent = storageAvailable
      ? "Your picks are saved in this browser. Ask our team about prices and availability when you visit."
      : "Your picks are available for this visit; this browser cannot save them. Ask our team about prices and availability.";
    clearSearch.hidden = search.value.length === 0;
    empty.hidden = count > 0;
    const hasFilters = category !== "all" || words.length > 0;
    if (picksOnly && saved.size === 0) {
      empty.querySelector("h2").textContent = "Your next favorite is waiting.";
      empty.querySelector("p").textContent = "Tap the heart on anything that catches your eye. Your picks will be here when you need a little inspiration.";
    } else {
      empty.querySelector("h2").textContent = picksOnly ? "No picks match this view." : "No matches just yet.";
      empty.querySelector("p").textContent = picksOnly
        ? "Try a different category or search, or explore the full menu to find something new."
        : "Try another search or explore the full menu. There’s something lovely waiting for you.";
    }
    resultCount.textContent = picksOnly
      ? `${count} of ${saved.size} ${saved.size === 1 ? "pick" : "picks"}${hasFilters ? " in this view" : " for your next visit"}`
      : hasFilters ? `${count} of ${cards.length} menu items` : `${cards.length} good things to choose from`;
    if (updateUrl) updateAddress();
  }

  function readAddress() {
    const query = new URLSearchParams(location.search);
    category = categories.some(button => button.dataset.dishCategory === query.get("category")) ? query.get("category") : "all";
    search.value = (query.get("q") || "").slice(0, 100);
    render(false);
  }

  root.querySelectorAll("button[disabled], input[disabled]").forEach(control => { control.disabled = false; });
  categories.forEach(button => button.addEventListener("click", () => {
    category = button.dataset.dishCategory;
    render();
    showResults();
  }));
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });
  clearSearch.addEventListener("click", () => {
    search.value = "";
    search.focus();
    render();
  });
  picksToggle.addEventListener("click", () => {
    picksOnly = !picksOnly;
    // Enter the complete saved selection; subsequent category/search filters combine normally.
    category = "all";
    search.value = "";
    render();
    showResults();
  });
  root.querySelector(".dish-reset").addEventListener("click", () => {
    category = "all";
    search.value = "";
    picksOnly = false;
    render();
    showResults();
    categories[0].focus();
  });
  root.querySelector(".dish-clear-picks").addEventListener("click", () => {
    saved.clear();
    savePicks();
    render(false);
    picksToggle.focus();
    announce("Your picks have been cleared.");
  });
  cards.forEach(card => card.querySelector(".dish-favorite").addEventListener("click", () => {
    const {dishId, dishName} = card.dataset;
    const removed = saved.delete(dishId);
    if (!removed) saved.add(dishId);
    savePicks();
    render(false);
    announce(`${dishName} ${removed ? "removed from" : "added to"} your picks.${storageAvailable ? "" : " Saved for this visit only."}`);
    if (card.hidden) {
      const next = cards.find(item => !item.hidden)?.querySelector(".dish-favorite");
      (next || picksToggle).focus();
    }
  }));

  copyButton.addEventListener("click", async () => {
    const url = new URL(location.href);
    url.hash = "browse-menu";
    url.searchParams.delete("picks");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url.href);
      announce(picksOnly ? "Menu link copied. Your personal picks stay in this browser." : "Menu link copied. Send a little inspiration to someone.");
    } catch {
      announce("To share this menu, copy the address from your browser’s address bar.");
    }
  });
  window.addEventListener("popstate", readAddress);
  window.addEventListener("storage", event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const value = JSON.parse(event.newValue || "[]");
      saved = new Set(Array.isArray(value) ? value.filter(id => validIds.has(id)) : []);
      render(false);
    } catch { /* Keep this tab's picks if storage has been edited outside the menu. */ }
  });
  readAddress();
})();
