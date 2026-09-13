"use strict";

(() => {
  const CART_KEY = "cozy-order-cart-v1";
  const PENDING_KEY = "cozy-order-pending-v1";
  const form = document.querySelector("#order-form");
  if (form && cafeDemo) {
    form.querySelector(".order-submit-note").textContent = "Demo checkout only. No payment, café notification or fulfilment.";
    form.querySelector(".order-privacy").textContent = "Please use sample contact details to try this demonstration.";
  }
  const catalogStatus = document.querySelector("[data-order-catalog-status]");
  const feedback = document.querySelector("[data-order-feedback]");
  const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let catalog = null;
  let cart = [];
  let pending = null;
  let submittedBody = null;
  let busy = false;
  let uncertain = false;
  let conflict = false;
  let storageWorks = true;
  let loadingCatalog = false;
  let receipt = null;
  let checkingStatus = false;
  let catalogError = "";

  function cleanCart(value) {
    if (!Array.isArray(value)) return [];
    const counts = new Map();
    let remaining = 50;
    for (const item of value) {
      if (!item || !idPattern.test(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
      const current = counts.get(item.id) || 0;
      const add = Math.min(item.quantity, 20 - current, remaining);
      if (add > 0) { counts.set(item.id, current + add); remaining -= add; }
    }
    return [...counts].map(([id, quantity]) => ({id, quantity}));
  }

  function cleanPending(value) {
    return value && uuidPattern.test(value.request_id) && typeof value.menu_revision === "string"
      && value.menu_revision.length > 0 && value.menu_revision.length <= 200 && Array.isArray(value.items) && cleanCart(value.items).length > 0
      ? {request_id: value.request_id, menu_revision: value.menu_revision, items: cleanCart(value.items)} : null;
  }

  function readSaved() {
    try {
      cart = cleanCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      pending = cleanPending(saved);
      if (pending) cart = pending.items;
    } catch { storageWorks = false; }
    // Only item IDs and quantities travel in this fallback. Customer data never does.
    if (!storageWorks && !pending) {
      try {
        const sharedCart = new URLSearchParams(location.hash.slice(1)).get("basket");
        if (sharedCart) cart = cleanCart(JSON.parse(sharedCart));
      } catch { /* An invalid fragment cannot prevent the menu from loading. */ }
    }
  }

  function storeCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    catch { storageWorks = false; }
    if (!storageWorks && form) {
      const url = new URL(location.href);
      url.hash = cart.length ? new URLSearchParams({basket: JSON.stringify(cart)}).toString() : "";
      try { history.replaceState(null, "", url); } catch { /* In-memory basket remains usable. */ }
    }
  }

  function savePending() {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch { storageWorks = false; }
  }

  function tell(message) {
    if (feedback) feedback.textContent = message;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function money(cents, currency = catalog?.currency || "USD") {
    if (!Number.isSafeInteger(cents) || cents < 0) return "Price to confirm";
    return new Intl.NumberFormat("en-US", {style: "currency", currency}).format(cents / 100);
  }

  function lineInfo(line) {
    const item = catalog?.byId.get(line.id);
    return {item, available: !!item?.available, name: item?.name || line.id.replaceAll("-", " "),
      price: item?.price_cents ?? null};
  }

  function total() {
    if (!cart.length) return {count: 0, cents: null, pending: false};
    let count = 0;
    let cents = 0;
    let pricePending = false;
    for (const line of cart) {
      count += line.quantity;
      const price = lineInfo(line).price;
      if (price === null) pricePending = true;
      else cents += price * line.quantity;
    }
    return {count, cents: pricePending ? null : cents, pending: pricePending};
  }

  function locked() { return busy || !!pending; }

  function makeQuantityButton(label, action, id, disabled) {
    const button = element("button", "order-quantity-button", label);
    button.type = "button";
    button.dataset.orderAction = action;
    button.dataset.orderId = id;
    button.disabled = disabled;
    button.setAttribute("aria-label", `${action === "plus" ? "Add one" : "Remove one"} ${lineInfo({id}).name}`);
    return button;
  }

  function renderLines(container) {
    const focused = document.activeElement?.closest("[data-order-action]");
    const focusKey = focused && container.contains(focused) ? [focused.dataset.orderId, focused.dataset.orderAction] : null;
    container.replaceChildren();
    cart.forEach(line => {
      const info = lineInfo(line);
      const row = element("article", "order-line");
      row.dataset.orderLine = line.id;
      const image = element("img", "order-line-image");
      image.src = `assets/menu/${line.id}.png`;
      image.alt = "";
      image.width = 100; image.height = 100;
      image.loading = "lazy";
      image.addEventListener("error", () => { image.hidden = true; }, {once: true});
      const content = element("div", "order-line-content");
      content.append(element("h3", "", info.name));
      const priceText = !catalog ? catalogError ? "Menu unavailable" : "Checking menu…" : !info.item ? "No longer on the menu" : !info.available ? "Currently unavailable" : `${money(info.price)}${info.price === null ? "" : " each"}`;
      content.append(element("p", info.available ? "order-line-unit" : "order-line-unit order-line-unavailable", priceText));
      const quantity = element("div", "order-quantity");
      quantity.setAttribute("aria-label", `Quantity for ${info.name}`);
      quantity.append(makeQuantityButton("−", "minus", line.id, locked() || line.quantity <= 1));
      const count = element("span", "order-quantity-value", String(line.quantity));
      count.setAttribute("aria-label", `${line.quantity} items`);
      quantity.append(count, makeQuantityButton("+", "plus", line.id, locked() || !info.available || line.quantity >= 20 || total().count >= 50));
      const remove = element("button", "order-remove", "Remove");
      remove.type = "button"; remove.dataset.orderAction = "remove"; remove.dataset.orderId = line.id;
      remove.disabled = locked(); remove.setAttribute("aria-label", `Remove ${info.name} from your order`);
      const controls = element("div", "order-line-controls");
      controls.append(quantity, remove);
      content.append(controls);
      const sum = element("strong", "order-line-total", info.price === null ? "To confirm" : money(info.price * line.quantity));
      row.append(image, content, sum);
      container.append(row);
    });
    if (focusKey) {
      const replacement = [...container.querySelectorAll("[data-order-action]")].find(button => button.dataset.orderId === focusKey[0] && button.dataset.orderAction === focusKey[1] && !button.disabled);
      (replacement || container.querySelector("[data-order-action]:not(:disabled)"))?.focus({preventScroll: true});
    }
  }

  function renderPending() {
    const panel = document.querySelector("[data-order-pending]");
    if (!panel) return;
    panel.hidden = !pending;
    if (!pending) return;
    panel.querySelector("[data-order-request-reference]").textContent = pending.request_id;
    panel.querySelector("[data-order-pending-message]").textContent = busy
      ? "Saving your order request. Please keep this page open while we confirm the result."
      : conflict ? "This reference belongs to a request with different details. We have stopped retries to prevent changing or duplicating that request. Check its status or contact the café."
      : submittedBody ? "We haven’t confirmed whether your request was saved. Retry the same request or check its status. Your basket and details are held to prevent a duplicate."
      : "This page was reopened before the result was confirmed. Contact details were not stored in your browser. Check the request status below; your basket is held to prevent a duplicate.";
    const retry = panel.querySelector("[data-order-retry]");
    retry.hidden = !submittedBody || busy || conflict;
    retry.disabled = busy || checkingStatus;
    panel.querySelector("[data-order-check-status]").disabled = busy || checkingStatus;
  }

  function render() {
    const sum = total();
    const hasItems = cart.length > 0;
    document.querySelectorAll("[data-order-count]").forEach(node => { node.textContent = String(sum.count); });
    document.querySelectorAll("[data-order-nav]").forEach(node => node.setAttribute("aria-label", `Your order, ${sum.count} ${sum.count === 1 ? "item" : "items"}`));
    if (!storageWorks) document.querySelectorAll('a[href^="order.html"], a[href^="menu.html"]').forEach(link => {
      const destination = link.getAttribute("href").split("#")[0];
      link.href = `${destination}${hasItems ? `#${new URLSearchParams({basket: JSON.stringify(cart)})}` : ""}`;
    });
    document.querySelectorAll("[data-order-subtotal]").forEach(node => { node.textContent = hasItems ? money(sum.cents) : "—"; });
    document.querySelectorAll("[data-order-price]").forEach(node => {
      const item = catalog?.byId.get(node.dataset.orderPrice);
      node.textContent = !catalog ? catalogError ? "Price unavailable" : "Checking menu…" : !item?.available ? "Unavailable today" : money(item.price_cents);
    });
    document.querySelectorAll("[data-order-add]").forEach(button => {
      const id = button.dataset.orderAdd;
      const item = catalog?.byId.get(id);
      const quantity = cart.find(line => line.id === id)?.quantity || 0;
      button.disabled = !item?.available || locked() || quantity >= 20 || sum.count >= 50;
      button.replaceChildren(document.createTextNode(quantity ? `Add another · ${quantity}` : "Add to order"), element("span", "", "+"));
      button.lastElementChild.setAttribute("aria-hidden", "true");
      button.setAttribute("aria-label", `Add ${item?.name || id.replaceAll("-", " ")} to your order${quantity ? `, ${quantity} already added` : ""}`);
    });
    document.querySelectorAll("[data-order-lines]").forEach(renderLines);
    document.querySelectorAll("[data-order-menu-basket], [data-order-mobile]").forEach(node => { node.hidden = !hasItems; });
    document.body.classList.toggle("has-order-basket", hasItems && !!document.querySelector("[data-order-mobile]"));
    const checkout = document.querySelector("[data-order-checkout]");
    if (checkout) checkout.hidden = !hasItems || !!receipt;
    const empty = document.querySelector("[data-order-empty]");
    if (empty) empty.hidden = hasItems || !!receipt || !!pending;
    document.querySelectorAll("[data-order-price-note]").forEach(node => {
      node.hidden = !catalog?.prices_provisional;
      node.textContent = "Preview prices · To be confirmed";
    });
    const note = document.querySelector("[data-order-total-note]");
    if (note) note.textContent = cafeDemo
      ? "Demonstration prices. Test orders are saved without payment or café notification."
      : sum.pending
      ? "One or more prices need confirmation. The café will confirm the full amount before you proceed."
      : catalog?.prices_provisional ? "Preview prices are provisional. The café will confirm availability and the final amount." : "Your request is subject to availability and confirmation.";
    if (form) {
      form.querySelector("fieldset").disabled = locked();
      form.querySelector("[type=submit]").disabled = !hasItems || !catalog || locked() || cart.some(line => !lineInfo(line).available);
      form.querySelector("[type=submit]").textContent = busy ? "Saving your request…" : "Send order request ↗";
    }
    renderPending();
    if (pending && !form) tell("An order request is awaiting confirmation. Open Your order to check its status before making changes.");
  }

  function renderCatalogStatus() {
    if (!catalogStatus) return;
    catalogStatus.replaceChildren();
    catalogStatus.hidden = !!catalog && !catalogError && !loadingCatalog;
    if (catalogStatus.hidden) return;
    catalogStatus.append(document.createTextNode(loadingCatalog ? "Checking today’s menu…" : catalogError || "Menu information is unavailable."));
    if (!loadingCatalog) {
      const retry = element("button", "order-retry-menu", "Try again");
      retry.type = "button";
      retry.addEventListener("click", () => loadCatalog());
      catalogStatus.append(retry);
    }
  }

  async function loadCatalog() {
    if (loadingCatalog) return;
    loadingCatalog = true; catalogError = "";
    renderCatalogStatus();
    try {
      const response = await fetch(cafeApiUrl("/api/menu"), {credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000)});
      const data = await response.json();
      if (!response.ok || data.currency !== "USD" || typeof data.revision !== "string" || !Array.isArray(data.items)) throw new Error("Invalid menu");
      const items = data.items.filter(item => item && idPattern.test(item.id) && typeof item.name === "string" && typeof item.available === "boolean" && (item.price_cents === null || Number.isSafeInteger(item.price_cents) && item.price_cents >= 0));
      if (items.length !== data.items.length || !items.length) throw new Error("Invalid menu items");
      const oldRevision = catalog?.revision;
      catalog = {...data, byId: new Map(items.map(item => [item.id, item]))};
      if (oldRevision && oldRevision !== catalog.revision) tell("The menu has changed. Please review the current prices and availability before sending your request.");
    } catch {
      catalog = null;
      catalogError = "We couldn’t load current prices and availability. Your basket is still here. Please try again.";
    } finally {
      loadingCatalog = false;
      renderCatalogStatus(); render();
    }
  }

  function changeCart(id, action) {
    if (locked()) { tell("Please check your pending order before changing the basket."); return; }
    const index = cart.findIndex(line => line.id === id);
    const item = catalog?.byId.get(id);
    if (action === "remove") { if (index !== -1) cart.splice(index, 1); }
    else if (action === "minus") { if (index !== -1 && cart[index].quantity > 1) cart[index].quantity -= 1; }
    else {
      if (!item?.available) return;
      if (total().count >= 50 || (index !== -1 && cart[index].quantity >= 20)) { tell("You can request up to 20 of one item and 50 items in total."); return; }
      if (index === -1) cart.push({id, quantity: 1}); else cart[index].quantity += 1;
    }
    storeCart(); render();
    if (!cart.length && form) document.querySelector("[data-order-empty] a")?.focus({preventScroll: true});
    tell(`${item?.name || "Item"} ${action === "remove" ? "removed from" : "updated in"} your order.${storageWorks ? "" : " Your basket is kept in the link for this visit."}`);
  }

  function makeRequestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function showReceipt(order) {
    if (!order || !order.id || !Array.isArray(order.items) || order.status !== "received") throw new Error("Receipt could not be verified");
    receipt = order;
    const submittedItems = pending?.items;
    if (!submittedItems || JSON.stringify(cart) === JSON.stringify(submittedItems)) cart = [];
    pending = null; submittedBody = null; uncertain = false; conflict = false; busy = false;
    savePending(); storeCart();
    form?.reset();
    const section = document.querySelector("[data-order-receipt]");
    if (section) {
      section.hidden = false;
      section.querySelector("[data-order-receipt-id]").textContent = String(order.id);
      const lines = section.querySelector("[data-order-receipt-items]");
      lines.replaceChildren();
      order.items.forEach(item => {
        const row = element("div", "order-receipt-line");
        row.append(element("span", "", `${item.quantity} × ${item.name}`), element("strong", "", money(item.line_total_cents, order.currency)));
        lines.append(row);
      });
      section.querySelector("[data-order-receipt-total]").textContent = money(order.subtotal_cents, order.currency);
      section.querySelector("[data-order-receipt-pricing]").textContent = order.pricing_pending ? "The café will confirm the full price." : order.prices_provisional ? "Preview prices · To be confirmed" : "Final arrangements are subject to confirmation.";
    }
    const demoOrder = cafeDemo || order.demo_mode;
    if (section && demoOrder) {
      section.querySelector(".order-receipt-status").textContent = "Test order saved. No payment or café notification.";
      section.querySelector(".order-receipt-next").textContent = "This is a demonstration. Your sample order has been recorded so you can try the checkout; it will not be fulfilled.";
    }
    tell(demoOrder ? "Test order saved. No payment or café notification." : "Order request saved. Awaiting confirmation.");
    render();
    // Hiding checkout changes the layout. Scroll only after that change, so the
    // old form height cannot send the visitor past their receipt to the footer.
    if (section) {
      section.focus({preventScroll: true});
      section.scrollIntoView({block: "start", behavior: "instant"});
    }
  }

  async function submitExact(body, isRetry = false) {
    if (busy) return;
    busy = true; render();
    const status = document.querySelector("#order-form-status");
    if (status) status.textContent = "Saving your order request…";
    try {
      const response = await fetch(cafeApiUrl("/api/orders"), {method: "POST", credentials: "same-origin", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: AbortSignal.timeout(18000)});
      const data = await response.json();
      if (response.ok && data.ok === true) { showReceipt(data.order); return; }
      if (data.code === "idempotency_conflict") {
        conflict = true; uncertain = true;
        if (status) status.textContent = "This request reference has conflicting details. Check its status or contact the café.";
      } else if (!isRetry && response.status >= 400 && response.status < 500) {
        pending = null; submittedBody = null; savePending();
        if (data.code === "menu_changed") {
          await loadCatalog();
          tell("The menu has changed. Review the updated prices and availability, then send your request again.");
          if (status) status.textContent = "Please review the updated menu before sending.";
        } else if (status) status.textContent = typeof data.detail === "string" ? data.detail : "Please check your details and try again.";
      } else {
        uncertain = true;
        if (status) status.textContent = "We couldn’t confirm the result. Your request reference has been kept for a safe retry.";
      }
    } catch {
      uncertain = true;
      if (status) status.textContent = "The connection was interrupted. We haven’t confirmed whether your request was saved. Use the status check or retry below.";
    } finally {
      busy = false;
      render();
      if (uncertain) document.querySelector("[data-order-pending]")?.scrollIntoView({block: "start", behavior: "smooth"});
    }
  }

  async function checkStatus() {
    if (!pending || checkingStatus || busy) return;
    checkingStatus = true; renderPending();
    const reference = pending.request_id;
    try {
      const response = await fetch(cafeApiUrl(`/api/orders/${encodeURIComponent(reference)}/status`), {credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000)});
      const data = await response.json();
      if (response.ok && data.ok === true) { showReceipt(data.order); return; }
      tell(response.status === 404
        ? "No saved receipt is available yet. The earlier request may still be processing. Check again or contact the café with your reference."
        : "We couldn’t check the request status. Please try again shortly.");
    } catch { tell("We couldn’t reach the café’s website to check. Your request reference is still saved."); }
    finally { checkingStatus = false; renderPending(); }
  }

  document.addEventListener("click", event => {
    const add = event.target.closest("[data-order-add]");
    if (add && !add.disabled) changeCart(add.dataset.orderAdd, "plus");
    const action = event.target.closest("[data-order-action]");
    if (action && !action.disabled) changeCart(action.dataset.orderId, action.dataset.orderAction);
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (locked() || !catalog || !cart.length) return;
    const phone = form.elements.phone;
    const email = form.elements.email;
    phone.setCustomValidity(""); email.setCustomValidity("");
    if (!phone.value.trim() && !email.value.trim()) phone.setCustomValidity("Please provide a phone number or email address.");
    if (phone.value.trim() && (!/^\+?[0-9 ()-]{7,30}$/.test(phone.value.trim()) || phone.value.replace(/\D/g, "").length < 7)) phone.setCustomValidity("Please enter a valid phone number, including the area code.");
    if (!form.reportValidity()) return;
    if (cart.some(line => !lineInfo(line).available)) { tell("Please remove unavailable items before sending your request."); return; }
    // Another tab may have started a request since this page last rendered.
    try {
      const other = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (cleanPending(other)) { readSaved(); uncertain = true; render(); tell("An order request was started in another tab. Please check its status."); return; }
    } catch { storageWorks = false; }
    const body = {request_id: makeRequestId(), menu_revision: catalog.revision, items: cart.map(item => ({...item})), customer: {name: form.elements.name.value.trim(), phone: phone.value.trim(), email: email.value.trim()}, notes: form.elements.notes.value.trim(), website: form.elements.website.value};
    submittedBody = body;
    pending = {request_id: body.request_id, menu_revision: body.menu_revision, items: body.items};
    savePending();
    if (!storageWorks) tell("This browser cannot save the request reference. Keep this page open until the result is confirmed.");
    await submitExact(body);
  });
  form?.elements.phone.addEventListener("input", () => { form.elements.phone.setCustomValidity(""); });
  form?.elements.email.addEventListener("input", () => { form.elements.phone.setCustomValidity(""); form.elements.email.setCustomValidity(""); });
  document.querySelector("[data-order-retry]")?.addEventListener("click", () => { if (submittedBody && !conflict) submitExact(submittedBody, true); });
  document.querySelector("[data-order-check-status]")?.addEventListener("click", checkStatus);
  document.querySelector("[data-order-copy-receipt]")?.addEventListener("click", async () => {
    if (!receipt) return;
    const lines = ["Cozy Cafe order request", `Reference: ${receipt.id}`, ...receipt.items.map(item => `${item.quantity} x ${item.name} - ${money(item.line_total_cents, receipt.currency)}`), `Subtotal: ${money(receipt.subtotal_cents, receipt.currency)}`, receipt.prices_provisional ? "Preview prices - to be confirmed" : "Awaiting confirmation"];
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(lines.join("\n"));
      tell("Order summary copied. You can share it with the café to confirm your request.");
    } catch { tell("Please select and copy the reference and order summary shown above."); }
  });
  window.addEventListener("beforeunload", event => {
    if (pending && (busy || uncertain) && submittedBody) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("storage", event => {
    if (![CART_KEY, PENDING_KEY, null].includes(event.key) || busy) return;
    if (pending && submittedBody && event.key === CART_KEY) return;
    readSaved();
    if (pending) uncertain = true;
    render();
  });
  readSaved();
  uncertain = !!pending;
  render();
  loadCatalog();
  if (pending && form) checkStatus();
})();
