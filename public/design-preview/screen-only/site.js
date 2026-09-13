(() => {
  const toast = document.querySelector("[data-toast]");
  const toastMessage = document.querySelector("[data-toast-message]");
  let toastTimer;
  const showToast = (message) => {
    if (!toast) return;
    if (toastMessage) toastMessage.textContent = message || "暂未开放真实下载与外部服务";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  };
  document.querySelectorAll("[data-demo-message]").forEach((button) => button.addEventListener("click", () => showToast(button.dataset.demoMessage)));
  document.querySelector("[data-toast-close]")?.addEventListener("click", () => toast?.classList.remove("show"));
  addEventListener("load", () => {
    if (!location.hash) return;
    window.setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 80);
  });
  const page = document.querySelector(".exact-site");
  if (page && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let scheduled = false;
    const update = () => { const max = Math.max(1, document.documentElement.scrollHeight - innerHeight); page.style.setProperty("--scroll-progress", String(scrollY / max)); scheduled = false; };
    addEventListener("scroll", () => { if (scheduled) return; scheduled = true; requestAnimationFrame(update); }, { passive: true });
    update();
  }
})();
