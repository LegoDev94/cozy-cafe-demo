"use strict";

const cafeApiBase = document.querySelector('meta[name="cozy-api-base"]')?.content.replace(/\/+$/, "") || "";
const cafeDemo = document.querySelector('meta[name="cozy-demo"]')?.content === "true";
function cafeApiUrl(path) { return cafeApiBase + path; }

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");
function closeNavigation() {
  navigation?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
  const label = toggle?.querySelector(".sr-only");
  if (label) label.textContent = "Open navigation";
}
toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  navigation.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.querySelector(".sr-only").textContent = open ? "Close navigation" : "Open navigation";
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
    closeNavigation();
    toggle.focus();
  }
});
document.addEventListener("click", event => {
  if (!event.target.closest(".site-header")) closeNavigation();
});
window.matchMedia("(min-width: 601px)").addEventListener("change", closeNavigation);

const contactForm = document.querySelector("#contact-form");
if (contactForm && cafeDemo) {
  contactForm.querySelector(".form-privacy").textContent = "Demo form only. Use sample details; no message will be sent to the café.";
}
contactForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;
  const button = contactForm.querySelector("button[type=submit]");
  if (button.disabled) return;
  const status = document.querySelector("#form-status");
  const data = Object.fromEntries(new FormData(contactForm));
  button.disabled = true;
  button.textContent = "Sending your message…";
  status.dataset.state = "pending";
  status.textContent = "Sending…";
  try {
    const response = await fetch(cafeApiUrl("/api/contact"), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "same-origin",
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new Error(response.status === 429
        ? "A few messages arrived too quickly. Please wait a little before trying again."
        : typeof result.detail === "string" ? result.detail : "Please check your details and try again.");
    }
    contactForm.reset();
    status.dataset.state = "success";
    status.textContent = cafeDemo
      ? "Test message saved. This demonstration does not notify the café."
      : "Thank you! Your message has been received. We’re glad you reached out.";
  } catch (error) {
    status.dataset.state = "error";
    status.textContent = error.name === "TimeoutError" || error instanceof TypeError
      ? "We couldn’t confirm your message was received. Please call us if your enquiry is urgent."
      : error.message;
  } finally {
    button.disabled = false;
    button.replaceChildren(document.createTextNode("Send your message "));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.append(arrow);
  }
});
