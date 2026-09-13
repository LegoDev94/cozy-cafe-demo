"use strict";

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const header = document.querySelector(".site-header");
  const progress = document.createElement("div");
  progress.className = "reading-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);
  let scrollQueued = false;
  function updateFrame() {
    scrollQueued = false;
    header?.classList.toggle("is-scrolled", window.scrollY > 25);
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const value = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    progress.style.transform = `scaleX(${value})`;
  }
  function queueFrame() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateFrame);
  }
  window.addEventListener("scroll", queueFrame, { passive: true });
  window.addEventListener("resize", queueFrame, { passive: true });
  window.addEventListener("load", queueFrame);
  updateFrame();

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("reveal-arrived");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    document.querySelectorAll(".section-heading, .feature-card, .story-photo, .story-copy, .values-grid article, .small-story > *, .contact-extras > *, .visit-banner").forEach(node => observer.observe(node));
  }

  const scene = document.querySelector(".hero-scene");
  if (!scene) return;
  const play = scene.querySelector(".scene-play");
  let desiredX = 0;
  let desiredY = 0;
  let currentX = 0;
  let currentY = 0;
  let motionFrame = 0;
  let celebrationTimer;

  function drawScene() {
    motionFrame = 0;
    currentX += (desiredX - currentX) * 0.09;
    currentY += (desiredY - currentY) * 0.09;
    scene.style.setProperty("--scene-x", `${currentX * 6}deg`);
    scene.style.setProperty("--scene-y", `${-currentY * 5}deg`);
    scene.style.setProperty("--cup-x", `${currentX * 10}px`);
    scene.style.setProperty("--cup-y", `${currentY * 8}px`);
    scene.style.setProperty("--pastry-x", `${currentX * -14}px`);
    scene.style.setProperty("--pastry-y", `${currentY * -10}px`);
    if (Math.abs(desiredX - currentX) > 0.001 || Math.abs(desiredY - currentY) > 0.001) {
      motionFrame = requestAnimationFrame(drawScene);
    }
  }
  function queueScene() {
    if (!motionFrame) motionFrame = requestAnimationFrame(drawScene);
  }
  function resetScene() {
    desiredX = desiredY = 0;
    if (reducedMotion.matches) currentX = currentY = 0;
    queueScene();
  }
  scene.addEventListener("pointermove", event => {
    if (reducedMotion.matches || !finePointer.matches || event.pointerType !== "mouse") return;
    const rect = scene.getBoundingClientRect();
    desiredX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    desiredY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    queueScene();
  }, { passive: true });
  scene.addEventListener("pointerleave", resetScene, { passive: true });
  reducedMotion.addEventListener("change", resetScene);
  finePointer.addEventListener("change", resetScene);
  window.addEventListener("blur", resetScene);
  if (play) {
    play.hidden = false;
    play.addEventListener("click", () => {
      clearTimeout(celebrationTimer);
      scene.classList.remove("scene-celebrate");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scene.classList.add("scene-celebrate");
        celebrationTimer = window.setTimeout(() => scene.classList.remove("scene-celebrate"), 1400);
      }));
    });
  }
})();
