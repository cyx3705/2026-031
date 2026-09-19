(function () {
  const root = document.documentElement;
  const btn = document.getElementById("theme");
  const apply = (t) => {
    root.setAttribute("data-theme", t);
    if (btn) btn.textContent = t === "dark" ? "深色" : "浅色";
    try { localStorage.setItem("oh-theme", t); } catch (e) {}
  };
  let initial = "dark";
  try { initial = localStorage.getItem("oh-theme") || "dark"; } catch (e) {}
  apply(initial);
  if (btn) {
    btn.addEventListener("click", () => {
      apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }
})();
