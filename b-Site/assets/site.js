/* OneHistory 站点脚本：主题、滚动动效、说明页目录。
   首页的搜索/筛选逻辑在 index.html 内联（数据也内联在那里）。
   对外只暴露 window.OH = { motion, reveal }。 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var OH = window.OH = { motion: !reduce, reveal: reveal };

  // ---------------------------------------------------------- 主题
  // 首帧前已由 <head> 里的内联脚本定好，这里只处理切换
  var btn = document.getElementById("theme");
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("oh-theme", next); } catch (e) {}
    });
  }

  // ---------------------------------------------------------- 滚动
  var nav = document.querySelector(".nav");
  var bar = document.getElementById("bar");
  var hero = document.querySelector(".hero");
  var navH = 0;
  var ticking = false;

  function measure() {
    navH = nav ? nav.offsetHeight : 0;
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset || 0;

    if (nav) nav.classList.toggle("stuck", y > 4);
    if (bar) bar.classList.toggle("stuck", bar.getBoundingClientRect().top <= navH + 1);

    // 首屏视差：0（顶部）→ 1（首屏滚完）
    if (hero && !reduce) {
      var h = hero.offsetHeight || 1;
      var sy = y / h;
      root.style.setProperty("--sy", (sy < 0 ? 0 : sy > 1 ? 1 : sy).toFixed(3));
    }

    spy();
    ticking = false;
  }

  function requestTick() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScroll);
  }

  measure();
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", function () { measure(); requestTick(); }, { passive: true });

  // ---------------------------------------------------------- 卡片浮现
  var io = null;
  if (window.IntersectionObserver && !reduce) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  }

  /** 首页每次重新渲染卡片后调用 */
  function reveal(nodes) {
    var list = Array.prototype.slice.call(nodes || []);
    if (!io) {
      // 「减少动效」下不跟随滚动，整批一起淡入。
      // 先强制一次布局，让 opacity:0 的初始态真正被计算过，否则 0→1 会被合并掉、看不到过渡。
      // 这里不能用 requestAnimationFrame 延后：页面在后台标签时 rAF 不触发，
      // 卡片会一直停在 opacity:0，等于整个列表消失。
      void document.body.offsetWidth;
      list.forEach(function (n) { n.classList.add("in"); });
      return;
    }
    list.forEach(function (n) {
      n.classList.remove("in");
      // 已经在视口里的（首屏就能看到的那几张）直接放行，避免要滚一下才出现
      io.observe(n);
    });
    // 立刻判一次，处理"渲染时就已可见"的情况
    window.requestAnimationFrame(function () {
      list.forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          n.classList.add("in");
          io.unobserve(n);
        }
      });
    });
  }

  // ---------------------------------------------------------- 说明页
  var doc = document.getElementById("doc");
  var heads = [];
  var links = [];
  var tocBox = document.getElementById("toc");

  if (doc) {
    // 宽表格套一层横向滚动容器，手机上不会把页面撑破
    Array.prototype.forEach.call(doc.querySelectorAll("table"), function (t) {
      if (t.parentNode && t.parentNode.classList.contains("table-wrap")) return;
      var w = document.createElement("div");
      w.className = "table-wrap";
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    buildToc();
  }

  function slug(text, i) {
    var s = String(text).trim().toLowerCase()
      .replace(/[\s]+/g, "-")
      .replace(/[^\w一-龥-]/g, "");
    return s ? "h-" + s : "sec-" + i;
  }

  function buildToc() {
    var list = document.getElementById("toc-list");
    if (!list || !tocBox) return;

    heads = Array.prototype.slice.call(doc.querySelectorAll("h2, h3"));
    // 目录少于 2 条就没意义，收起右栏，正文居中
    if (heads.length < 2) {
      var rail = document.querySelector(".rail");
      if (rail) rail.classList.add("hidden");
      var g = document.querySelector(".page-grid");
      if (g) g.classList.add("no-toc");
      return;
    }

    var html = '<p class="toc-label">目录</p>';
    heads.forEach(function (h, i) {
      if (!h.id) h.id = slug(h.textContent, i);
      html += '<a href="#' + h.id + '" class="' + (h.tagName === "H3" ? "lv3" : "lv2") + '">' +
        h.textContent.replace(/[<>&]/g, "") + "</a>";
    });
    list.innerHTML = html;
    links = Array.prototype.slice.call(list.querySelectorAll("a"));

    // 桌面端常驻展开，手机端折叠成一个"目录"按钮
    var mq = window.matchMedia("(min-width: 1101px)");
    var sync = function () { tocBox.open = mq.matches; };
    sync();
    if (mq.addEventListener) mq.addEventListener("change", sync);
    else if (mq.addListener) mq.addListener(sync);

    list.addEventListener("click", function () {
      if (!mq.matches) tocBox.open = false;
    });

    spy();
  }

  /** 滚动高亮当前章节 */
  function spy() {
    if (!links.length) return;
    var line = navH + 80;
    var idx = 0;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= line) idx = i;
      else break;
    }
    // 拉到底部时直接点亮最后一条
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) idx = heads.length - 1;
    for (var j = 0; j < links.length; j++) links[j].classList.toggle("is-on", j === idx);
  }
})();
