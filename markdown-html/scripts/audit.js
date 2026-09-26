/* ==========================================================================
   markdown-html :: audit.js  (browser)

   Defines window.__bookAudit(). Injected into the built page, then called.

   Why a file and not an inline evaluate: long inline scripts get mangled or
   rejected by browser-automation harnesses. Serve the directory, inject this
   with a <script src>, then call the function. See SKILL.md "Verify".

   What it checks:
     1. WCAG AA contrast for every text node against its composited background
     2. characters-per-line, measured from real paragraphs (NOT from `ch`,
        which overstates the line length on faces with a wide `0` glyph)
     3. horizontal overflow
     4. layout-animating transitions (width/height/top/left on scroll handlers)
     5. table header/cell edge alignment
   ========================================================================== */

window.__bookAudit = function () {
  /* ---- colour: resolve ANY css colour (oklch, color-mix, hex, rgb) to sRGB -- */
  var cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  var cx = cv.getContext('2d', { willReadFrequently: true });

  function toRGBA(css) {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    try { cx.fillStyle = css; } catch (e) { return [0, 0, 0, 1]; }
    cx.fillRect(0, 0, 1, 1);
    var d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function over(fg, bg) {
    var a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) {
    var L1 = lum(a), L2 = lum(b);
    var hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function r2(x) { return Math.round(x * 100) / 100; }

  /* ---- 1. contrast ---------------------------------------------------- */
  var paper = toRGBA(getComputedStyle(document.body).backgroundColor || '#fff');
  if (paper[3] === 0) paper = [255, 255, 255];
  var contrast = [];
  var seen = {};

  Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
    if (el.closest('svg')) return;
    var hasText = Array.prototype.some.call(el.childNodes, function (n) {
      return n.nodeType === 3 && n.textContent.trim();
    });
    if (!hasText) return;
    var st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return;

    /* composite the background stack down to the root */
    var bg = paper, node = el.parentElement, stack = [];
    while (node) {
      var c = toRGBA(getComputedStyle(node).backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] === 1) break; }
      node = node.parentElement;
    }
    for (var i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);

    var fgc = toRGBA(st.color);
    var fg = fgc[3] < 1 ? over(fgc, bg) : fgc;

    var key = st.color + '|' + st.fontSize + '|' + st.fontWeight;
    if (seen[key]) return;
    seen[key] = 1;

    var fs = parseFloat(st.fontSize);
    var large = fs >= 24 || (fs >= 18.66 && +st.fontWeight >= 700);
    var need = large ? 3 : 4.5;
    var got = ratio(fg, bg);
    if (got < need) {
      contrast.push({
        sel: (el.className && String(el.className).slice(0, 34)) || el.tagName,
        color: st.color,
        size: st.fontSize,
        weight: st.fontWeight,
        ratio: r2(got),
        need: need,
        text: el.textContent.trim().slice(0, 34)
      });
    }
  });

  /* ---- 2. characters per line ---------------------------------------- */
  var measures = [];
  var paras = document.querySelectorAll('.prose-doc > p, .note-body, .num-list.is-hairline .body');
  var sampled = 0;
  Array.prototype.forEach.call(paras, function (p, i) {
    if (sampled >= 8) return;
    if (i % 4 !== 0) return;
    var t = p.textContent.replace(/\s+/g, ' ').trim();
    if (t.length < 120) return;
    var cs = getComputedStyle(p);
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
    probe.style.font = cs.font || (cs.fontSize + ' ' + cs.fontFamily);
    probe.style.letterSpacing = cs.letterSpacing;
    probe.style.lineHeight = cs.lineHeight;
    probe.style.width = Math.round(p.getBoundingClientRect().width) + 'px';
    probe.textContent = t;
    document.body.appendChild(probe);
    var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
    var lines = Math.max(1, Math.round(probe.getBoundingClientRect().height / lh));
    measures.push({ chars: t.length, lines: lines, perLine: Math.round(t.length / lines), widthPx: Math.round(p.getBoundingClientRect().width), fontSize: cs.fontSize });
    probe.remove();
    sampled++;
  });

  /* ---- 3. horizontal overflow ----------------------------------------- */
  var de = document.documentElement;
  var overflow = de.scrollWidth - de.clientWidth;
  var offenders = [];
  if (overflow > 0) {
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 1 || r.left < -1) {
        offenders.push({ sel: (el.className && String(el.className).slice(0, 34)) || el.tagName, left: Math.round(r.left), right: Math.round(r.right) });
      }
    });
    offenders = offenders.slice(0, 8);
  }

  /* ---- 4. layout-animating transitions --------------------------------- */
  var layoutProps = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'];
  var badTransitions = [];
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
    var st = getComputedStyle(el);
    if (!st.transitionProperty || st.transitionProperty === 'none' || st.transitionProperty === 'all') return;
    var props = st.transitionProperty.split(',');
    for (var i = 0; i < props.length; i++) {
      if (layoutProps.indexOf(props[i].trim()) > -1) {
        badTransitions.push({ sel: (el.className && String(el.className).slice(0, 34)) || el.tagName, prop: props[i].trim() });
        break;
      }
    }
  });

  /* ---- 5. table header/cell edge alignment ---------------------------- */
  var misaligned = [];
  Array.prototype.forEach.call(document.querySelectorAll('table'), function (t, ti) {
    var rows = t.querySelectorAll('tbody tr');
    if (!rows.length) return;
    var ths = t.querySelectorAll('thead th');
    var tds = rows[0].querySelectorAll('td');
    for (var i = 0; i < ths.length && i < tds.length; i++) {
      var dr = Math.abs(ths[i].getBoundingClientRect().right - tds[i].getBoundingClientRect().right);
      if (dr > 1.5) misaligned.push({ table: ti, col: i, deltaPx: Math.round(dr) });
    }
  });

  /* ---- verdict -------------------------------------------------------- */
  var perLine = measures.length ? measures.map(function (m) { return m.perLine; }) : [];
  var avgPerLine = perLine.length ? Math.round(perLine.reduce(function (a, b) { return a + b; }, 0) / perLine.length) : null;

  var problems = [];
  if (contrast.length) problems.push(contrast.length + ' contrast failure(s) below WCAG AA');
  if (overflow > 0) problems.push('horizontal overflow of ' + overflow + 'px');
  if (badTransitions.length) problems.push(badTransitions.length + ' layout-animating transition(s)');
  if (misaligned.length) problems.push(misaligned.length + ' misaligned table column(s)');
  if (avgPerLine !== null && (avgPerLine < 55 || avgPerLine > 85)) problems.push('measure is ' + avgPerLine + ' chars/line, outside the comfortable 60-80 band');

  return {
    pass: problems.length === 0,
    problems: problems,
    contrast: contrast,
    measure: { samples: measures, avgCharsPerLine: avgPerLine },
    overflowPx: overflow,
    overflowOffenders: offenders,
    layoutTransitions: badTransitions,
    tableAlignment: misaligned
  };
};

