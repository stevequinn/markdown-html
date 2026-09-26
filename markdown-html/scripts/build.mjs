#!/usr/bin/env node
/**
 * markdown-html :: build a self-contained book page from markdown.
 *
 *   node build.mjs <input.md> [-o out.html] [--open] [--strict]
 *
 * Emits ONE html file with the theme inlined and no runtime dependency, so it
 * can be opened, emailed, or dropped into any static site as-is.
 *
 * --strict exits non-zero if the parser reported any warning, so a CI check
 * can refuse to ship a document the parser only half-understood.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, inline, highlight, esc } from './markdown.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = resolve(HERE, '..', 'assets', 'theme.css');

/* ------------------------------ args ------------------------------ */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--') && !/^-/.test(a));
const outIdx = argv.indexOf('-o');
const outFlag = outIdx > -1 ? argv[outIdx + 1] : null;

const input = positional[0];
if (!input || !existsSync(input)) {
  console.error('usage: node build.mjs <input.md> [-o out.html] [--open] [--strict]');
  process.exit(1);
}
const outPath = outFlag || resolve(process.cwd(), basename(input, extname(input)) + '.html');
const STRICT = flags.has('--strict');

/* ---------------------------- parse ------------------------------- */

const source = readFileSync(input, 'utf8');
const { blocks, frontmatter, warnings: parseWarnings } = parse(source);
// Inline warnings (reference links, footnotes) are raised at RENDER time, not
// parse time. Collecting them here is what stops the build from silently
// dropping exactly the constructs most likely to be lost.
const warnings = [...parseWarnings];
const collect = (m) => { if (!warnings.includes(m)) warnings.push(m); };

/* ------------------------- render helpers -------------------------- */

