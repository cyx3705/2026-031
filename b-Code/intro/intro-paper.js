/*
 * OneHistory 介绍动画 · 纸本版（浅色）
 *
 * 一本正在书写的项目史：扉页 → 目录 → 五章 → 尾声，章与章之间翻页。
 * 暖象牙纸面、墨色正文、站点的金黄色做强调；项目是索引卡，模块是「图版 + 词典词条」。
 * 陶土红只属于 Claude：手写批注、圈注，以及沿笔迹移动的星芒笔尖（Claude 的小形象）。
 * 与深色版共用数据规则：分组、计数、模块介绍全部从 projects.json 与各项目说明页推导。
 *
 * 依赖 intro.js（先加载，共用 parsePage / groupOf / 缓动工具）。
 *   var intro = OHIntroPaper.create(canvas, { projects, details, logo, builtAt });
 *   intro.render(t);
 */
(function (root) {
  "use strict";

  var OH = root.OHIntro;
  if (!OH || !OH.util) throw new Error("intro-paper.js 需要先加载 intro.js");
  var U = OH.util, clamp01 = U.clamp01, mix = U.mix, seg = U.seg, smooth = U.smooth, ease = U.ease, easeOut = U.easeOut, mulberry32 = U.mulberry32;

  var VW = 1920, VH = 1080, CW = 332, CH = 172;
  var X0 = 180, X1 = 1740;          // 标尺与家谱树的横向范围
  var DW = 2.0;                     // 每个模块词条的停留时长
  var WIPE = 0.8;                   // 翻页时长

  var P = {
    paper: "#F5F0E8", paperRGB: [245, 240, 232], card: "#FFFDF9",
    ink: "#1F1D1A", ink2: "#5E5850", ink3: "#9A9186", rule: "#DDD4C6",
    gold: [168, 122, 18],      // 站点浅色主题的 --accent
    clay: [217, 119, 87],      // Claude 的批注色
    blue: [62, 92, 118]
  };
  var SERIF = "\"Source Serif 4\", \"Noto Serif SC\", serif";
  var ITALIC = "italic 400 30px \"Source Serif 4\", \"Noto Serif SC\", serif";
  var SANS = "\"Noto Sans SC\", \"Microsoft YaHei\", sans-serif";
  var MONO = "\"JetBrains Mono\", \"Noto Sans SC\", monospace";
  var HAND = "\"LXGW WenKai\", \"LXGW WenKai TC\", \"Noto Serif SC\", serif";
  var CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八"];

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(4)) + ")"; }
  function gold(a) { return rgba(P.gold, a == null ? 1 : a); }
  function clay(a) { return rgba(P.clay, a == null ? 1 : a); }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function create(canvas, opts) {
    var ctx = canvas.getContext("2d");
    var logo = opts.logo;
    var rnd = mulberry32(20260928);
    var details = opts.details || {};

    // ---------- 数据（规则同深色版） ----------
    var projects = opts.projects.map(function (p) {
      var q = {}; for (var k in p) q[k] = p[k];
      q.g = OH.groupOf(p); q.d = details[p.id] || null;
      q.rot = (rnd() - 0.5) * 0.042;             // 索引卡的一点点歪斜
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
    var templates = group("0000").items, others = group("other").items;
    var modules = projects.filter(OH.isModule);
    var hub = modules.filter(function (p) { return p.d && p.d.host; })[0] || null;
    var sats = modules.filter(function (p) { return p !== hub; });
    var spotlight = (hub ? [hub] : []).concat(sats);
    var owner = String(projects[0] && projects[0].repo || "").split("/")[0];
    var QUERY = "AGV";
    function matches(p) { return (p.id + " " + p.name + " " + p.note + " " + p.repo).toLowerCase().indexOf(QUERY.toLowerCase()) >= 0; }
    var hits = projects.filter(matches).slice(0, 5);
    var agvFirst = firstYear.items.filter(function (p) { return /AGV/i.test(p.name + " " + p.note); });

    // 标尺位置：组间留空
    (function () {
      var GAP = 2.4, slots = (N - 1) + GAP * (groups.length - 1), step = (X1 - X0) / Math.max(1, slots), s = 0;
      groups.forEach(function (g, gi) {
        if (gi) s += GAP;
        g.items.forEach(function (p) { p.tx = X0 + s * step; s += 1; });
        s -= 1;
      });
    })();

    // ---------- 章节表 ----------
    var chapters = [
      { key: "title", len: 5.5 },
      { key: "toc", len: 4.5 },
      { key: "num", len: 6.5, name: "编号即历史" },
      { key: "y1", len: 6.5, name: firstYear.label },
      { key: "mod", len: 2.2 + spotlight.length * DW + 0.8, name: "History 模块" },
      { key: "y2", len: 8.5, name: lastYear.label },
      { key: "tpl", len: 5.5, name: "从模板开始" },
      { key: "coda", len: 6.5, name: "尾声" }
    ];
    var acc = 0, no = 0;
    chapters.forEach(function (c) { c.start = acc; acc += c.len; if (c.name && c.key !== "coda") c.no = CN_NUM[no++]; });
    var DUR = acc;
    function chap(key) { for (var i = 0; i < chapters.length; i++) if (chapters[i].key === key) return chapters[i]; }

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
      ctx.font = "600 23px " + SERIF; p.nameFit = ellipsize(p.name, CW - 36);
      ctx.font = "400 14.5px " + SANS; p.noteLines = wrap(p.note || "", CW - 36, 2);
      if (!OH.isModule(p)) return;
      var d = p.d || { position: p.note || "", caps: [] };
      p.head = p.name.replace(/^History/, "") || p.name;
      ctx.font = "400 25px " + SERIF; p.defLines = wrap(d.position || p.note || "", 770, 3);
      p.capRows = (d.caps || []).slice(0, 4).map(function (c) {
        ctx.font = "500 15px " + MONO; var k = ellipsize(c.k, 210);
        ctx.font = "400 17px " + SANS; var u = ellipsize(c.use, 590);
        return { k: k, use: u };
      });
      ctx.font = "400 16px " + SANS; p.uiFit = d.ui ? ellipsize("界面：" + d.ui, 380) : "";
      ctx.font = "400 21px " + HAND; p.etymFit = d.etym ? ellipsize("词源 · " + d.etym, 740) : "";
    });
    ctx.restore();

    // ---------- 纸：点阵 + 纸纹 ----------
    var dotPat, grainPat;
    (function () {
      var c = document.createElement("canvas"); c.width = c.height = 36;
      var g = c.getContext("2d"); g.fillStyle = "rgba(31,29,26,0.075)"; g.beginPath(); g.arc(18, 18, 1.15, 0, Math.PI * 2); g.fill();
      dotPat = ctx.createPattern(c, "repeat");
      var n = document.createElement("canvas"); n.width = n.height = 256;
      var h = n.getContext("2d"), r2 = mulberry32(7);
      for (var i = 0; i < 2600; i++) {
        h.fillStyle = r2() < 0.5 ? "rgba(90,70,50," + (0.02 + r2() * 0.05).toFixed(3) + ")" : "rgba(255,255,255," + (0.05 + r2() * 0.08).toFixed(3) + ")";
        h.fillRect(r2() * 256, r2() * 256, 1 + r2() * 1.6, 1 + r2() * 1.6);
      }
      grainPat = ctx.createPattern(n, "repeat");
    })();

    function paper(dots) {
      ctx.fillStyle = P.paper; ctx.fillRect(0, 0, VW, VH);
      if (dots) { ctx.fillStyle = dotPat; ctx.fillRect(0, 0, VW, VH); }
      ctx.fillStyle = grainPat; ctx.fillRect(0, 0, VW, VH);
      var v = ctx.createRadialGradient(960, 540, 420, 960, 540, 1250);
      v.addColorStop(0, "rgba(255,252,245,0)"); v.addColorStop(1, "rgba(150,118,84,0.13)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
    }

    // ---------- 基础绘制 ----------
    function text(s, x, y, font, color, align) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(s, x, y);
    }
    function width(s, font) { ctx.font = font; return ctx.measureText(s).width; }

    // Claude 的小形象：陶土红星芒，长短相间的八道光
    function spark(x, y, r, rot, a) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = clay(a == null ? 1 : a);
      for (var i = 0; i < 8; i++) {
        var len = r * (i % 2 ? 0.66 : 1);
        ctx.save(); ctx.rotate(i * Math.PI / 4);
        ctx.beginPath(); ctx.ellipse(0, -len * 0.52, r * 0.15, len * 0.52, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // 按长度画出折线的前 k 部分：所有「笔迹」都靠它。tip=true 时笔尖处跟着 Claude 的星芒
    function strokePts(pts, k, tip) {
      if (k <= 0 || pts.length < 2) return;
      var L = [0], tot = 0, i, ex = pts[0][0], ey = pts[0][1];
      for (i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
      var target = tot * clamp01(k);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) {
        if (L[i] <= target) { ctx.lineTo(pts[i][0], pts[i][1]); ex = pts[i][0]; ey = pts[i][1]; continue; }
        var f = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
        ex = mix(pts[i - 1][0], pts[i][0], f); ey = mix(pts[i - 1][1], pts[i][1], f);
        ctx.lineTo(ex, ey);
        break;
      }
      ctx.stroke();
      if (tip && k < 1) spark(ex + 9, ey - 11, 9, target * 0.02, Math.min(1, k * 8) * Math.min(1, (1 - k) * 8));
    }
    // 手绘感的直线：沿法向轻微抖动
    function handLine(x0, y0, x1, y1, seed, amp) {
      var pts = [], n = 16, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      for (var i = 0; i <= n; i++) {
        var u = i / n, o = (Math.sin(u * 7.3 + seed) * 0.6 + Math.sin(u * 17.1 + seed * 2.3) * 0.4) * (amp == null ? 1.2 : amp) * Math.sin(Math.PI * u);
        pts.push([x0 + dx * u + nx * o, y0 + dy * u + ny * o]);
      }
      return pts;
    }
    // 手绘圈注：略带起伏、首尾交叠一点
    function handEllipse(cx, cy, rx, ry, seed, tilt) {
      var pts = [], n = 80, a0 = -2.2 + Math.sin(seed) * 0.4;
      for (var i = 0; i <= n; i++) {
        var a = a0 + (i / n) * (Math.PI * 2 + 0.45);
        var r = 1 + 0.035 * Math.sin(a * 3 + seed) + 0.02 * Math.sin(a * 5 + seed * 1.7) + (i / n) * 0.04;
        var x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
        pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
      }
      return pts;
    }
    function roundRectPts(x, y, w, h, r) {
      var pts = [], i, n = 6;
      function arc(cx, cy, a0) { for (i = 0; i <= n; i++) { var a = a0 + (i / n) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } }
      pts.push([x + r, y]); arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
      pts.push([x + r, y]);
      return pts;
    }
    function pen(color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; }
    function arrowHead(x, y, ang, s) {
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang - 0.45) * s, y - Math.sin(ang - 0.45) * s); ctx.lineTo(x, y);
      ctx.lineTo(x - Math.cos(ang + 0.45) * s, y - Math.sin(ang + 0.45) * s); ctx.stroke();
    }

    // 索引卡：陶土红标题线 + 蓝色横格
    function drawCard(p, x, y, s, rot, o) {
      o = o || {};
      var lift = o.lift || 0;
      ctx.save();
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      ctx.translate(x + CW * s / 2, y + CH * s / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-CW / 2, -CH / 2);
      ctx.shadowColor = "rgba(80,55,30," + (0.13 + 0.12 * lift).toFixed(3) + ")";
      ctx.shadowBlur = 16 + 26 * lift; ctx.shadowOffsetY = 5 + 14 * lift;
      ctx.fillStyle = P.card; ctx.beginPath(); ctx.roundRect(0, 0, CW, CH, 5); ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = gold(0.5); ctx.fillRect(18, 84, CW - 36, 1.3);
      ctx.fillStyle = rgba(P.blue, 0.11); ctx.fillRect(18, 113, CW - 36, 1); ctx.fillRect(18, 137, CW - 36, 1);
      text(p.id, 18, 32, "500 13px " + MONO, gold(1));
      text(p.nameFit, 18, 70, "600 23px " + SERIF, P.ink);
      for (var i = 0; i < p.noteLines.length; i++) text(p.noteLines[i], 18, 107 + i * 24, "400 14.5px " + SANS, P.ink2);
      text(p.ext ? "外部仓库" : "github.com/" + p.repo, 18, 160, "400 11.5px " + MONO, P.ink3);
      if (o.ring) { pen(gold(0.7 * o.ring), 2); ctx.beginPath(); ctx.roundRect(-4, -4, CW + 8, CH + 8, 8); ctx.stroke(); }
      ctx.restore();
    }
    // 卡片落到桌面：从上方带点旋转落下
    function dropCard(p, x, y, s, u, t0, o) {
      var k = seg(u, t0, t0 + 0.7);
      if (k <= 0) return;
      var e = easeOut(k);
      o = o || {};
      drawCard(p, x, y - (1 - e) * 46, s, p.rot * (1 + (1 - e) * 3), { alpha: smooth(0, 0.35, k) * (o.alpha == null ? 1 : o.alpha), lift: Math.max(1 - e, o.lift || 0), ring: o.ring });
    }

    function cropMarks(a) {
      ctx.save(); ctx.globalAlpha = a; pen(P.ink3, 1);
      [[56, 56, 1, 1], [VW - 56, 56, -1, 1], [56, VH - 56, 1, -1], [VW - 56, VH - 56, -1, -1]].forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(c[0] - c[2] * 14, c[1]); ctx.lineTo(c[0] + c[2] * 26, c[1]);
        ctx.moveTo(c[0], c[1] - c[3] * 14); ctx.lineTo(c[0], c[1] + c[3] * 26); ctx.stroke();
      });
      ctx.restore();
    }

    function furniture(c, u) {
      text("OneHistory · 项目史", 96, 64, "500 17px " + SERIF, P.ink3);
      text((c.no ? "第" + c.no + "章 · " : "") + c.name, 1824, 64, "500 17px " + SERIF, P.ink3, "right");
      ctx.fillStyle = P.rule; ctx.fillRect(96, 82, 1728, 1);
      text("— " + fmt(c.start + u) + " —", 960, 1042, "400 14px " + MONO, P.ink3, "center");
    }

    function heading(u, c, title, note, fade) {
      var f = fade == null ? 1 : fade;
      if (f <= 0.001) return;
      ctx.save(); ctx.globalAlpha = f;
      text("第" + c.no + "章", 96, 166, "400 25px " + HAND, gold(smooth(0.4, 1.0, u)));
      var font = /^[\x00-\x7F]+$/.test(title) ? "600 64px " + SERIF : "600 58px " + SERIF;
      var tw = width(title, font);
      var k = ease(seg(u, 0.5, 1.2));
      ctx.save(); ctx.beginPath(); ctx.rect(90, 170, (tw + 24) * k, 90); ctx.clip();
      text(title, 96, 238, font, P.ink); ctx.restore();
      pen(gold(0.9), 3); strokePts(handLine(98, 262, 170, 261, 3, 0.8), ease(seg(u, 1.0, 1.4)));
      if (note) {
        var na = smooth(1.2, 1.8, u);
        ctx.globalAlpha = f * na;
        text(note, 96 + tw + 40 + (1 - na) * 10, 234, "400 25px " + HAND, P.ink2);
      }
      ctx.restore();
    }

    // ---------- 扉页 / 尾声 ----------
    function drawTitle(u, coda) {
      cropMarks(smooth(0, 0.8, u) * 0.8);
      var k = ease(seg(u, 0.3, 1.6));
      if (k > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(708, 320, 504 * k, 210); ctx.clip();
        ctx.drawImage(logo, 720, 340, 480, 171);
        ctx.restore();
      }
      pen(gold(0.9), 3.2); strokePts(handLine(790, 550, 1130, 546, 5, 2.2), ease(seg(u, 1.4, 2.2)), true);
      var sa = smooth(1.9, 2.6, u);
      ctx.save(); ctx.globalAlpha = sa;
      text("一份按编号写成的项目史", 960, 622 + (1 - sa) * 10, "400 36px " + SERIF, P.ink2, "center");
      ctx.globalAlpha = smooth(2.4, 3.1, u);
      text(N + " 个公开项目  ·  " + firstYear.label + " — " + lastYear.label + "  ·  github.com/" + owner, 960, 676, "400 18px " + MONO, P.ink3, "center");
      if (coda) {
        // 版权页落款：Claude 的星芒 + 名字用陶土红，其余说明用浅墨
        var ca = smooth(3.4, 4.2, u);
        ctx.globalAlpha = ca;
        var CF = "400 20px " + HAND;
        var parts = [["本片由 ", P.ink3], ["Claude", clay(1)], [" 用代码逐帧绘制  ·  项目、分组与模块介绍均取自站点数据" + (opts.builtAt ? "  ·  目录更新于 " + opts.builtAt : ""), P.ink3]];
        var tot = 34 + parts.reduce(function (s, q) { return s + width(q[0], CF); }, 0), cx0 = 960 - tot / 2;
        spark(cx0 + 11, 951, 12, u * 0.6, ca);
        cx0 += 34;
        parts.forEach(function (q) { text(q[0], cx0, 958, CF, q[1]); cx0 += width(q[0], CF); });
        // 落款的印章
        var st = seg(u, 2.9, 3.2);
        if (st > 0) {
          ctx.globalAlpha = Math.min(1, st * 2) * 0.92;
          ctx.save(); ctx.translate(1214, 612); ctx.rotate(-0.1); var sc = mix(1.7, 1, easeOut(st)); ctx.scale(sc, sc);
          ctx.fillStyle = gold(1); ctx.beginPath(); ctx.roundRect(-24, -24, 48, 48, 6); ctx.fill();
          text("史", 0, 12, "700 32px " + SERIF, P.card, "center");
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ---------- 目录 ----------
    function drawToc(u) {
      cropMarks(0.5);
      var ka = ease(seg(u, 0.3, 0.9));
      ctx.save(); ctx.beginPath(); ctx.rect(550, 170, 240 * ka, 100); ctx.clip();
      text("目录", 560, 248, "600 64px " + SERIF, P.ink); ctx.restore();
      pen(gold(0.9), 3); strokePts(handLine(562, 272, 636, 271, 9, 0.8), ease(seg(u, 0.8, 1.2)));
      ctx.save(); ctx.globalAlpha = smooth(0.9, 1.5, u);
      text("全片 " + fmt(DUR), 1360, 246, "400 24px " + HAND, clay(1), "right");
      // 图例：告诉观众哪些笔迹是 Claude 留下的
      var la = smooth(2.2, 2.8, u), LF = "400 21px " + HAND, LT = "陶土红的笔迹是 Claude 的批注";
      ctx.globalAlpha = la;
      spark(1360 - width(LT, LF) - 22, 894, 10, u * 0.5, la);
      text(LT, 1360, 901, LF, clay(1), "right");
      ctx.restore();
      var list = chapters.filter(function (c) { return c.name; });
      list.forEach(function (c, i) {
        var y = 356 + i * 84, a = smooth(0.8 + i * 0.16, 1.3 + i * 0.16, u), dx = (1 - a) * 18;
        ctx.save(); ctx.globalAlpha = a;
        text(c.no || "", 560 + dx, y, "600 30px " + SERIF, gold(1));
        var nf = "500 32px " + SERIF, nw = width(c.name, nf);
        text(c.name, 616 + dx, y, nf, P.ink);
        ctx.fillStyle = "rgba(94,88,80,0.45)";
        for (var x = 616 + nw + 22; x < 1360 - 92; x += 12) ctx.fillRect(x + dx, y - 7, 2.2, 2.2);
        text(fmt(c.start), 1360 + dx, y, "400 24px " + MONO, P.ink2, "right");
        ctx.restore();
        if (i === 0) { pen(gold(0.85), 2.6); strokePts(handLine(614, y + 14, 616 + nw + 4, y + 12, 11, 1), ease(seg(u, 3.3, 3.9)), true); }
      });
    }

    // ---------- 第一章：编号即历史 ----------
    function drawNumbering(u, c) {
      heading(u, c, "编号即历史", "每个项目一个编号：年份 + 当年序号");
      var ID = "2026-031", F = "600 150px " + MONO;
      var full = width(ID, F), x0 = 960 - full / 2, n = Math.floor(seg(u, 1.0, 2.2) * ID.length + 1e-4);
      if (n > 0) {
        var shown = ID.slice(0, n);
        text(shown, x0, 500, F, P.ink);
        if (u < 2.8 && Math.floor(u * 2.4) % 2 === 0) { ctx.fillStyle = gold(1); ctx.fillRect(x0 + width(shown, F) + 6, 384, 5, 128); }
      }
      var wy = width("2026", F), wd = width("2026-", F);
      [[x0, x0 + wy, "年份", 2.4, -34], [x0 + wd, x0 + full, "当年第 " + parseInt(ID.slice(5), 10) + " 个", 2.9, 34]].forEach(function (b, i) {
        var mid = (b[0] + b[1]) / 2, k = seg(u, b[3], b[3] + 0.5);
        if (k <= 0) return;
        pen(clay(0.9), 2.6);
        var pts = [];
        for (var s = 0; s <= 24; s++) { var w = s / 24; pts.push([mix(b[0] + 8, b[1] - 8, w), 532 + Math.sin(Math.PI * w) * 16 + Math.sin(w * 9 + i) * 1.2]); }
        strokePts(pts, ease(k), true);
        var lk = seg(u, b[3] + 0.4, b[3] + 0.7);
        strokePts(handLine(mid, 552, mid + b[4], 602, i + 4, 1), ease(lk), true);
        if (lk >= 1) arrowHead(mid + b[4], 602, Math.atan2(50, b[4]), 10);
        ctx.save(); ctx.globalAlpha = smooth(b[3] + 0.6, b[3] + 1.0, u);
        text(b[2], mid + b[4], 644, "400 32px " + HAND, clay(1), "center");
        ctx.restore();
      });

      // 标尺：所有项目按编号落在一条线上
      var rk = ease(seg(u, 3.6, 4.6)), penX = mix(X0, X1, rk), Y = 800;
      if (rk > 0) {
        pen(P.ink2, 1.4); strokePts(handLine(X0 - 20, Y, X1 + 20, Y, 2, 0.8), rk);
        groups.forEach(function (g) {
          g.items.forEach(function (p, j) {
            if (p.tx > penX) return;
            pen(j === 0 ? P.ink : P.ink2, j === 0 ? 1.6 : 1.1);
            ctx.beginPath(); ctx.moveTo(p.tx, Y); ctx.lineTo(p.tx, Y - (j === 0 ? 30 : 13)); ctx.stroke();
          });
          var gx = (g.items[0].tx + g.items[g.items.length - 1].tx) / 2;
          var ga = smooth(0, 0.3, (penX - g.items[0].tx) / 400);
          if (g.items[0].tx > penX) return;
          ctx.save(); ctx.globalAlpha = ga;
          if (/^\d{4}$/.test(g.label)) text(g.label, gx, Y + 50, ITALIC, P.ink, "center");
          else text(g.label, gx, Y + 48, "500 25px " + SERIF, P.ink, "center");
          text(g.items.length + " 个", gx, Y + 84, "500 20px " + SERIF, gold(1), "center");
          ctx.restore();
        });
        var cn = Math.round(N * easeOut(seg(u, 3.6, 4.8)));
        var tailF = "400 26px " + HAND, tw = width(" 个公开项目", tailF);
        ctx.save(); ctx.globalAlpha = smooth(3.6, 4.0, u);
        text(String(cn), X1 - tw, Y - 60, "600 60px " + SERIF, gold(1), "right");
        text(" 个公开项目", X1 - tw, Y - 62, tailF, P.ink2);
        ctx.restore();
      }
    }

    // ---------- 第二章：第一个年份 ----------
    function gridRect(j, cols, top) {
      var gap = 22, gw = cols * CW + (cols - 1) * gap, left = (VW - gw) / 2;
      return { x: left + (j % cols) * (CW + gap), y: top + Math.floor(j / cols) * (CH + 18) };
    }
    function drawFirstYear(u, c) {
      var items = firstYear.items;
      heading(u, c, firstYear.label, items.length + " 个项目：课程设计、竞赛作品，以及第一批 AGV");
      items.forEach(function (p, j) { var r = gridRect(j, 5, 352); dropCard(p, r.x, r.y, 1, u, 0.6 + j * 0.07); });
      // 批注：把第一批 AGV 圈出来
      var span = [];
      agvFirst.forEach(function (p, i) {
        var r = gridRect(items.indexOf(p), 5, 352), k = seg(u, 3.0 + i * 0.5, 3.6 + i * 0.5);
        span.push(r.x + CW / 2);
        if (k <= 0) return;
        pen(clay(0.85), 2.8); strokePts(handEllipse(r.x + CW / 2, r.y + CH / 2, CW / 2 + 12, CH / 2 + 14, i * 2.1 + 1, -0.03), ease(k), true);
      });
      if (agvFirst.length) {
        var na = smooth(3.4, 3.9, u), cx = (Math.min.apply(null, span) + Math.max.apply(null, span)) / 2;
        ctx.save(); ctx.globalAlpha = na;
        text("第一批 AGV", cx, 316, "400 27px " + HAND, clay(1), "center");
        ctx.restore();
      }
    }

    // ---------- 第三章：History 模块（图版 + 词条） ----------
    var HC = { x: 498, y: 648 }, RING = 236;
    function satAng(j) { return -Math.PI / 2 + Math.PI / 8 + j * Math.PI * 2 / Math.max(1, sats.length); }
    function drawModules(u, c) {
      var K = sats.length;
      heading(u, c, "History 模块", hub ? K + " 个模块装在宿主 " + hub.name + " 上，各管一件事" : modules.length + " 个模块，各管一件事");
      var fi = Math.floor((u - 2.2) / DW), local = u - 2.2 - fi * DW;
      function focusOf(j) { return smooth(2.2 + j * DW - 0.2, 2.2 + j * DW + 0.15, u) * (1 - smooth(2.2 + (j + 1) * DW - 0.2, 2.2 + (j + 1) * DW + 0.15, u)); }
      var hubF = hub ? focusOf(0) : 0;

      // 图版框与图注
      pen(P.rule, 1.2); strokePts(roundRectPts(96, 322, 812, 676, 4), ease(seg(u, 0.6, 1.5)));
      ctx.save(); ctx.globalAlpha = smooth(1.2, 1.7, u);
      text("图 1　OneHistory 模块结构", 120, 978, "400 17px " + SERIF, P.ink3);
      ctx.setLineDash([3, 7]); pen(P.rule, 1);
      ctx.beginPath(); ctx.arc(HC.x, HC.y, RING, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(HC.x, HC.y, RING * 0.52, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 辐条与节点
      sats.forEach(function (p, j) {
        var a = satAng(j), nx = HC.x + Math.cos(a) * RING, ny = HC.y + Math.sin(a) * RING;
        var sk = ease(seg(u, 1.0 + j * 0.08, 1.6 + j * 0.08));
        var own = focusOf(j + (hub ? 1 : 0));
        var f = Math.max(own, hubF * 0.6);          // 聚焦宿主时所有辐条一起亮，节点本身不染色
        pen(f > 0.02 ? gold(0.35 + 0.6 * f) : P.ink2, 1.2 + 1.2 * f);
        strokePts([[HC.x + Math.cos(a) * 52, HC.y + Math.sin(a) * 52], [nx - Math.cos(a) * 12, ny - Math.sin(a) * 12]], sk);
        if (f > 0.05) { // 当前模块的辐条上跑一个点：宿主 → 模块
          var w = (u * 0.9) % 1, px = mix(HC.x + Math.cos(a) * 52, nx, w), py = mix(HC.y + Math.sin(a) * 52, ny, w);
          ctx.fillStyle = gold(f * Math.sin(Math.PI * w)); ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
        }
        var na = smooth(1.3 + j * 0.08, 1.7 + j * 0.08, u);
        if (na <= 0) return;
        ctx.save(); ctx.globalAlpha = na;
        ctx.fillStyle = own > 0.3 ? gold(1) : P.card; ctx.beginPath(); ctx.arc(nx, ny, 10 + 3 * own, 0, Math.PI * 2); ctx.fill();
        pen(own > 0.3 ? gold(1) : P.ink, 1.5); ctx.stroke();
        var lx = HC.x + Math.cos(a) * (RING + 28), ly = HC.y + Math.sin(a) * (RING + 28);
        var al = Math.cos(a) > 0.3 ? "left" : Math.cos(a) < -0.3 ? "right" : "center";
        var dy = Math.sin(a) > 0.3 ? 20 : Math.sin(a) < -0.3 ? -14 : 6;
        text(p.head, lx, ly + dy, "600 24px " + SERIF, own > 0.3 ? gold(1) : P.ink, al);
        text((p.d && p.d.domain) || p.id, lx, ly + dy + 21, "400 13px " + MONO, P.ink3, al);
        ctx.restore();
      });
      if (hub) {
        var ha = smooth(0.8, 1.3, u);
        ctx.save(); ctx.globalAlpha = ha;
        ctx.fillStyle = hubF > 0.3 ? gold(0.12) : P.card; ctx.beginPath(); ctx.arc(HC.x, HC.y, 50, 0, Math.PI * 2); ctx.fill();
        pen(hubF > 0.3 ? gold(1) : P.ink, 1.6); ctx.stroke();
        pen(P.rule, 1); ctx.beginPath(); ctx.arc(HC.x, HC.y, 43, 0, Math.PI * 2); ctx.stroke();
        text(hub.head, HC.x, HC.y + 4, "600 22px " + SERIF, P.ink, "center");
        text("宿主", HC.x, HC.y + 26, "400 17px " + HAND, gold(1), "center");
        ctx.restore();
      }

      // 词条
      if (fi < 0 || !spotlight.length) return;
      if (fi >= spotlight.length) { fi = spotlight.length - 1; local = u - 2.2 - fi * DW; }   // 最后一个词条停到翻页
      var p = spotlight[fi], d = p.d || {};
      var inA = smooth(0, 0.35, local), outA = fi === spotlight.length - 1 ? 1 : 1 - smooth(DW - 0.25, DW, local);
      var a = inA * outA * smooth(2.0, 2.3, u), dy = (1 - inA) * 16 - (1 - outA) * 12, x0 = 1000;
      if (a <= 0.001) return;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, dy);
      text(p.id, x0, 372, "500 15px " + MONO, P.ink3);
      if (d.role) text(d.role, x0 + width(p.id, "500 15px " + MONO) + 18, 372, "400 15px " + SANS, P.ink3);
      text((fi + 1) + " / " + spotlight.length, 1824, 372, "500 15px " + MONO, gold(1), "right");
      if (p.head !== p.name) text("History", x0, 424, ITALIC, gold(1));
      var hk = ease(seg(local, 0.05, 0.5));
      ctx.save(); ctx.beginPath(); ctx.rect(x0 - 8, 420, 820 * hk, 110); ctx.clip();
      text(p.head, x0 - 4, 508, "700 92px " + SERIF, P.ink); ctx.restore();
      var px0 = x0;
      if (d.domain) { text("/" + d.domain + "/", x0, 552, "400 22px " + MONO, P.ink2); px0 += width("/" + d.domain + "/", "400 22px " + MONO) + 24; }
      if (p.uiFit) text(p.uiFit, px0, 551, "400 16px " + SANS, P.ink3);
      ctx.fillStyle = P.rule; ctx.fillRect(x0, 578, 1824 - x0, 1);
      var y = 628;
      p.defLines.forEach(function (ln, i) {
        if (i === 0) text("1.", x0, y, "600 25px " + SERIF, gold(1));
        text(ln, x0 + 38, y + i * 42, "400 25px " + SERIF, P.ink);
      });
      y += p.defLines.length * 42 + 4;
      if (p.etymFit) { text(p.etymFit, x0 + 38, y + 2, "400 21px " + HAND, gold(1)); y += 44; }
      text("能　力", x0, y + 22, "500 15px " + SANS, P.ink3);
      p.capRows.forEach(function (row, r) {
        var ry = y + 58 + r * 36, rk = smooth(0.15 + r * 0.07, 0.45 + r * 0.07, local);
        ctx.save(); ctx.globalAlpha *= rk; ctx.translate((1 - rk) * 12, 0);
        text(row.k, x0, ry, "500 15px " + MONO, gold(1));
        text(row.use, x0 + 228, ry, "400 17px " + SANS, P.ink2);
        ctx.fillStyle = "rgba(221,212,198,0.8)"; ctx.fillRect(x0, ry + 12, 1824 - x0, 1);
        ctx.restore();
      });
      ctx.restore();
    }

    // ---------- 第四章：最新年份 + 搜索 ----------
    var DS = 0.72;
    function deskRect(j, u, n) {
      var rows = 4, cols = Math.ceil(n / rows), w = CW * DS + 16, h = CH * DS + 14;
      var r = j % rows, cc = Math.floor(j / rows), total = cols * w - 16;
      var dir = r % 2 ? 1 : -1;
      return { x: (VW - total) / 2 + [-40, 30, -10, 50][r] + cc * w + dir * 18 * (u - 2), y: 338 + r * h };
    }
    function resultRect(i) {
      var k = hits.length, gap = 26, w = k * CW + (k - 1) * gap;
      return { x: (VW - w) / 2 + i * (CW + gap), y: 292 };
    }
    function drawLastYear(u, c) {
      var items = lastYear.items, n = items.length;
      var hf = 1 - smooth(3.5, 3.9, u);
      heading(u, c, lastYear.label, n + " 个项目：整车与机构设计、CAD 与 PLC 学习，还有这套工具本身", hf);
      var fade = 1 - 0.92 * smooth(5.3, 6.0, u), m = ease(seg(u, 5.3, 6.4));
      items.forEach(function (p, j) {
        if (hits.indexOf(p) >= 0) return;
        var r = deskRect(j, u, n); dropCard(p, r.x, r.y, DS, u, 0.5 + j * 0.035, { alpha: fade });
      });
      hits.forEach(function (p, i) {
        var R = resultRect(i), j = items.indexOf(p);
        var ring = smooth(6.4, 6.8, u);
        if (j >= 0) {
          var r = deskRect(j, u, n), k = seg(u, 0.5 + j * 0.035, 1.2 + j * 0.035);
          if (k <= 0) return;
          var e = easeOut(k), x = mix(r.x, R.x, m), y = mix(r.y - (1 - e) * 46, R.y, m) - Math.sin(Math.PI * m) * 30;
          drawCard(p, x, y, mix(DS, 1, m), mix(p.rot * (1 + (1 - e) * 3), 0, m), { alpha: smooth(0, 0.35, k), lift: Math.max(1 - e, Math.sin(Math.PI * m)), ring: ring });
        } else {
          var k2 = seg(u, 5.5 + i * 0.1, 6.3 + i * 0.1);
          if (k2 <= 0) return;
          var e2 = easeOut(k2);
          drawCard(p, R.x, R.y - (1 - e2) * 60, 1, p.rot * (1 - e2) * 3, { alpha: smooth(0, 0.35, k2), lift: 1 - e2, ring: ring });
        }
      });
      // 搜索框：先用笔画出来，再打字
      var sk = seg(u, 3.9, 4.5);
      if (sk > 0) {
        var fx = 960 - 380, fy = 152;
        pen(P.ink, 1.6); strokePts(roundRectPts(fx, fy, 760, 72, 14), ease(sk));
        ctx.save(); ctx.globalAlpha = smooth(4.2, 4.5, u);
        pen(P.ink2, 2.2); ctx.beginPath(); ctx.arc(fx + 42, fy + 34, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx + 50, fy + 42); ctx.lineTo(fx + 59, fy + 51); ctx.stroke();
        var typed = QUERY.slice(0, Math.floor(seg(u, 4.6, 5.2) * QUERY.length + 1e-4));
        if (typed) text(typed, fx + 78, fy + 47, "500 30px " + MONO, P.ink);
        else text("搜索项目名、编号或关键词", fx + 78, fy + 45, "400 24px " + SERIF, P.ink3);
        if (u < 6.2 && Math.floor(u * 2.6) % 2 === 0) { ctx.fillStyle = gold(1); ctx.fillRect(fx + 82 + (typed ? width(typed, "500 30px " + MONO) : -4), fy + 18, 2.5, 36); }
        ctx.restore();
        var ck = seg(u, 6.3, 6.8);
        if (ck > 0) { pen(clay(0.85), 2.4); strokePts(handEllipse(fx + 78 + width(QUERY, "500 30px " + MONO) / 2, fy + 37, 50, 26, 4, -0.05), ease(ck), true); }
      }
      var na = smooth(6.6, 7.1, u);
      if (na > 0) {
        var ys = unique(hits.map(function (p) { return p.g.label; }));
        ctx.save(); ctx.globalAlpha = na;
        text(hits.length + " 个匹配，横跨 " + ys.join("、") + "　—— 一个搜索框查全部", 960, 540, "400 27px " + HAND, clay(1), "center");
        ctx.restore();
      }
    }
    function unique(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

    // ---------- 第五章：从模板开始 ----------
    function drawTemplates(u, c) {
      heading(u, c, "从模板开始", "每个项目都由标准模板继承而来");
      var tpl = templates[0], TY = 300, BAR = 606, TICK = 786;
      if (templates[1]) dropCard(templates[1], 300, TY + 12, 1, u, 0.65);
      if (tpl) dropCard(tpl, 960 - CW / 2, TY, 1, u, 0.5);
      // 家谱树：主干 → 横梁 → 每个项目一条垂线
      pen(P.ink, 1.5);
      strokePts([[960, TY + CH + 8], [960, BAR]], ease(seg(u, 1.0, 1.3)));
      var bk = ease(seg(u, 1.3, 1.9));
      if (bk > 0) {
        ctx.beginPath(); ctx.moveTo(mix(960, X0, bk), BAR); ctx.lineTo(mix(960, X1, bk), BAR); ctx.stroke();
      }
      projects.forEach(function (p) {
        var t0 = 1.9 + Math.abs(p.tx - 960) / 780 * 0.7, k = seg(u, t0, t0 + 0.3);
        if (k <= 0) return;
        pen(P.ink2, 1.1); strokePts([[p.tx, BAR], [p.tx, TICK - 4]], k);
        if (k < 1) return;
        ctx.fillStyle = p.g.key === "0000" ? gold(1) : P.ink; ctx.beginPath(); ctx.arc(p.tx, TICK, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.globalAlpha = smooth(t0 + 0.3, t0 + 0.6, u);
        ctx.translate(p.tx + 3, TICK + 12); ctx.rotate(Math.PI * 0.3);
        text(p.id, 0, 0, "400 11px " + MONO, P.ink2);
        ctx.restore();
      });
      var ga = smooth(2.8, 3.4, u);
      if (ga > 0) {
        ctx.save(); ctx.globalAlpha = ga; pen(P.ink3, 1);
        groups.forEach(function (g) {
          var a = g.items[0].tx - 6, b = g.items[g.items.length - 1].tx + 6, y = 902;
          ctx.beginPath(); ctx.moveTo(a, y - 8); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 8); ctx.stroke();
          if (/^\d{4}$/.test(g.label)) text(g.label, (a + b) / 2, y + 36, "italic 400 24px " + SERIF, P.ink, "center");
          else text(g.label, (a + b) / 2, y + 34, "500 21px " + SERIF, P.ink, "center");
        });
        ctx.restore();
      }
      // 其他：外部仓库，用胶带贴上去
      others.forEach(function (p, i) {
        var x = 1290, y = TY + 12 + i * (CH + 30), k = seg(u, 2.6 + i * 0.1, 3.3 + i * 0.1);
        if (k <= 0) return;
        dropCard(p, x, y, 1, u, 2.6 + i * 0.1);
        ctx.save(); ctx.globalAlpha = smooth(0.5, 1, k);
        ctx.translate(x + CW / 2, y - 2); ctx.rotate(-0.06);
        ctx.fillStyle = "rgba(214,196,160,0.62)"; ctx.fillRect(-48, -13, 96, 26);
        ctx.restore();
        if (i === 0) { ctx.save(); ctx.globalAlpha = smooth(3.0, 3.5, u); text("其他 · 外部仓库", x + CW, y - 22, "400 23px " + HAND, gold(1), "right"); ctx.restore(); }
      });
    }

    var DRAW = { title: function (u) { drawTitle(u, false); }, toc: drawToc, num: drawNumbering, y1: drawFirstYear, mod: drawModules, y2: drawLastYear, tpl: drawTemplates, coda: function (u) { drawTitle(u, true); } };

    function drawPage(i, u) {
      var c = chapters[i];
      paper(c.no != null);
      if (c.no) furniture(c, u);
      DRAW[c.key](u, c);
    }

    function render(t) {
      t = Math.max(0, Math.min(DUR - 1e-3, t));
      ctx.setTransform(canvas.width / VW, 0, 0, canvas.height / VH, 0, 0);
      ctx.globalAlpha = 1; ctx.filter = "none"; ctx.globalCompositeOperation = "source-over";
      var i = 0;
      while (i + 1 < chapters.length && chapters[i + 1].start <= t) i++;
      var u = t - chapters[i].start;
      if (i > 0 && u < WIPE) {
        // 翻页：新的一页从右边盖过来，页缘带一点阴影
        drawPage(i - 1, chapters[i - 1].len + u);
        var edge = VW * (1 - ease(u / WIPE));
        ctx.save(); ctx.beginPath(); ctx.rect(edge, 0, VW - edge, VH); ctx.clip();
        drawPage(i, u);
        ctx.restore();
        var sh = ctx.createLinearGradient(edge - 70, 0, edge, 0);
        sh.addColorStop(0, "rgba(80,55,30,0)"); sh.addColorStop(1, "rgba(80,55,30,0.16)");
        ctx.fillStyle = sh; ctx.fillRect(edge - 70, 0, 70, VH);
        ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(edge, 0, 1.5, VH);
      } else {
        drawPage(i, u);
      }
      var fin = 1 - smooth(0, 0.5, t);
      if (fin > 0) { ctx.fillStyle = rgba(P.paperRGB, fin); ctx.fillRect(0, 0, VW, VH); }
    }

    // ---------- 给配乐的时间表：和弦与音效节点，与上面的画面时间一一对应 ----------
    function score() {
      var cues = [], chords = [];
      function S(k) { return chap(k).start; }
      chapters.forEach(function (c, i) { if (i > 0) cues.push({ t: c.start, kind: "page" }); });
      chords.push([0, "Fmaj7"], [S("toc"), "Dm9"], [S("num"), "Bbmaj7"], [S("y1"), "Gm9"], [S("y1") + 3.2, "C6"]);
      var cyc = ["Dm9", "Bbmaj7", "Fmaj7", "C6"];
      for (var t = S("mod"), k = 0; t < S("y2") - 0.5; t += DW * 2, k++) chords.push([t, cyc[k % 4]]);
      chords.push([S("y2"), "Bbmaj7"], [S("y2") + 3.8, "Am7"], [S("tpl"), "Gm9"], [S("tpl") + 2.5, "C6"], [S("coda") + 0.3, "Fmaj9"]);
      [0, S("coda")].forEach(function (b) { cues.push({ t: b + 0.3, kind: "ink", dur: 1.3 }, { t: b + 1.4, kind: "pen", dur: 0.8 }); });
      cues.push({ t: S("coda") + 2.9, kind: "stamp" }, { t: S("coda") + 3.0, kind: "chime", big: true });
      chapters.forEach(function (c) { if (c.no) cues.push({ t: c.start + 1.0, kind: "pen", dur: 0.4 }); });
      chapters.filter(function (c) { return c.name; }).forEach(function (c, i) { cues.push({ t: S("toc") + 0.8 + i * 0.16, kind: "tick" }); });
      cues.push({ t: S("toc") + 3.3, kind: "pen", dur: 0.6 });
      for (var q = 0; q < 8; q++) cues.push({ t: S("num") + 1.0 + q * 0.15, kind: "key" });
      cues.push({ t: S("num") + 2.4, kind: "pen", dur: 0.8 }, { t: S("num") + 2.9, kind: "pen", dur: 0.8 }, { t: S("num") + 3.6, kind: "pen", dur: 1.0 });
      groups.forEach(function (g) { cues.push({ t: S("num") + 3.6 + (g.items[0].tx - X0) / (X1 - X0) * 1.0, kind: "note", n: 3 }); });
      firstYear.items.forEach(function (p, j) { cues.push({ t: S("y1") + 0.6 + j * 0.07 + 0.55, kind: "drop", soft: true }); });
      agvFirst.forEach(function (p, i) { cues.push({ t: S("y1") + 3.0 + i * 0.5, kind: "pen", dur: 0.6 }); });
      cues.push({ t: S("mod") + 0.6, kind: "pen", dur: 0.9 }, { t: S("mod") + 1.0, kind: "pen", dur: 1.2 });
      spotlight.forEach(function (p, j) { cues.push({ t: S("mod") + 2.2 + j * DW, kind: "focus", n: j }); });
      lastYear.items.forEach(function (p, j) { if (j % 2 === 0) cues.push({ t: S("y2") + 0.5 + j * 0.035 + 0.55, kind: "drop", soft: true }); });
      cues.push({ t: S("y2") + 3.9, kind: "pen", dur: 0.6 });
      for (var z = 0; z < QUERY.length; z++) cues.push({ t: S("y2") + 4.6 + z * 0.2, kind: "key" });
      cues.push({ t: S("y2") + 6.3, kind: "chime" }, { t: S("y2") + 6.3, kind: "pen", dur: 0.5 });
      cues.push({ t: S("tpl") + 1.0, kind: "pen", dur: 0.9 });
      projects.forEach(function (p, i) { if (i % 3 === 0) cues.push({ t: S("tpl") + 1.9 + Math.abs(p.tx - 960) / 780 * 0.7 + 0.3, kind: "tick", soft: true }); });
      if (others.length) cues.push({ t: S("tpl") + 3.1, kind: "drop" });
      cues.sort(function (a, b) { return a.t - b.t; });
      return { variant: "paper", DUR: DUR, chapters: chapters.map(function (c) { return { key: c.key, name: c.name || "", start: c.start, len: c.len }; }), chords: chords, cues: cues, spotlight: spotlight.map(function (p) { return p.name; }) };
    }

    return { render: render, duration: DUR, timeline: score() };
  }

  root.OHIntroPaper = { create: create, W: VW, H: VH };
})(typeof window !== "undefined" ? window : this);
