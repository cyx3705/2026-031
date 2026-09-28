/*
 * OneHistory 首页介绍动画（约 68 秒，120 BPM，时长随 History 模块数量按小节伸缩）
 *
 * 纯 Canvas 2D，无依赖。每一帧只由时间 t 决定，可任意跳帧，也能逐帧离线渲染成视频。
 * 分组、计数、模块家族与模块介绍全部从站点生成物推导（规则与首页一致），新增项目不用改这里：
 *   - projects.json            → 分组、时间线、卡片
 *   - p/<编号>/index.html      → History 模块的定位 / 角色 / 指令域 / 能力（README 统一 8 节格式）
 *
 *   var details = OHIntro.parsePage(html);                       // 每个模块页解析一次
 *   var intro = OHIntro.create(canvas, { projects, details: {id: details}, logo, theme: "dark" });
 *   intro.render(12.5);                                         // 画第 12.5 秒
 *
 * 画布按 1920×1080 的虚拟坐标绘制，按 canvas 实际像素等比缩放。
 */
(function (root) {
  "use strict";

  var VW = 1920, VH = 1080;
  var CW = 332, CH = 172;           // 卡片基准尺寸
  var RAIL_Y = 990, RAIL_X0 = 250, RAIL_X1 = 1670;
  // 节拍：120 BPM，一拍 0.5 秒、一小节 2 秒。各段起点都落在小节线上，配乐（synth.mjs）按同一张表下鼓点
  var BEAT = 0.5, BAR = 2;
  var DWELL = BAR;                  // 每个 History 模块的聚焦时长：一小节
  var FOCUS0 = BAR;                 // 模块段开头留一小节给架构图成形

  // 与 b-Site/assets/site.css 的设计变量一致（浅色 = HistoryAurora 1.27.1 三层台阶：底色 → 卡片 → 条带越往上越深）
  // glow 是光晕/粒子/闪光用色：深色直接用主题色；浅色的主题色压到 #7F5E0F 过 AA，拿来做光会发脏，光晕改用原来的亮金
  var THEMES = {
    dark: {
      bg: "#121414", surface: "#1D201F", surface2: "#191C1B",
      text: "#E2DAC6", text2: "#ACA593", accent: [217, 164, 65], glow: [217, 164, 65], glowK: 1,
      hair: "#2A2D2C", hair2: "#343936", shadow: "rgba(0,0,0,0.5)", bgRGB: [18, 20, 20]
    },
    light: {
      bg: "#FBFAF7", surface: "#F3F1EC", surface2: "#EBE9E4",
      text: "#26231E", text2: "#6A6458", accent: [127, 94, 15], glow: [214, 160, 52], glowK: 0.9,
      hair: "#E5E3DE", hair2: "#D5D1C8", shadow: "rgba(38,35,30,0.13)", bgRGB: [251, 250, 247]
    }
  };

  var FONT_NUM = "Outfit, \"Noto Sans SC\", \"Segoe UI\", sans-serif";
  var FONT_CN = "\"Noto Sans SC\", \"Microsoft YaHei\", \"Segoe UI\", sans-serif";
  var GH_PATH = "M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-1-.9-1.2-.9-1.2-.7-.5 0-.5 0-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.6.8.6 1.6v2.3c0 .2.1.5.6.4A8 8 0 0 0 8 .2z";

  // ---------- 小工具 ----------
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix(a, b, k) { return a + (b - a) * k; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function smooth(a, b, t) { var k = seg(t, a, b); return k * k * (3 - 2 * k); }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function bump(x, w) { var d = Math.abs(x) / (w || 1); return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(4)) + ")"; }
  function unique(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 分组规则与首页 groupOf 一致：编号前四位是年份，0000 是模板，其余归「其他」
  function groupOf(p) {
    var m = String(p.id).match(/^(\d{4})/);
    if (!m) return { key: "other", label: "其他", order: 99999 };
    if (m[1] === "0000") return { key: "0000", label: "模板", order: 0 };
    return { key: m[1], label: m[1], order: +m[1] };
  }
  function isModule(p) { return !p.ext && /^History/.test(p.name); }

  // 从项目说明页（README 统一 8 节）取模块介绍：定位首句、角色、指令域、界面、能力表
  function parsePage(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    function section(name) {
      var out = [], hs = doc.querySelectorAll("h2");
      for (var i = 0; i < hs.length; i++) {
        if (hs[i].textContent.trim() !== name) continue;
        for (var n = hs[i].nextElementSibling; n && n.tagName !== "H2"; n = n.nextElementSibling) out.push(n);
      }
      return out;
    }
    function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
    function noParen(s) { return clean(s).replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim(); }
    var d = { position: "", role: "", domain: "", ui: "", caps: [] };
    section("定位").some(function (el) {
      if (el.tagName !== "P") return false;
      var s = clean(el.textContent);
      var m = s.match(/^[^。]*。/);
      d.position = (m ? m[0] : s).replace(/[：:]$/, "。");
      var e = s.match(/名字取自[^。]*/); // 有些模块在定位里写了名字的来历
      if (e) d.etym = e[0].replace(/——.*$/, "").replace(/[，,；;]$/, "") + "。";
      return true;
    });
    section("概况").forEach(function (el) {
      if (el.tagName !== "TABLE") return;
      el.querySelectorAll("tbody tr").forEach(function (tr) {
        var td = tr.querySelectorAll("td");
        if (td.length < 2) return;
        var k = clean(td[0].textContent), v = td[1].textContent;
        if (k === "角色") d.role = noParen(v).replace(/，/g, " · ");
        if (k === "指令域") d.domain = (clean(v).match(/^[a-z0-9]+/i) || [""])[0];
        if (k === "界面") d.ui = noParen(v);
        if (k === "角色" && /kind=host/.test(v)) d.host = true;
      });
    });
    section("能力").forEach(function (el) {
      if (el.tagName !== "TABLE") return;
      el.querySelectorAll("tbody tr").forEach(function (tr) {
        var td = tr.querySelectorAll("td");
        if (td.length < 2) return;
        d.caps.push({ k: clean(td[0].textContent), use: clean(td[td.length - 1].textContent) });
      });
    });
    return d;
  }

  // 各段起点（秒），全部落在小节线上。只有模块段的长度随模块数变化：成形 1 小节 + 每模块 1 小节 + 全员上线 2 小节
  function timeline(moduleCount) {
    var S = { hero: 0, num: 6, y1: 12, mod: 20 };
    S.modLen = FOCUS0 + moduleCount * DWELL + 2 * BAR;
    S.wall = S.mod + S.modLen;
    S.search = S.wall + 2 * BAR;
    S.tpl = S.search + 3 * BAR;
    S.end = S.tpl + 3 * BAR;
    S.drop = S.end + BAR;             // 汇聚落点：全片最重的一拍
    S.dur = S.drop + 3 * BAR;
    return S;
  }

  // 底鼓时刻表。画面的脉动与配乐的底鼓共用这一张表
  //   编号段：前 4 秒半拍（每秒一下），计数弹出后四拍，最后一小节让给军鼓滚奏
  //   第一个年份 → 搜索前：四拍；搜索段：抽掉，命中落定那一拍回来、半拍；模板段：四拍直到汇聚
  function kickTimes(S) {
    var k = [], t;
    for (t = S.num; t < S.num + 4 - 1e-6; t += 1) k.push(t);
    for (t = S.num + 4; t < S.y1 - BAR / 2 - 1e-6; t += BEAT) k.push(t);
    for (t = S.y1; t < S.search - 1e-6; t += BEAT) k.push(t);
    for (t = S.search + 2.5; t < S.tpl - 1e-6; t += 1) k.push(t);
    for (t = S.tpl; t < S.end - 1e-6; t += BEAT) k.push(t);
    k.push(S.drop);
    return k.map(function (x) { return +x.toFixed(3); });
  }

  function create(canvas, opts) {
    var ctx = canvas.getContext("2d");
    var C = THEMES[opts.theme] || THEMES.dark;
    var ACC = C.accent, GL = C.glow;
    function glow(a) { return rgba(GL, a * C.glowK); }
    var logo = opts.logo;
    var gh = new Path2D(GH_PATH);
    var rnd = mulberry32(20260928);
    var details = opts.details || {};

    // ---------- 数据 ----------
    var projects = opts.projects.map(function (p) {
      var q = {}; for (var k in p) q[k] = p[k];
      q.g = groupOf(p);
      q.d = details[p.id] || null;
      return q;
    });
    projects.sort(function (a, b) {
      if (a.g.order !== b.g.order) return a.g.order - b.g.order;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var N = projects.length;

    var groups = [];
    projects.forEach(function (p) {
      var g = groups.length && groups[groups.length - 1];
      if (!g || g.key !== p.g.key) { g = { key: p.g.key, label: p.g.label, items: [] }; groups.push(g); }
      g.items.push(p);
    });
    function group(key) { for (var i = 0; i < groups.length; i++) if (groups[i].key === key) return groups[i]; return { key: key, label: key, items: [] }; }
    var years = groups.filter(function (g) { return /^\d{4}$/.test(g.key) && g.key !== "0000"; });
    var firstYear = years.length ? years[0] : group("2025");
    var lastYear = years.length ? years[years.length - 1] : group("2026");
    var templates = group("0000").items;
    var others = group("other").items;

    // History 模块：宿主居中（角色为 kind=host），其余按编号环绕；聚焦顺序宿主在前
    var modules = projects.filter(isModule);
    var hub = modules.filter(function (p) { return p.d && p.d.host; })[0] || null;
    var sats = modules.filter(function (p) { return p !== hub; });
    var spotlight = (hub ? [hub] : []).concat(sats);
    var S = timeline(spotlight.length);
    var DUR = S.dur;
    var KICKS = kickTimes(S);
    var MOD_END = S.mod + FOCUS0 + spotlight.length * DWELL;   // 全员上线小节的起点

    // 底鼓脉动：最近一次底鼓后指数衰减，0..1
    function kick(t) {
      var last = -1;
      for (var i = 0; i < KICKS.length && KICKS[i] <= t; i++) last = KICKS[i];
      return last < 0 ? 0 : Math.exp(-(t - last) * 9);
    }
    // 段落落点的镜头冲击：[时刻, 强度]
    var IMPACTS = [[S.y1, 1], [S.mod, 0.6], [S.wall, 0.7], [S.search + 2.5, 0.6], [S.tpl, 0.5], [S.drop, 1.6]]
      .concat(spotlight.map(function (_, j) { return [S.mod + FOCUS0 + j * DWELL, 0.3]; }))
      .concat([[MOD_END, 0.9], [MOD_END + BAR, 0.4]]);
    function impact(t, rate) {
      var s = 0;
      IMPACTS.forEach(function (m) { if (t >= m[0]) s += m[1] * Math.exp(-(t - m[0]) * (rate || 7)); });
      return s;
    }

    // 时间轴上的位置：组与组之间留空
    (function () {
      var GAP = 2.4, slots = (N - 1) + GAP * (groups.length - 1), step = (RAIL_X1 - RAIL_X0) / Math.max(1, slots), s = 0;
      groups.forEach(function (g, gi) {
        if (gi) s += GAP;
        g.items.forEach(function (p) { p.rx = RAIL_X0 + s * step; p.ri = projects.indexOf(p); s += 1; });
        s -= 1;
      });
    })();

    // ---------- 文字排版（字体此时已加载） ----------
    function tokens(s) { return String(s).match(/[⺀-鿿　-〿＀-￯]|[^\s⺀-鿿　-〿＀-￯]+|\s+/g) || []; }
    function ellipsize(s, max) {
      s = String(s || "");
      if (ctx.measureText(s).width <= max) return s;
      var a = Array.from(s);
      while (a.length && ctx.measureText(a.join("") + "…").width > max) a.pop();
      return a.join("").replace(/[\s，、：]+$/, "") + "…";
    }
    function wrap(s, max, lines) {
      var out = [], cur = "", tk = tokens(s), cut = false;
      for (var i = 0; i < tk.length; i++) {
        var next = cur + tk[i];
        // 避头：标点不放到行首，宁可让上一行略超一点
        if (ctx.measureText(next).width <= max || !cur.trim() || /^[、，。：；！？）」』》,.:;!?)]$/.test(tk[i])) { cur = next; continue; }
        out.push(cur.trim()); cur = tk[i].trim();
        if (out.length === lines) { cut = true; break; }
      }
      if (!cut && cur.trim()) out.push(cur.trim());
      if (cut) out[lines - 1] = ellipsize(out[lines - 1] + "……", max);
      return out;
    }
    ctx.save();
    projects.forEach(function (p) {
      ctx.font = "600 24px " + FONT_CN; p.nameFit = ellipsize(p.name, CW - 44);
      ctx.font = "400 15px " + FONT_CN; p.noteLines = wrap(p.note || "", CW - 44, 2);
      if (!isModule(p)) return;
      var d = p.d || { position: p.note || "", role: "", domain: "", ui: "", caps: [] };
      ctx.font = "400 23px " + FONT_CN; p.posLines = wrap(d.position || p.note || "", 740, 3);
      ctx.font = "600 17px " + FONT_NUM;
      p.capRows = d.caps.slice(0, 5).map(function (c) {
        ctx.font = "600 17px " + FONT_NUM; var k = ellipsize(c.k, 196);
        ctx.font = "400 18px " + FONT_CN; var u = ellipsize(c.use, 520);
        return { k: k, use: u };
      });
      p.moreCaps = Math.max(0, d.caps.length - 5);
      ctx.font = "400 15px " + FONT_CN; p.uiFit = ellipsize(d.ui, 300);
    });
    ctx.restore();

    var dust = [];
    for (var i = 0; i < 64; i++) dust.push({ x: rnd() * VW, y: rnd() * VH, v: 6 + rnd() * 16, a: 0.04 + rnd() * 0.12, r: 0.8 + rnd() * 1.8, ph: rnd() * 6.28, f: 0.2 + rnd() * 0.4 });

    // 搜索演示用的关键词：命中项跨年份，最能说明「一个搜索框查全部」
    var QUERY = "AGV";
    var hits = projects.filter(function (p) { return (p.id + " " + p.name + " " + p.note + " " + p.repo).toLowerCase().indexOf(QUERY.toLowerCase()) >= 0; }).slice(0, 5);

    // ---------- 基础绘制 ----------
    function text(s, x, y, font, color, align) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(s, x, y);
    }
    function morph(dot, rect, k) {
      var e = ease(clamp01(k));
      var w = mix(7, rect.w, e), h = mix(7, rect.h, e);
      var cx = mix(dot.x, rect.x + rect.w / 2, e), cy = mix(dot.y, rect.y + rect.h / 2, e) - Math.sin(Math.PI * e) * 70;
      return { x: cx - w / 2, y: cy - h / 2, w: w, h: h, r: mix(3.5, 16, e), content: smooth(0.6, 1, k) };
    }
    function lerpRect(a, b, k) {
      var e = ease(clamp01(k));
      return { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e) - Math.sin(Math.PI * e) * 40, w: mix(a.w, b.w, e), h: mix(a.h, b.h, e), r: 16, content: 1 };
    }
    function railY(t) { return mix(700, RAIL_Y, ease(seg(t, S.num + 5.2, S.num + 6.2))); }
    function railDot(p, t) { return { x: p.rx, y: railY(t) }; }

    function drawDot(R) {
      ctx.fillStyle = rgba(ACC, 0.95);
      ctx.beginPath(); ctx.arc(R.x + R.w / 2, R.y + R.h / 2, Math.max(2.5, R.w / 2), 0, Math.PI * 2); ctx.fill();
    }

    function drawCard(p, R, o) {
      o = o || {};
      var lift = o.lift || 0;
      ctx.save();
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      if (R.w < 16) { drawDot(R); ctx.restore(); return; }
      var y = R.y - 7 * lift;
      if (lift > 0.01) { ctx.shadowColor = C.shadow; ctx.shadowBlur = 44 * lift; ctx.shadowOffsetY = 20 * lift; }
      ctx.fillStyle = C.surface;
      ctx.beginPath(); ctx.roundRect(R.x, y, R.w, R.h, R.r); ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 1; ctx.strokeStyle = C.hair; ctx.stroke();
      var ring = Math.max(lift, o.accent || 0);
      if (ring > 0.01) { ctx.strokeStyle = rgba(ACC, 0.55 * ring); ctx.lineWidth = 1.5; ctx.stroke(); }
      if (R.content > 0.01) {
        ctx.globalAlpha *= R.content;
        ctx.translate(R.x, y); ctx.scale(R.w / CW, R.h / CH);
        text(p.id, 22, 36, "600 14px " + FONT_NUM, rgba(ACC, 1));
        text(p.nameFit, 22, 72, "600 24px " + FONT_CN, C.text);
        for (var i = 0; i < p.noteLines.length; i++) text(p.noteLines[i], 22, 101 + i * 23, "400 15px " + FONT_CN, C.text2);
        ctx.fillStyle = C.hair; ctx.fillRect(22, 141, CW - 44, 1);
        if (p.ext) {
          ctx.font = "500 12px " + FONT_CN;
          var tw = ctx.measureText("外部仓库").width + 16;
          ctx.fillStyle = rgba(ACC, 0.12); ctx.beginPath(); ctx.roundRect(22, 150, tw, 20, 10); ctx.fill();
          text("外部仓库", 30, 164, "500 12px " + FONT_CN, rgba(ACC, 1));
        } else {
          text("github.com/" + p.repo, 22, 163, "400 12.5px " + FONT_NUM, C.text2);
        }
        ctx.translate(CW - 22 - 16, 150); ctx.fillStyle = C.text2; ctx.fill(gh);
      }
      ctx.restore();
    }

    function drawChip(label, n, x, y, a) {
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = "600 15px " + FONT_NUM; var w1 = ctx.measureText(label).width;
      ctx.font = "500 12px " + FONT_NUM; var w2 = n == null ? 0 : ctx.measureText(String(n)).width + 8;
      var w = w1 + w2 + 30;
      ctx.fillStyle = rgba(ACC, 0.10); ctx.strokeStyle = rgba(ACC, 0.38); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, 34, 17); ctx.fill(); ctx.stroke();
      text(label, x + 15, y + 22.5, "600 15px " + FONT_NUM, rgba(ACC, 1));
      if (n != null) text(String(n), x + 15 + w1 + 8, y + 22, "500 12px " + FONT_NUM, rgba(ACC, 0.85));
      ctx.restore();
      return w;
    }

    // 标签：kind = accent（强调）/ code（等宽代码）/ plain
    function drawTag(label, x, y, kind) {
      var font = kind === "code" ? "500 16px " + FONT_NUM : "500 15px " + FONT_CN;
      ctx.font = font; var w = ctx.measureText(label).width + 24;
      ctx.beginPath(); ctx.roundRect(x, y, w, 32, 8);
      if (kind === "accent") { ctx.fillStyle = rgba(ACC, 0.12); ctx.fill(); ctx.strokeStyle = rgba(ACC, 0.4); }
      else { ctx.fillStyle = C.surface2; ctx.fill(); ctx.strokeStyle = C.hair2; }
      ctx.lineWidth = 1; ctx.stroke();
      text(label, x + 12, y + 21.5, font, kind === "accent" ? rgba(ACC, 1) : kind === "code" ? C.text : C.text2);
      return w;
    }

    function drawHeader(h, a) {
      if (a <= 0.001) return;
      var x = h.x || 96, y = 88 + (1 - a) * 16;
      ctx.save(); ctx.globalAlpha = a;
      drawChip(h.chip, h.n, x, y, 1);
      if (/^[\x00-\x7F]+$/.test(h.title)) text(h.title, x - 3, y + 104, "600 72px " + FONT_NUM, C.text);
      else text(h.title, x - 2, y + 100, "600 54px " + FONT_CN, C.text);
      text(h.sub, x, y + 146, "400 22px " + FONT_CN, C.text2);
      ctx.restore();
    }

    // ---------- 背景 ----------
    function drawBackground(t, bookA) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, VW, VH);
      var kp = kick(t), hit = impact(t, 5);
      var breathe = 1 + 0.12 * Math.sin(t * 0.7) + 0.45 * kp + 0.5 * Math.min(1.2, hit);
      var g = ctx.createRadialGradient(960, 500, 0, 960, 500, 980 + 60 * kp);
      g.addColorStop(0, glow((0.055 + 0.05 * bookA) * breathe));
      g.addColorStop(1, glow(0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      // 粒子：底鼓一下，往上窜一小段
      var surge = 0;
      for (var q = 0; q < KICKS.length && KICKS[q] <= t; q++) surge += 1 - Math.exp(-(t - KICKS[q]) * 6);
      for (var i = 0; i < dust.length; i++) {
        var d = dust[i];
        var y = ((d.y - t * d.v - surge * d.v * 0.9) % VH + VH) % VH;
        var x = d.x + Math.sin(t * d.f + d.ph) * 18;
        ctx.fillStyle = glow(d.a * (0.6 + 0.4 * Math.sin(t * 1.3 + d.ph)) * (1 + 0.8 * kp));
        ctx.beginPath(); ctx.arc(x, y, d.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ---------- 书：首屏意象 ----------
    function drawBook(theta, a) {
      if (a <= 0.001) return;
      var w = 520, h = 600, cy = 520, P = 1500;
      var th = theta * Math.PI / 180;
      var z = w * Math.sin(th), s = P / (P - z);
      var ox = w * Math.cos(th) * s, oh = h / 2 * s;
      ctx.save();
      [-1, 1].forEach(function (side) {
        var xo = 960 + side * ox;
        var g = ctx.createLinearGradient(960, 0, xo, 0);
        g.addColorStop(0, C.surface2); g.addColorStop(1, rgba(C.bgRGB, 0.2));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(960, cy - h / 2); ctx.lineTo(xo, cy - oh); ctx.lineTo(xo, cy + oh); ctx.lineTo(960, cy + h / 2); ctx.closePath();
        ctx.globalAlpha = a * 0.55; ctx.fill();
        ctx.globalAlpha = a * 0.7; ctx.strokeStyle = C.hair2; ctx.lineWidth = 1.2; ctx.stroke();
      });
      ctx.restore();
    }

    function drawLine(t) {
      // 书脊 → 横线 → 时间轨道 → 收回 → 书脊
      var cx = 960, cy, ang, len, peak, full = RAIL_X1 - RAIL_X0 + 20, u;
      if (t < S.num) { cy = 520; ang = Math.PI / 2; len = 560 * easeOut(seg(t, 0.2, 1.4)); peak = 0.6; }
      else if (t < S.num + 1) { var k = ease(seg(t, S.num, S.num + 1)); cy = mix(520, 700, k); ang = mix(Math.PI / 2, 0, k); len = mix(560, full, k); peak = 0.6; }
      else if (t < S.end) { var m = ease(seg(t, S.num + 5.2, S.num + 6.2)); cy = mix(700, RAIL_Y, m); ang = 0; len = full; peak = mix(0.6, 0.32, m); }
      else if ((u = t - S.end) < 1.6) { cy = RAIL_Y; ang = 0; len = full * (1 - ease(seg(u, 0, 1.6))); peak = 0.32; }
      else { cy = 520; ang = Math.PI / 2; len = 560 * easeOut(seg(t, S.drop, S.drop + 0.45)); peak = 0.6 + 0.4 * Math.exp(-(t - S.drop) * 2); }
      if (len < 1) return;
      peak *= 1 + 0.5 * kick(t);
      var dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      function grad(col) {
        var g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        g.addColorStop(0, col(0)); g.addColorStop(0.18, col(peak)); g.addColorStop(0.5, col(peak * 1.15));
        g.addColorStop(0.82, col(peak)); g.addColorStop(1, col(0));
        return g;
      }
      ctx.save();
      ctx.strokeStyle = grad(function (a) { return rgba(ACC, a); }); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
      ctx.strokeStyle = grad(glow);
      ctx.filter = "blur(6px)"; ctx.globalAlpha = 0.6; ctx.lineWidth = 5; ctx.stroke();
      ctx.restore();
    }

    function drawStat(y, a, rise) {
      if (a <= 0.001) return;
      var owner = String(projects[0] && projects[0].repo || "").split("/")[0];
      var parts = [
        [String(N), "600 27px " + FONT_NUM, rgba(ACC, 1)],
        [" 个公开项目", "400 21px " + FONT_CN, C.text2],
        ["   ·   ", "400 21px " + FONT_CN, C.hair2],
        [firstYear.label + " — " + lastYear.label, "400 21px " + FONT_NUM, C.text2],
        ["   ·   ", "400 21px " + FONT_CN, C.hair2],
        ["github.com/" + owner, "400 21px " + FONT_NUM, C.text2],
      ];
      var total = 0;
      parts.forEach(function (p) { ctx.font = p[1]; p.w = ctx.measureText(p[0]).width; total += p.w; });
      var x = 960 - total / 2;
      ctx.save(); ctx.globalAlpha = a;
      parts.forEach(function (p) { text(p[0], x, y + rise, p[1], p[2]); x += p.w; });
      ctx.restore();
    }

    function drawSearch(cx, y, w, a, typed, focus, placeholder, caretOn) {
      if (a <= 0.001) return;
      ctx.save(); ctx.globalAlpha = a;
      var x = cx - w / 2, h = 76;
      if (focus > 0) {
        ctx.strokeStyle = rgba(ACC, 0.18 * focus); ctx.lineWidth = 8;
        ctx.beginPath(); ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 20); ctx.stroke();
      }
      ctx.fillStyle = C.surface; ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill();
      ctx.strokeStyle = focus > 0 ? rgba(ACC, 0.38 + 0.2 * focus) : C.hair; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = C.text2; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(x + 42, y + 36, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 49.5, y + 43.5); ctx.lineTo(x + 57, y + 51); ctx.stroke();
      if (typed) {
        text(typed, x + 76, y + 46, "500 26px " + FONT_NUM, C.text);
        ctx.font = "500 26px " + FONT_NUM;
        var cw = ctx.measureText(typed).width;
        if (caretOn) { ctx.fillStyle = rgba(ACC, 1); ctx.fillRect(x + 80 + cw, y + 22, 2, 32); }
      } else {
        text(placeholder, x + 76, y + 46, "400 22px " + FONT_CN, C.text2);
        if (caretOn) { ctx.fillStyle = rgba(ACC, 1); ctx.fillRect(x + 76, y + 22, 2, 32); }
      }
      ctx.strokeStyle = C.hair2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x + w - 58, y + 24, 30, 28, 6); ctx.stroke();
      text("/", x + w - 43, y + 44, "400 16px " + FONT_NUM, C.text2, "center");
      ctx.restore();
    }

    // 开卷（开场）与合卷（结尾）共用的首屏构图
    function heroAlpha(t) {
      if (t < S.num + 1) return smooth(0.8, 1.6, t) * (1 - smooth(5.2, 6, t));
      if (t >= S.drop) return smooth(S.drop, S.drop + 0.3, t);
      return 0;
    }
    function drawHero(t) {
      var theta, bookA = heroAlpha(t), logoA, logoRise, logoScale = 1, statA, searchA = 0, cueA = 0, u;
      if (t < S.num + 1) {
        theta = mix(62, 15, easeOut(seg(t, 0.8, 2.8))) - 15 * ease(seg(t, 5.2, 6));
        logoA = smooth(1.5, 2.3, t) * (1 - smooth(5.2, 5.9, t));
        logoRise = 18 * (1 - easeOut(seg(t, 1.5, 2.8))) - 26 * ease(seg(t, 5.2, 5.9));
        logoScale = 1 + 0.035 * seg(t, 2, 5.2);               // 首屏缓推
        statA = smooth(2.5, 3.3, t) * (1 - smooth(5.1, 5.8, t));
      } else if (t >= S.drop) {
        // 合卷落点：书页猛地弹开，字标带一点过冲砸下来
        u = t - S.drop;
        var k = seg(u, 0, 0.7);
        theta = mix(70, 15, 1 - Math.pow(1 - k, 4) + Math.sin(Math.PI * k) * 0.12);
        logoA = smooth(0.15, 0.55, u);
        var lk = seg(u, 0.15, 0.9);
        logoScale = 1 + 0.16 * Math.exp(-lk * 5) * Math.cos(lk * 9);
        logoRise = 0;
        statA = smooth(0.9, 1.5, u);
        searchA = smooth(1.4, 2.0, u);
        cueA = smooth(2.0, 2.6, u);
      } else return;
      drawBook(theta, bookA);
      if (logoA > 0.001) {
        ctx.save(); ctx.globalAlpha = logoA;
        ctx.translate(960, 410 + logoRise); ctx.scale(logoScale, logoScale);
        ctx.drawImage(logo, -300, -107, 600, 214);
        ctx.restore();
      }
      drawStat(592, statA, (1 - statA) * 12);
      drawSearch(960, 650 + (1 - searchA) * 12, 760, searchA, "", 0, "搜索项目名、编号或关键词", false);
      if (cueA > 0.001) {
        ctx.save(); ctx.globalAlpha = cueA * 0.9;
        var bob = Math.sin(t * 3) * 3;
        text("项目库", 960, 810, "400 18px " + FONT_CN, C.text2, "center");
        ctx.strokeStyle = C.text2; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(950, 828 + bob); ctx.lineTo(960, 838 + bob); ctx.lineTo(970, 828 + bob); ctx.stroke();
        ctx.restore();
      }
    }

    // ---------- 编号即历史 ----------
    function drawNumbering(t) {
      var u = t - S.num;
      if (u < 0.6 || u > 6.6) return;
      var capA = smooth(0.8, 1.5, u) * (1 - smooth(3.7, 4.0, u));
      ctx.save(); ctx.globalAlpha = capA;
      text("编号，就是历史", 960, 262 + (1 - capA) * 12, "600 50px " + FONT_CN, C.text, "center");
      text("每个项目一个「年份-序号」，按编号排开，就是一条时间线", 960, 318 + (1 - capA) * 12, "400 22px " + FONT_CN, C.text2, "center");
      ctx.restore();

      var ID = "2026-031";
      var n = Math.floor(seg(u, 1.25, 2.25) * ID.length + 0.0001);   // 十六分音符一个字
      var idA = 1 - smooth(3.7, 4.0, u);
      if (n > 0 && idA > 0) {
        ctx.save(); ctx.globalAlpha = idA;
        ctx.font = "600 150px " + FONT_NUM;
        var full = ctx.measureText(ID).width, x0 = 960 - full / 2;
        var shown = ID.slice(0, n);
        text(shown, x0, 560, "600 150px " + FONT_NUM, C.text);
        if (u < 3.0 && Math.floor(u * 2.4) % 2 === 0) { ctx.fillStyle = rgba(ACC, 1); ctx.fillRect(x0 + ctx.measureText(shown).width + 8, 440, 4, 130); }
        var wYear = ctx.measureText("2026").width, wDash = ctx.measureText("2026-").width;
        [[x0, x0 + wYear, "年份", 2.5], [x0 + wDash, x0 + full, "当年序号", 3.0]].forEach(function (b) {
          var k = easeOut(seg(u, b[3], b[3] + 0.6));
          if (k <= 0) return;
          var mid = (b[0] + b[1]) / 2, half = (b[1] - b[0]) / 2 * k;
          ctx.strokeStyle = rgba(ACC, 0.9); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mid - half, 588); ctx.lineTo(mid - half, 598); ctx.lineTo(mid + half, 598); ctx.lineTo(mid + half, 588); ctx.stroke();
          ctx.globalAlpha = idA * k;
          text(b[2], mid, 636, "500 22px " + FONT_CN, rgba(ACC, 1), "center");
          ctx.globalAlpha = idA;
        });
        ctx.restore();
      }

      var cntA = smooth(3.95, 4.15, u) * (1 - smooth(5.3, 5.7, u));
      if (cntA > 0) {
        var shownN = Math.round(N * easeOut(seg(u, 4.0, 5.0)));
        var pk = 1 + 0.22 * Math.exp(-Math.max(0, u - 4.0) * 7) + 0.06 * Math.exp(-Math.max(0, u - 5.0) * 8) * (u > 5 ? 1 : 0);
        ctx.save(); ctx.globalAlpha = cntA;
        ctx.save(); ctx.translate(960, 510); ctx.scale(pk, pk);
        text(String(shownN), 0, 50, "600 150px " + FONT_NUM, rgba(ACC, 1), "center");
        ctx.restore();
        text("个公开项目", 960, 612, "400 24px " + FONT_CN, C.text2, "center");
        ctx.restore();
      }
    }

    // ---------- 时间轨道 ----------
    function activeOf(key, t) {
      if (key === firstYear.key) return smooth(S.y1, S.y1 + 0.4, t) * (1 - smooth(S.y1 + 7.0, S.y1 + 7.6, t));
      if (key === lastYear.key) return smooth(S.mod, S.mod + 0.6, t) * (1 - smooth(S.search - 0.4, S.search + 0.2, t));
      if (key === "0000") return smooth(S.tpl, S.tpl + 0.6, t) * (1 - smooth(S.tpl + 5.2, S.tpl + 6, t));
      if (key === "other") return smooth(S.tpl + 3.6, S.tpl + 4.2, t) * (1 - smooth(S.tpl + 5.2, S.tpl + 6, t));
      return 0;
    }
    function branchK(p, t) { // 模板枝条到达该点的进度
      var d = Math.abs(p.rx - 960) / 710;
      return seg(t, S.tpl + 0.9 + d * 1.3, S.tpl + 2.0 + d * 1.3);
    }

    function drawRail(t) {
      var pop0 = S.num + 4.0;
      if (t < pop0 || t > S.end) return;
      var y = railY(t), kp = kick(t);
      var labelA = smooth(S.num + 5.0, S.num + 5.4, t) * (1 - smooth(S.end - 0.4, S.end + 0.2, t));
      groups.forEach(function (g) {
        var act = activeOf(g.key, t);
        g.items.forEach(function (p) {
          var i = p.ri;
          var pop = seg(t, pop0 + i * 0.02, pop0 + i * 0.02 + 0.3);
          if (pop <= 0) return;
          var lit = act;
          if (isModule(p)) lit = Math.max(lit, smooth(S.mod, S.mod + 0.4, t) * (1 - smooth(S.wall - 0.6, S.wall, t)));
          if (hits.indexOf(p) >= 0) lit = Math.max(lit, smooth(S.search + 2.2, S.search + 2.5, t) * (1 - smooth(S.search + 5.0, S.search + 5.6, t)));
          lit = Math.max(lit, branchK(p, t) * (1 - smooth(S.tpl + 5.2, S.tpl + 6, t)));
          var r = 3.2 * (1 + 0.8 * Math.sin(Math.PI * pop) * (pop < 1 ? 1 : 0)) + (1.2 + 0.6 * kp) * lit;
          ctx.globalAlpha = pop;
          ctx.fillStyle = lit > 0.02 ? rgba(ACC, mix(0.5, 1, lit)) : rgba(ACC, 0.42);
          ctx.beginPath(); ctx.arc(p.rx, y, r, 0, Math.PI * 2); ctx.fill();
          if (lit > 0.05) {
            ctx.fillStyle = glow((0.18 + 0.12 * kp) * lit);
            ctx.beginPath(); ctx.arc(p.rx, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        });
        if (labelA > 0) {
          var mid = (g.items[0].rx + g.items[g.items.length - 1].rx) / 2;
          ctx.save(); ctx.globalAlpha = labelA;
          text(g.label + "  " + g.items.length, mid, y + 38, "500 15px " + FONT_CN, act > 0.3 ? rgba(ACC, 1) : C.text2, "center");
          ctx.restore();
        }
      });
    }

    // ---------- 第一个年份：网格 + 扫光 ----------
    // 扫光从第二小节起、一张卡一个八分音符；卡太多就压到三小节内
    var SWEEP0 = BAR;
    function sweepStep(n) { return Math.min(BEAT / 2, 3 * BAR / Math.max(1, n)); }
    function drawFirstYear(t) {
      var u = t - S.y1;
      if (u < 0 || u > 8.2) return;
      var items = firstYear.items, cols = 5, gap = 22;
      var gw = cols * CW + (cols - 1) * gap, left = (VW - gw) / 2;
      drawHeader({ x: left, chip: firstYear.label, n: items.length, title: firstYear.label, sub: "课程设计、竞赛作品，以及第一批 AGV" },
        smooth(0.05, 0.6, u) * (1 - smooth(6.6, 7.2, u)));
      var sweep = sweepStep(items.length);
      items.forEach(function (p, j) {
        var rect = { x: left + (j % cols) * (CW + gap), y: 290 + Math.floor(j / cols) * (CH + gap), w: CW, h: CH };
        var kin = seg(u, 0.05 + j * 0.04, 0.85 + j * 0.04), kout = seg(u, 6.5 + j * 0.03, 7.3 + j * 0.03);
        var k = kin * (1 - kout);
        if (k <= 0) return;
        drawCard(p, morph(railDot(p, t), rect, k), { alpha: Math.min(1, k * 4), lift: bump((u - SWEEP0) / sweep - j, 1.6) });
      });
    }

    // ---------- History 模块家族：左架构图 + 右详情 ----------
    var MOD_C = { x: 520, y: 610 }, MOD_R = { x: 350, y: 285 };
    var PANEL = { x: 1000, y: 250, w: 824, h: 690 };
    function satPos(j, n) {
      var a = -Math.PI / 2 + j * Math.PI * 2 / n;
      return { x: MOD_C.x + Math.cos(a) * MOD_R.x, y: MOD_C.y + Math.sin(a) * MOD_R.y };
    }
    function focusIndex(u) { return Math.floor((u - FOCUS0) / DWELL); }

    // 从宿主往外打一串光点（命令总线上的一次广播）
    function burst(q, t0, t, n, amp) {
      for (var b = 0; b < n; b++) {
        var w = seg(t, t0 + b * 0.07, t0 + b * 0.07 + 0.38);
        if (w <= 0 || w >= 1) continue;
        var e = easeOut(w), px = mix(MOD_C.x, q.x, e), py = mix(MOD_C.y, q.y, e), pa = amp * (1 - w * 0.6);
        var g = ctx.createRadialGradient(px, py, 0, px, py, 13);
        g.addColorStop(0, glow(pa)); g.addColorStop(1, glow(0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
      }
    }
    function shock(x, y, t0, t, r1, dur, amp) {
      var k = seg(t, t0, t0 + dur);
      if (k <= 0 || k >= 1) return;
      ctx.save();
      ctx.strokeStyle = glow(amp * (1 - k)); ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(x, y, r1 * easeOut(k), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    function drawModules(t) {
      var u = t - S.mod, L = S.modLen;
      if (u < -0.5 || u > L + 0.4 || !modules.length) return;
      var out = 1 - smooth(L - 0.9, L - 0.3, u);
      var K = sats.length, M = spotlight.length;
      var uAll = FOCUS0 + M * DWELL;                                   // 全员上线小节
      var all = smooth(uAll - 0.05, uAll + 0.25, u) * out;
      var kp = kick(t);
      drawHeader({
        chip: lastYear.label, n: lastYear.items.length, title: "History 模块家族",
        sub: hub ? K + " 个模块装在宿主 " + hub.name + " 上，各管一件事" : modules.length + " 个模块，各管一件事"
      }, smooth(-0.2, 0.4, u) * out);

      var fi = focusIndex(u), cur = fi >= 0 && fi < M ? spotlight[fi] : null;
      var local = u - FOCUS0 - fi * DWELL;        // 当前聚焦已经过去的时间
      var focusOf = function (p) {
        var j = spotlight.indexOf(p), a = FOCUS0 + j * DWELL;
        return smooth(a - 0.06, a + 0.1, u) * (1 - smooth(a + DWELL - 0.06, a + DWELL + 0.1, u));
      };
      var hubFocus = hub ? focusOf(hub) : 0;

      // 连线：宿主 ↔ 模块，当前模块那条最亮，上面有往返的光点（命令总线）
      sats.forEach(function (p, j) {
        var q = satPos(j, K);
        var dk = easeOut(seg(u, 0.3 + j * 0.06, 1.0 + j * 0.06)) * out;
        if (dk <= 0) return;
        var f = Math.max(focusOf(p), hubFocus, all);
        ctx.save();
        ctx.strokeStyle = rgba(ACC, 0.2 + 0.5 * f + 0.2 * all * kp); ctx.lineWidth = 1.2 + 1.2 * f + 1.2 * all * kp;
        ctx.beginPath(); ctx.moveTo(MOD_C.x, MOD_C.y); ctx.lineTo(mix(MOD_C.x, q.x, dk), mix(MOD_C.y, q.y, dk)); ctx.stroke();
        var speed = 0.45 + 0.9 * all;
        for (var s = 0; s < 2; s++) {
          var w = ((u - 0.8) * speed + j * 0.29 + s * 0.5) % 1;
          if (w < 0) continue;
          if (s === 1) w = 1 - w;
          var px = mix(MOD_C.x, q.x, w), py = mix(MOD_C.y, q.y, w), pa = Math.sin(Math.PI * w) * dk * (0.35 + 0.65 * f);
          var g = ctx.createRadialGradient(px, py, 0, px, py, 10);
          g.addColorStop(0, glow(0.95 * pa)); g.addColorStop(1, glow(0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
        }
        // 聚焦那一拍：宿主朝它连发一串；全员上线：每下底鼓朝所有模块广播
        burst(q, S.mod + FOCUS0 + spotlight.indexOf(p) * DWELL, t, 3, 0.95 * out);
        for (var b = 0; b < 8; b++) burst(q, S.mod + uAll + b * BEAT, t, 2, 0.8 * out);
        ctx.restore();
      });

      // 节点
      function node(p, rect, j, isHub) {
        var kin = seg(u, -0.4 + j * 0.06, 0.5 + j * 0.06), kout = seg(u, L - 0.9 + j * 0.03, L - 0.15 + j * 0.03);
        var k = kin * (1 - kout);
        if (k <= 0) return;
        var R = morph(railDot(p, t), rect, k), f = focusOf(p), on = Math.max(f, all * (0.55 + 0.45 * kp));
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 4);
        if (R.w < 16) { drawDot(R); ctx.restore(); return; }
        var pop = 1 + 0.08 * Math.exp(-Math.max(0, u - FOCUS0 - spotlight.indexOf(p) * DWELL) * 8) * f;
        var cx = R.x + R.w / 2, cy = R.y + R.h / 2;
        ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
        var y = R.y - 6 * f;
        if (f > 0.01) { ctx.shadowColor = C.shadow; ctx.shadowBlur = 40 * f; ctx.shadowOffsetY = 16 * f; }
        ctx.fillStyle = C.surface; ctx.beginPath(); ctx.roundRect(R.x, y, R.w, R.h, Math.min(R.r, 14)); ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = isHub ? rgba(ACC, 0.45) : C.hair; ctx.lineWidth = 1; ctx.stroke();
        if (on > 0.01) { ctx.strokeStyle = rgba(ACC, 0.75 * on); ctx.lineWidth = 2; ctx.stroke(); }
        if (R.content > 0.01) {
          ctx.globalAlpha *= R.content;
          ctx.translate(R.x, y); ctx.scale(R.w / rect.w, R.h / rect.h);
          var d = p.d || {};
          text(p.name, 18, isHub ? 42 : 33, (isHub ? "600 26px " : "600 20px ") + FONT_NUM, on > 0.5 ? rgba(ACC, 1) : C.text);
          text((isHub ? "宿主 · " : "") + (d.domain || p.id), 18, isHub ? 72 : 56, "400 " + (isHub ? 16 : 14) + "px " + FONT_NUM, C.text2);
        }
        ctx.restore();
      }
      sats.forEach(function (p, j) {
        var q = satPos(j, K);
        node(p, { x: q.x - 110, y: q.y - 34, w: 220, h: 68 }, j + 1, false);
        shock(q.x, q.y, S.mod + FOCUS0 + spotlight.indexOf(p) * DWELL, t, 150, 0.6, 0.7 * out);
      });
      if (hub) {
        // 宿主节点下垫一圈光，随底鼓呼吸；全员上线时整圈放大
        var hA = smooth(0, 0.8, u) * out * (1 + 0.5 * kp + 0.8 * all);
        var hr = 220 + 60 * all;
        var gl = ctx.createRadialGradient(MOD_C.x, MOD_C.y, 0, MOD_C.x, MOD_C.y, hr);
        gl.addColorStop(0, glow(0.14 * hA)); gl.addColorStop(1, glow(0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(MOD_C.x, MOD_C.y, hr, 0, Math.PI * 2); ctx.fill();
        shock(MOD_C.x, MOD_C.y, S.mod + FOCUS0 + spotlight.indexOf(hub) * DWELL, t, 200, 0.7, 0.7 * out);
        shock(MOD_C.x, MOD_C.y, S.mod + uAll, t, 560, 1.0, 0.9 * out);
        shock(MOD_C.x, MOD_C.y, S.mod + uAll + BAR / 2, t, 560, 1.0, 0.5 * out);
        shock(MOD_C.x, MOD_C.y, S.mod + uAll + BAR, t, 560, 1.0, 0.7 * out);
        node(hub, { x: MOD_C.x - 140, y: MOD_C.y - 48, w: 280, h: 96 }, 0, true);
      }

      // 详情面板
      var pA = smooth(0.9, 1.5, u) * out;
      if (pA <= 0.001) return;
      var P = PANEL;
      ctx.save(); ctx.globalAlpha = pA;
      ctx.translate(0, (1 - pA) * 16);
      ctx.shadowColor = C.shadow; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
      ctx.fillStyle = C.surface; ctx.beginPath(); ctx.roundRect(P.x, P.y, P.w, P.h, 22); ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = rgba(ACC, 0.32 + 0.3 * all * kp); ctx.lineWidth = 1; ctx.stroke();
      // 每次切换，顶边扫过一道光
      var scanL = fi >= 0 ? (fi >= M ? u - uAll : local) : -1, sk = seg(scanL, 0, 0.4);
      if (sk > 0 && sk < 1) {
        var sx = P.x + 22 + (P.w - 44) * easeOut(sk), sg = ctx.createLinearGradient(sx - 220, 0, sx, 0);
        sg.addColorStop(0, rgba(ACC, 0)); sg.addColorStop(1, rgba(ACC, 0.9 * (1 - sk)));
        ctx.fillStyle = sg; ctx.fillRect(sx - 220, P.y, 220, 2);
      }
      // 进度：第几个模块
      spotlight.forEach(function (p, j) {
        var isCur = j === fi || fi >= M;
        ctx.fillStyle = isCur ? rgba(ACC, 1) : j < fi ? rgba(ACC, 0.45) : C.hair2;
        ctx.beginPath(); ctx.roundRect(P.x + P.w - 44 - (M - 1 - j) * 22, P.y + 38, j === fi ? 16 : 8, 8, 4); ctx.fill();
      });
      if (cur) {
        var inA = easeOut(seg(local, 0, 0.28)), outA = 1 - ease(seg(local, DWELL - 0.18, DWELL));
        var ca = inA * outA, dx = (1 - inA) * 46 - (1 - outA) * 36;
        ctx.globalAlpha = pA * ca;
        ctx.translate(P.x + 48 + dx, P.y);
        var d = cur.d || { role: "", domain: "", ui: "" };
        text(cur.id, 0, 52, "600 18px " + FONT_NUM, rgba(ACC, 1));
        text(cur.name, -2, 118, "600 58px " + FONT_NUM, C.text);
        var x = 0;
        if (d.role) x += drawTag(d.role, x, 144, "accent") + 10;
        if (d.domain) x += drawTag(d.domain, x, 144, "code") + 10;
        if (cur.uiFit) drawTag("界面：" + cur.uiFit, x, 144, "plain");
        for (var i = 0; i < cur.posLines.length; i++) text(cur.posLines[i], 0, 232 + i * 38, "400 23px " + FONT_CN, C.text);
        var y0 = 232 + cur.posLines.length * 38 + 12;
        ctx.fillStyle = C.hair; ctx.fillRect(0, y0, P.w - 96, 1);
        text("能力", 0, y0 + 40, "500 16px " + FONT_CN, C.text2);
        cur.capRows.forEach(function (c, r) {
          var ry = y0 + 80 + r * 40, rk = easeOut(seg(local, 0.1 + r * BEAT / 4, 0.4 + r * BEAT / 4));   // 能力行按十六分音符逐条弹出
          ctx.save(); ctx.globalAlpha *= rk; ctx.translate((1 - rk) * 22, 0);
          ctx.fillStyle = rgba(ACC, 0.9); ctx.fillRect(0, ry - 12, 4, 4);
          text(c.k, 18, ry - 3, "600 17px " + FONT_NUM, rgba(ACC, 1));
          text(c.use, 224, ry - 3, "400 18px " + FONT_CN, C.text);
          ctx.restore();
        });
        if (cur.moreCaps) text("还有 " + cur.moreCaps + " 类能力，见项目说明页", 0, y0 + 80 + cur.capRows.length * 40 + 2, "400 15px " + FONT_CN, C.text2);
      } else if (fi >= M) {
        // 全员上线：面板换成全家福
        var la = u - uAll, ia = easeOut(seg(la, 0, 0.3));
        ctx.globalAlpha = pA * ia;
        ctx.translate(P.x + 48 + (1 - ia) * 46, P.y);
        text("全员上线", 0, 52, "600 18px " + FONT_CN, rgba(ACC, 1));
        text((hub ? "宿主 + " + K : M) + " 个模块，一条总线", -2, 118, "600 54px " + FONT_CN, C.text);
        text("每条指令都经宿主的命令总线分发，模块之间不直接相连", 0, 170, "400 21px " + FONT_CN, C.text2);
        var cols = 3, cw = (P.w - 96 - 2 * 16) / cols, chh = 104, capsAll = 0;
        spotlight.forEach(function (p, i) {
          var nc = (p.d && p.d.caps.length) || 0;
          capsAll += nc;
          var rk = easeOut(seg(la, 0.1 + i * BEAT / 4, 0.4 + i * BEAT / 4));
          if (rk <= 0) return;
          var gx = (i % cols) * (cw + 16), gy = 222 + Math.floor(i / cols) * (chh + 16);
          ctx.save(); ctx.globalAlpha *= rk; ctx.translate(0, (1 - rk) * 18);
          ctx.fillStyle = C.surface2; ctx.beginPath(); ctx.roundRect(gx, gy, cw, chh, 12); ctx.fill();
          ctx.strokeStyle = p === hub ? rgba(ACC, 0.5) : C.hair2; ctx.lineWidth = 1; ctx.stroke();
          text(p.name, gx + 18, gy + 36, "600 20px " + FONT_NUM, p === hub ? rgba(ACC, 1) : C.text);
          text(((p === hub ? "宿主 · " : "") + ((p.d && p.d.domain) || p.id)), gx + 18, gy + 62, "400 15px " + FONT_NUM, C.text2);
          if (nc) text(nc + " 类能力", gx + 18, gy + 88, "500 14px " + FONT_CN, rgba(ACC, 1));
          ctx.restore();
        });
        var ta = easeOut(seg(la, 0.5 + M * BEAT / 4, 0.9 + M * BEAT / 4));
        if (capsAll && ta > 0) {
          ctx.globalAlpha = pA * ia * ta;
          var ty = 222 + Math.ceil(M / cols) * (chh + 16) + 26;
          ctx.fillStyle = C.hair; ctx.fillRect(0, ty, P.w - 96, 1);
          text("合计", 0, ty + 50, "500 18px " + FONT_CN, C.text2);
          text(String(Math.round(capsAll * easeOut(seg(la, 0.5 + M * BEAT / 4, 1.3 + M * BEAT / 4)))), 52, ty + 52, "600 34px " + FONT_NUM, rgba(ACC, 1));
          ctx.font = "600 34px " + FONT_NUM; var cwid = ctx.measureText(String(capsAll)).width;
          text("类能力，全部挂在同一条总线上", 62 + cwid, ty + 50, "500 18px " + FONT_CN, C.text2);
        }
      }
      ctx.restore();
    }

    // ---------- 最新年份的全部项目 + 搜索演示 ----------
    function wallRect(j, u, n) {
      var rows = 3, cols = Math.ceil(n / rows), gap = 22;
      var r = j % rows, c = Math.floor(j / rows);
      var total = cols * (CW + gap) - gap;
      var base = (VW - total) / 2 + [-150, 120, -30][r];
      var dir = r === 1 ? 1 : -1;
      return { x: base + c * (CW + gap) + dir * 30 * (u - 2.5), y: 262 + r * (CH + 22), w: CW, h: CH };
    }
    function hitRect(i) {
      var k = hits.length, gap = 22;
      var row = Math.floor(i / 5), col = i % 5, inRow = Math.min(5, k - row * 5);
      var w = inRow * CW + (inRow - 1) * gap;
      return { x: (VW - w) / 2 + col * (CW + gap), y: 350 + row * (CH + 26), w: CW, h: CH };
    }

    function drawLastYear(t) {
      var u = t - S.wall, v = t - S.search;
      if (u < -0.2 || v > 6.0) return;
      var items = lastYear.items, n = items.length;
      drawHeader({ chip: lastYear.label, n: n, title: lastYear.label, sub: "整车与机构设计、CAD 与 PLC 学习，还有这套工具本身" },
        smooth(0, 0.6, u) * (1 - smooth(3.4, 3.9, u)));
      var fade = 1 - 0.93 * smooth(1.5, 2.2, v);
      var move = seg(v, 1.5, 2.5);
      var land = v > 2.5 ? Math.exp(-(v - 2.5) * 3) : 0;            // 命中落定那一拍
      items.forEach(function (p, j) {
        var hi = hits.indexOf(p);
        var kin = seg(u, -0.15 + j * 0.02, 0.65 + j * 0.02), kout = seg(v, 4.8 + j * 0.012, 5.6 + j * 0.012);
        if (kin <= 0 || kout >= 1) return;
        var W = wallRect(j, u, n);
        var target = hi >= 0 ? lerpRect(W, hitRect(hi), move) : W;
        var R = kout > 0 ? morph(railDot(p, t), target, 1 - kout) : morph(railDot(p, t), target, kin);
        var a = Math.min(1, kin * 4) * (hi >= 0 ? 1 : fade) * (kout > 0 ? Math.min(1, (1 - kout) * 4) : 1);
        if (a < 0.01) return;
        drawCard(p, R, { alpha: a, accent: hi >= 0 ? smooth(2.3, 2.5, v) : 0, lift: hi >= 0 ? 0.8 * land : 0 });
      });
      // 不在墙上的命中项（其他年份）从轨道飞上来
      hits.forEach(function (p, i) {
        if (items.indexOf(p) >= 0) return;
        var kin = seg(v, 1.5 + i * 0.06, 2.4 + i * 0.03), kout = seg(v, 4.8, 5.6);
        var k = kin * (1 - kout);
        if (k <= 0) return;
        drawCard(p, morph(railDot(p, t), hitRect(i), k), { alpha: Math.min(1, k * 4), accent: smooth(2.3, 2.5, v), lift: 0.8 * land });
      });
      var sA = smooth(0, 0.4, v) * (1 - smooth(4.8, 5.3, v));
      var typed = QUERY.slice(0, Math.floor(seg(v, 0.5, 0.5 + QUERY.length * BEAT / 2) * QUERY.length + 0.0001));   // 八分音符一个字
      var caret = v < 2.3 && Math.floor(v * 2.6) % 2 === 0;
      drawSearch(960, 150 + (1 - sA) * 12, 760, sA, typed, smooth(0.4, 0.7, v), "搜索项目名、编号或关键词", caret);
      var cA = smooth(2.4, 2.8, v) * (1 - smooth(4.8, 5.3, v));
      if (cA > 0) {
        ctx.save(); ctx.globalAlpha = cA;
        text("匹配 " + hits.length + " / " + N + " 个项目 · 横跨 " + unique(hits.map(function (p) { return p.g.label; })).join("、"),
          960, 280, "400 20px " + FONT_CN, C.text2, "center");
        ctx.restore();
      }
    }

    // ---------- 模板与其他 ----------
    function drawTemplates(t) {
      var u = t - S.tpl;
      if (u < 0 || u > 6.4) return;
      drawHeader({ chip: "模板", n: templates.length, title: "从模板开始", sub: "每个项目都由标准模板继承，结构与说明方式一致" },
        smooth(0.1, 0.8, u) * (1 - smooth(5.2, 5.8, u)));
      var tpl = templates[0];
      var tplRect = { x: 960 - CW / 2, y: 330, w: CW, h: CH };
      var out = 1 - smooth(5.2, 6, u);
      if (tpl && u > 0.8) {
        var y0 = tplRect.y + CH, y1 = RAIL_Y - 6;
        ctx.save(); ctx.lineWidth = 1.1;
        projects.forEach(function (p) {
          var k = branchK(p, t);
          if (k <= 0) return;
          var pts = 28, lim = Math.max(1, Math.round(pts * ease(k)));
          ctx.strokeStyle = rgba(ACC, 0.26 * out);
          ctx.beginPath();
          for (var s = 0; s <= lim; s++) {
            var w = s / pts, v = 1 - w;
            var x = v * v * v * 960 + 3 * v * v * w * 960 + 3 * v * w * w * p.rx + w * w * w * p.rx;
            var y = v * v * v * y0 + 3 * v * v * w * (y0 + 230) + 3 * v * w * w * (y1 - 240) + w * w * w * y1;
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
        KICKS.forEach(function (kt) {
          if (kt < S.tpl + BAR || kt >= S.end) return;
          var w = seg(t, kt, kt + 0.55);
          if (w <= 0 || w >= 1) return;
          var e = easeOut(w), v = 1 - e, pa = Math.sin(Math.PI * w) * out;
          projects.forEach(function (p) {
            if (branchK(p, t) < 1) return;
            var x = v * v * v * 960 + 3 * v * v * e * 960 + 3 * v * e * e * p.rx + e * e * e * p.rx;
            var y = v * v * v * y0 + 3 * v * v * e * (y0 + 230) + 3 * v * e * e * (y1 - 240) + e * e * e * y1;
            ctx.fillStyle = glow(0.8 * pa);
            ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
          });
        });
        ctx.restore();
      }
      var slots = [[tpl, tplRect]];
      if (templates[1]) slots.push([templates[1], { x: 480 - CW / 2, y: 330, w: CW, h: CH }]);
      slots.forEach(function (sl, i) {
        var k = seg(u, 0.1 + i * 0.15, 1.1 + i * 0.15) * (1 - seg(u, 5.2, 6.1));
        if (k > 0 && sl[0]) drawCard(sl[0], morph(railDot(sl[0], t), sl[1], k), { alpha: Math.min(1, k * 4), accent: i === 0 ? smooth(0.8, 1.4, u) * 0.8 : 0 });
      });
      others.forEach(function (p, i) {
        var rect = { x: 1440 - CW / 2, y: 330 + i * (CH + 22), w: CW, h: CH };
        var k = seg(u, 3.5 + i * 0.1, 4.3 + i * 0.1) * (1 - seg(u, 5.2, 6.1));
        if (k <= 0) return;
        drawCard(p, morph(railDot(p, t), rect, k), { alpha: Math.min(1, k * 4) });
        if (i === 0) drawChip("其他", others.length, rect.x, rect.y - 50, smooth(4.0, 4.5, u) * (1 - smooth(5.2, 5.8, u)));
      });
    }

    // ---------- 所有点汇回书脊：越收越快，全部在落点前一刻到达，落点一拍炸开 ----------
    function drawGather(t) {
      var u = t - S.end, U = S.drop - S.end;
      if (u < 0 || u > U + 2.5) return;
      if (u < U) {
        projects.forEach(function (p) {
          var d = Math.abs(p.rx - 960) / 710;
          var k = seg(u, d * 0.35, U - 0.1), f = k * k;                // 加速收拢
          var cx2 = mix(p.rx, 960, 0.25), cy2 = RAIL_Y - 300;
          var x = (1 - f) * (1 - f) * p.rx + 2 * (1 - f) * f * cx2 + f * f * 960;
          var y = (1 - f) * (1 - f) * RAIL_Y + 2 * (1 - f) * f * cy2 + f * f * 520;
          var a = 1 - smooth(0.9, 1, f);
          if (a <= 0) return;
          var r = 12 + 8 * f;
          var g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(ACC, a)); g.addColorStop(0.3, glow(0.5 * a)); g.addColorStop(1, glow(0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        });
        // 书脊位置越攒越亮
        var core = Math.pow(seg(u, 0.4, U), 2.5);
        if (core > 0.01) {
          var gc = ctx.createRadialGradient(960, 520, 0, 960, 520, 60 + 160 * core);
          gc.addColorStop(0, glow(0.5 * core)); gc.addColorStop(1, glow(0));
          ctx.fillStyle = gc; ctx.fillRect(0, 0, VW, VH);
        }
        return;
      }
      var w = u - U, flash = Math.exp(-w * 2.6);
      var g2 = ctx.createRadialGradient(960, 520, 0, 960, 520, 520 + 500 * easeOut(seg(w, 0, 1)));
      g2.addColorStop(0, glow(0.45 * flash)); g2.addColorStop(1, glow(0));
      ctx.fillStyle = g2; ctx.fillRect(0, 0, VW, VH);
      shock(960, 520, S.drop, t, 1100, 1.4, 0.8);
      shock(960, 520, S.drop + 0.12, t, 760, 1.2, 0.5);
    }

    function render(t) {
      t = Math.max(0, Math.min(DUR, t));
      ctx.setTransform(canvas.width / VW, 0, 0, canvas.height / VH, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
      drawBackground(t, heroAlpha(t));
      // 镜头：段落落点往前一冲再回弹；底鼓上再带一丝呼吸
      var zoom = 1 + 0.014 * impact(t, 6) + 0.003 * kick(t);
      ctx.translate(960, 540); ctx.scale(zoom, zoom); ctx.translate(-960, -540);
      drawHero(t);
      drawLine(t);
      drawNumbering(t);
      drawRail(t);
      drawFirstYear(t);
      drawModules(t);
      drawLastYear(t);
      drawTemplates(t);
      drawGather(t);
      ctx.setTransform(canvas.width / VW, 0, 0, canvas.height / VH, 0, 0);
      var fadeIn = 1 - smooth(0, 0.6, t);
      if (fadeIn > 0) { ctx.fillStyle = rgba(C.bgRGB, fadeIn); ctx.fillRect(0, 0, VW, VH); }
    }

    return {
      render: render,
      duration: DUR,
      // 给配乐与渲染器用的时间表
      timeline: {
        S: S, dwell: DWELL, focus0: FOCUS0, bpm: 60 / BEAT, beat: BEAT, bar: BAR, kicks: KICKS, count: N,
        sweep0: SWEEP0, sweep: sweepStep(firstYear.items.length), typed: QUERY.length,
        firstYearCount: firstYear.items.length, lastYearCount: lastYear.items.length,
        spotlight: spotlight.map(function (p) { return p.name; }), hits: hits.length,
        branchTimes: projects.map(function (p) { return +(S.tpl + 0.9 + Math.abs(p.rx - 960) / 710 * 1.3 + 1.1).toFixed(3); })
      }
    };
  }

  root.OHIntro = {
    create: create, parsePage: parsePage, isModule: isModule, groupOf: groupOf, W: VW, H: VH,
    // 纸本版（intro-paper.js）共用
    util: { clamp01: clamp01, mix: mix, seg: seg, smooth: smooth, ease: ease, easeOut: easeOut, bump: bump, mulberry32: mulberry32 }
  };
})(typeof window !== "undefined" ? window : this);