const escAttr = (s) => esc(String(s)).replace(/"/g, '&quot;');

const renderInline = (t) => inline(t, collect);

const CHEVRON = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" style="color:var(--ink-3);flex:none"><path d="M4.5 1.5 1.5 7l3 5.5M9.5 1.5 12.5 7l-3 5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderCode(b) {
  const cap = b.caption ? `<figcaption>${CHEVRON}${esc(b.caption)}</figcaption>` : '';
  const pre = `<pre><code>${highlight(b.code, b.lang)}</code></pre>`;
  return `<figure class="fig-code breakout">${cap}${pre}</figure>`;
}

function renderTable(b) {
  const ths = b.head.map((c, i) => {
    const cls = b.align[i] === 'right' ? ' class="num"' : '';
    return `<th scope="col"${cls}>${renderInline(c)}</th>`;
  }).join('');
  const trs = b.rows.map((r, ri) => {
    const rowClass = b.rowTotal ? ' class="row-total"' : b.rowKey && ri === 0 ? ' class="row-key"' : '';
    const tds = r.map((c, i) => {
      const cls = b.align[i] === 'right' ? ' class="num"' : '';
      return `<td${cls}>${renderInline(c)}</td>`;
    }).join('');
    return `<tr${rowClass}>${tds}</tr>`;
  }).join('');
  const wide = b.head.length >= 4;
  return `<figure class="${b.inMeasure ? '' : 'breakout'}">${wide ? '<div class="tbl-scroll">' : ''}<table class="tbl"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>${wide ? '</div>' : ''}</figure>`;
}

function renderList(b) {
  if (b.items.every((it) => it.checked !== null)) {
    return `<ul class="checks">${b.items.map((it) => {
      const done = it.checked === true;
      return `<li><span class="box${done ? ' is-done' : ''}" aria-hidden="true"></span>`
        + `<span>${done ? '<span class="sr">Done: </span>' : ''}${renderInline(it.text)}</span></li>`;
    }).join('')}</ul>`;
  }
  if (b.ordered) {
    return `<ol class="num-list is-hairline">${b.items.map((it, n) => `<li><span class="n">${n + 1}</span><p class="body">${renderInline(it.text)}</p></li>`).join('')}</ol>`;
  }
  return `<ul class="bullets">${b.items.map((it) => `<li>${renderInline(it.text)}</li>`).join('')}</ul>`;
}

/** Split a leading `**Label:**` off a callout's text. Returns [label, rest]. */
function splitCalloutLabel(text) {
  const m = String(text).match(/^\*\*([^*\n]{1,60}?)\*\*\:?[ \t]*([\s\S]*)$/);
  if (!m) return [null, text];
  return [m[1].replace(/\:$/, '').trim(), m[2].replace(/^\n+/, '')];
}

function noteAside(variant, label, innerHtml) {
  const cls = variant === 'risk' ? ' note-risk' : variant === 'accent' ? ' note-accent' : '';
  const lab = label ? `<p class="note-label">${esc(label)}</p>` : '';
  return `<aside class="note${cls} breakout">${lab}<div class="note-body">${innerHtml}</div></aside>`;
}

function renderQuote(b) {
  if (b.variant === 'pull') return `<div class="pull">${b.blocks.map(renderBlock).join('')}</div>`;

  // Promote a leading `**Label:**` into the note's mono label. People write
  // callouts this way; without it the note renders as untitled bold prose.
  let label = b.label;
  let blocks = b.blocks;
  if (!label && blocks[0] && blocks[0].type === 'paragraph') {
    const [l, rest] = splitCalloutLabel(blocks[0].text);
    if (l) {
      label = l;
      blocks = [{ ...blocks[0], text: rest }].concat(blocks.slice(1));
    }
  }
  return noteAside(b.variant, label, blocks.map(renderBlock).join(''));
}

function renderBlock(b) {
  switch (b.type) {
    case 'heading': {
      const tag = Math.min(6, b.level + 1);
      const cls = b.level <= 2 ? 'h-chapter' : b.level === 3 ? 'h-section' : 'h-sub';
      // 2.1 keeps its own dotted form; a top-level 2 becomes §2
      const num = b.num ? (b.num.includes('.') ? b.num : '§' + b.num) : '';
      return `<h${tag} class="${cls}" id="${b.id}">${num ? `<span class="ch-num">${esc(num)}</span>` : ''}${renderInline(b.text)}</h${tag}>`;
    }
    case 'paragraph':
      // a paragraph carrying a note directive renders as a note, so a callout
      // does not have to be written as a blockquote
      if (b.label || b.variant) {
        if (b.variant === 'pull') return `<div class="pull"><p>${renderInline(b.text)}</p></div>`;
        let label = b.label;
        let text = b.text;
        if (!label) {
          const [l, rest] = splitCalloutLabel(text);
          if (l) { label = l; text = rest; }
        }
        return noteAside(b.variant, label, `<p>${renderInline(text)}</p>`);
      }
      return `<p>${renderInline(b.text)}</p>`;
    case 'code':
      return renderCode(b);
    case 'table':
      return renderTable(b);
    case 'list':
      return renderList(b);
    case 'quote':
      return renderQuote(b);
    case 'hr':
      return '<hr class="no-print" style="border:0;border-top:1px solid var(--rule);margin-block:3rem">';
    case 'html':
      return b.raw;
    default:
      return '';
  }
}

/* --------------------- assemble the document ----------------------- */

const title = frontmatter.title || 'Untitled';
const subtitle = frontmatter.subtitle || frontmatter.standfirst || '';
const docTitle = frontmatter.doc || title;

// split the top-level block stream into chapters at h1/h2
const chapters = [];
let current = null;
for (const b of blocks) {
  if (b.type === 'heading' && b.level <= 2) {
    current = { heading: b, blocks: [] };
    chapters.push(current);
    continue;
  }
  if (!current) {
    current = { heading: { level: 2, text: title, id: 'intro', num: null }, blocks: [] };
    chapters.push(current);
  }
  current.blocks.push(b);
}

// A markdown `---` at a chapter boundary is the author's own chapter
// separator, which the template already draws as the chapter rule. Keeping
// both leaves ~200px of dead air. After splitting, those separators are the
// TRAILING block of a chapter (the heading itself was lifted out), so drop
// them there — plus any `---` that introduces a sub-heading.
for (const c of chapters) {
  c.blocks = c.blocks.filter((b, i) => {
    if (b.type !== 'hr') return true;
    const nxt = c.blocks[i + 1];
    if (nxt && nxt.type === 'heading') return false;   // introduces a sub-heading
    if (i === c.blocks.length - 1) return false;       // trailing chapter separator
    if (i === 0) return false;                         // leading separator
    return true;
  });
}

// A leading `# h1` duplicates frontmatter.title, so the chapter it opens is
// dropped — but its CONTENT must be kept, spliced onto the next chapter.
// Dropping the whole chapter silently loses whatever followed the h1.
const sourceH1 = blocks.find((b) => b.type === 'heading' && b.level === 1);
if (sourceH1 && chapters[0] && chapters[0].heading === sourceH1) {
  const orphan = chapters.shift();
  if (chapters.length && orphan.blocks.length) {
    chapters[0].blocks = orphan.blocks.concat(chapters[0].blocks);
  } else if (!chapters.length) {
    chapters.push(orphan);
  }
}

const chapterNum = (b, n) => (b.num ? (b.num.includes('.') ? b.num : '§' + b.num) : '§' + n);

// table of contents
const toc = chapters.map((c, n) => {
  const subs = c.blocks.filter((x) => x.type === 'heading' && x.level >= 3 && x.level <= 4);
  const subHtml = subs.length
    ? `<ul class="toc-subs">${subs.map((s) => `<li><a href="#${s.id}" class="toc-sub">${s.num ? s.num + ' &nbsp;' : ''}${esc(s.text)}</a></li>`).join('')}</ul>`
    : '';
  return `<li>
        <div class="toc-row">
          <span class="toc-num">${chapterNum(c.heading, n + 1)}</span>
          <a href="#${c.heading.id}" class="toc-title">${esc(c.heading.text)}</a>
          <span class="leader" aria-hidden="true"></span>
        </div>${subHtml}
      </li>`;
}).join('');

// chapter bodies
const chapterHtml = chapters.map((c, n) => {
  const inner = c.blocks.map((b) => {
    if (b.type === 'heading' && b.level === 3) {
      return `<div class="subsection" id="${b.id}" style="scroll-margin-top:6rem"><h3 class="h-section">${b.num ? `<span class="ch-num" style="margin-right:.625rem">${b.num}</span>` : ''}${esc(b.text)}</h3></div>`;
    }
    if (b.type === 'heading' && b.level >= 4) {
      return `<h4 class="h-sub" id="${b.id}">${b.num ? `<span class="ch-num" style="margin-right:.625rem">${b.num}</span>` : ''}${esc(b.text)}</h4>`;
    }
    return renderBlock(b);
  }).join('');

  return `<section id="${c.heading.id}" class="book chapter scroll-mt-24">
  <div class="in-measure">
    <div class="chapter-head">
      <span class="ch-num">${chapterNum(c.heading, n + 1)}</span>
      <h2 class="h-chapter">${esc(c.heading.text)}</h2>
    </div>
    <div class="prose-doc" style="margin-top:${n === 0 ? '2rem' : '1.5rem'}">
    ${inner}
    </div>
  </div>
</section>`;
}).join('\n');

const metaItems = [
  frontmatter.date && { k: 'Date', v: frontmatter.date },
  frontmatter.scope && { k: 'Scope', v: frontmatter.scope },
  frontmatter.source && { k: 'Figures read from', v: frontmatter.source },
].filter(Boolean);

const themeCss = readFileSync(THEME, 'utf8');

/* --- fonts ---------------------------------------------------------------
   Default is a system stack: no webfont, no network request, nothing to go
   stale. `font:` / `fontMono:` in frontmatter opt into a Google Fonts family
   when the target project has a real typeface. */

// The parser lowercases frontmatter keys but keeps hyphens, so `fontMono`
// lands as `fontmono` while `font-mono` lands as `font-mono`. Normalise both
// sides so any spelling works.
const fmLookup = {};
for (const [k, v] of Object.entries(frontmatter)) {
  fmLookup[k.replace(/[-_]/g, '').toLowerCase()] = v;
}
const fm = (key) => fmLookup[key.replace(/[-_]/g, '').toLowerCase()];

const famSans = fm('font');
const famMono = fm('fontMono');

// Google Fonts v2 takes one family per `family=` param, and either may be set
// independently — a mono-only override still needs its own <link> or the face
// is never fetched and the stack silently falls back.
const gfontsUrl = (fams) =>
  'https://fonts.googleapis.com/css2?'
  + fams.map(([family, weights]) => 'family=' + family.replace(/ /g, '+') + ':wght@' + weights).join('&')
  + '&display=swap';

const useSans = famSans && famSans !== 'none';
const useMono = famMono && famMono !== 'none';

const googleFamilies = []
  .concat(useSans ? [[famSans, fm('fontWeights') || '400;450;500;600']] : [])
  .concat(useMono ? [[famMono, fm('monoWeights') || '400;500']] : []);

const fontLink = googleFamilies.length
  ? '<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
    + '<link href="' + escAttr(gfontsUrl(googleFamilies)) + '" rel="stylesheet" />'
  : '';

// Spell the fallback stack out in full. `--font-sans: 'X', var(--font-sans)`
// would be a cyclic reference, which is invalid and silently drops the value.
const fontCss = googleFamilies.length
  ? '\n<style>\n:root {\n'
    + (useSans ? "  --font-sans: '" + famSans + "', ui-sans-serif, system-ui, sans-serif;\n" : '')
    + (useMono ? "  --font-mono: '" + famMono + "', ui-monospace, SFMono-Regular, monospace;\n" : '')
    + '}\n</style>\n'
  : '\n';

// the running-head mark. A plain document glyph, deliberately unopinionated:
// the page should not invent an identity the document does not have.
const MARK = '<svg width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden="true" style="flex:none">'
  + '<path d="M1.5 1h7L12 4.5V14H1.5V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
  + '<path d="M8.5 1v3.5H12M4 8h5M4 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

const mark = frontmatter.brand || title;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escAttr(docTitle)}</title>
${frontmatter.description ? `<meta name="description" content="${escAttr(frontmatter.description)}" />\n` : ''}${fontLink}<style>
${themeCss}
</style>${fontCss}</head>
<body>
<header class="rh no-print">
  <div class="rh-in">
    <a href="#top" class="rh-mark">
      ${MARK}
      <span class="only-wide">${esc(mark)}</span>
    </a>
    <span class="rh-sep" aria-hidden="true"></span>
    <p class="rh-now"><span class="only-wide-lg">${esc(docTitle)} &nbsp;·&nbsp; </span><b id="rh-chapter">Front matter</b></p>
    <a href="#contents" class="rh-link">Contents</a>
  </div>
  <div class="thread"><i id="thread-fill"></i></div>