/* Console-friendly summary, so you can just log window.__bookAudit(). */
window.__bookAuditReport = function () {
  var r = window.__bookAudit();
  var lines = [];
  lines.push(r.pass ? 'PASS' : 'FAIL — ' + r.problems.join('; '));
  lines.push('measure: ' + (r.measure.avgCharsPerLine === null ? 'n/a' : r.measure.avgCharsPerLine + ' chars/line') +
    ' across ' + r.measure.samples.length + ' sample(s)');
  lines.push('overflow: ' + r.overflowPx + 'px');
  if (r.contrast.length) { lines.push(''); lines.push('CONTRAST:'); r.contrast.forEach(function (c) { lines.push('  ' + c.ratio + ':1 (need ' + c.need + ') ' + c.size + ' ' + c.color + '  .' + c.sel + '  "' + c.text + '"'); }); }
  if (r.layoutTransitions.length) { lines.push(''); lines.push('LAYOUT TRANSITIONS (use transform):'); r.layoutTransitions.forEach(function (t) { lines.push('  ' + t.prop + '  .' + t.sel); }); }
  if (r.tableAlignment.length) { lines.push(''); lines.push('TABLE ALIGNMENT:'); r.tableAlignment.forEach(function (t) { lines.push('  table ' + t.table + ' col ' + t.col + ' off by ' + t.deltaPx + 'px'); }); }
  if (r.overflowOffenders.length) { lines.push(''); lines.push('OVERFLOW OFFENDERS:'); r.overflowOffenders.forEach(function (o) { lines.push('  .' + o.sel + '  ' + o.left + '→' + o.right); }); }
  return lines.join('\n');
};