</header>

<main id="top">

<div class="book" style="padding-top:4rem">
  <div class="in-measure masthead" style="padding-top:0">
    <h1 style="font-size:clamp(2.4rem,7vw,4.15rem);font-weight:600;line-height:1.02;letter-spacing:-0.03em;text-wrap:balance">${esc(title)}</h1>
    ${subtitle ? `<p style="margin-top:1.75rem;max-width:52ch;font-size:1.0625rem;line-height:1.7;color:var(--ink-2);text-wrap:pretty">${renderInline(subtitle)}</p>` : ''}
    ${metaItems.length ? `<dl class="meta-row">${metaItems.map((m) => `<div><dt>${esc(m.k)}</dt><dd>${esc(m.v)}</dd></div>`).join('')}</dl>` : ''}
  </div>
</div>

<div id="contents" class="book scroll-mt-24" style="padding-top:4rem">
  <nav class="breakout" aria-label="Contents">
    <h2 class="toc-head">Contents</h2>
    <ol class="toc-list" style="margin-top:1.5rem;font-size:1.0625rem">
      ${toc}
    </ol>
  </nav>
</div>

${chapterHtml}

<div class="book" style="padding-bottom:2rem">
  <footer class="in-measure colophon">
    <div style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem 1.5rem">
      <p class="folio">End of document</p>
      <p class="folio">${esc(frontmatter.path || input)}</p>
    </div>
    <p style="margin-top:.75rem;font-size:.875rem;line-height:1.6;color:var(--ink-3)">${esc(docTitle)}${frontmatter.date ? ' · ' + esc(frontmatter.date) : ''}${frontmatter.source ? ' · all figures read from ' + esc(frontmatter.source) : ''}</p>
    <button onclick="window.print()" class="print-btn no-print">
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 6V1.5h6V6M4 10H2.5A1.5 1.5 0 0 1 1 8.5v-1A1.5 1.5 0 0 1 2.5 6h9A1.5 1.5 0 0 1 13 7.5v1a1.5 1.5 0 0 1-1.5 1.5H10M4 10h6v3.5H4V10Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Print / PDF
    </button>
  </footer>
</div>

</main>

<script>
(function () {
  var fill = document.getElementById('thread-fill');
  var label = document.getElementById('rh-chapter');
  var marks = [];
  document.querySelectorAll('section.chapter').forEach(function (el) {
    var h = el.querySelector('.chapter-head');
    if (!h) return;
    var num = h.querySelector('.ch-num');
    var name = h.querySelector('.h-chapter');
    marks.push([(num ? num.textContent : '') + '  ' + (name ? name.textContent : ''), el]);
  });
  var current = '';
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    fill.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, doc.scrollTop / max) : 0) + ')';
    var line = doc.scrollTop + 120;
    var hit = 'Front matter';
    for (var i = 0; i < marks.length; i++) {
      if (marks[i][1].getBoundingClientRect().top + doc.scrollTop <= line) hit = marks[i][0];
    }
    if (hit !== current) { label.textContent = hit; current = hit; }
  }
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
</script>
</body>
</html>
`;

writeFileSync(outPath, html);

/* ---------------------------- report ------------------------------ */

const rel = outPath.replace(process.cwd() + '/', '');
console.log('wrote ' + rel + '  (' + Math.round(html.length / 1024) + ' kB, ' + chapters.length + ' chapters)');

if (warnings.length) {
  console.log('\n' + warnings.length + ' parser warning(s) — the page may not show everything the source does:');
  for (const w of warnings) console.log('  ! ' + w);
  console.log('\nFix the source, or hand-author this document (see SKILL.md "When to hand-author").');
} else {
  console.log('no parser warnings.');
}

if (STRICT && warnings.length) {
  console.log('\n--strict: refusing to pass a document with warnings.');
  process.exit(2);
}

if (flags.has('--open')) {
  const { spawn } = await import('node:child_process');
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [outPath], { stdio: 'ignore', detached: true }).unref();
}
