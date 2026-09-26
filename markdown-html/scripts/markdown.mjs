/**
 * markdown-html :: a focused CommonMark+GFM subset parser.
 *
 * Design rule: it NEVER silently drops content. Anything it cannot represent
 * becomes a warning, and the build prints them. A warning means hand-author
 * the document instead (see SKILL.md "When to hand-author").
 *
 * No dependencies. Node 18+.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for text nodes. Leaves existing entities intact. */
export const esc = (s) => String(s).replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escape for double-quoted attribute values. */
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ *
 * Syntax highlighting. Conservative: comments, strings, numbers,
 * keywords, punctuation. Operates on RAW source and escapes each
 * fragment as it emits, so it can never inject markup.
 * ------------------------------------------------------------------ */

const COMMON_KW = 'as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|throw|try|type|typeof|var|void|while|with|yield|true|false|null|undefined';

const LANGS = {
  js:       { kw: COMMON_KW, line: ['//'], block: true, str: ['"', "'", '`'] },
  jsx:      { kw: COMMON_KW, line: ['//'], block: true, str: ['"', "'", '`'] },
  ts:       { kw: COMMON_KW + '|string|number|boolean|any|unknown|never|object|symbol|bigint|Record|Partial|Readonly|Pick|Omit', line: ['//'], block: true, str: ['"', "'", '`'] },
  tsx:      { kw: COMMON_KW, line: ['//'], block: true, str: ['"', "'", '`'] },
  json:     { kw: 'true|false|null', line: [], block: false, str: ['"'] },
  css:      { kw: 'important|media|import|supports|keyframes|font-face', line: [], block: true, str: ['"', "'"] },
  bash:     { kw: 'if|then|else|fi|for|in|do|done|while|case|esac|function|return|export|local|echo|cd|set', line: ['#'], block: false, str: ['"', "'"] },
  sh:       { kw: 'if|then|else|fi|for|in|do|done|while|case|esac|function|return|export|local|echo|cd|set', line: ['#'], block: false, str: ['"', "'"] },
  shell:    { kw: 'if|then|else|fi|for|in|do|done|while|case|esac|function|return|export|local|echo|cd|set', line: ['#'], block: false, str: ['"', "'"] },
  python:   { kw: 'def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|None|True|False|and|or|not|in|is|yield|global|nonlocal|assert|del|async|await', line: ['#'], block: false, str: ['"', "'"] },
  sql:      { kw: 'select|from|where|join|left|right|inner|outer|on|group|order|by|having|limit|offset|insert|into|values|update|set|delete|create|table|alter|add|index|as|and|or|not|null|primary|key|foreign|references|default|unique|with|returning', line: ['--'], block: true, str: ["'", '"'] },
  go:       { kw: 'package|import|func|var|const|type|struct|interface|map|chan|if|else|for|range|return|switch|case|default|break|continue|go|defer|nil|true|false|string|int|int64|float64|bool|error', line: ['//'], block: true, str: ['"', "'", '`'] },
  rust:     { kw: 'fn|let|mut|const|struct|enum|impl|trait|for|while|loop|if|else|match|return|use|pub|crate|mod|as|where|move|ref|self|Self|true|false|Some|None|Ok|Err|String|Vec|Option|Result', line: ['//'], block: true, str: ['"'] },
  yaml:     { kw: 'true|false|null|yes|no', line: ['#'], block: false, str: ['"', "'"] },
  toml:     { kw: 'true|false', line: ['#'], block: false, str: ['"', "'"] },
  diff:     { kw: '', line: [], block: false, str: [], diff: true },
  text:     { kw: '', line: [], block: false, str: [] },
};

const RE_ESC = /[.*+?^${}()|[\]\\]/g;

/**
 * Tokenise source into styled spans.
 *
 * Every alternative is a CAPTURE GROUP, and `kinds` records the class each
 * group maps to, in the same order. Do not destructure match groups by
 * position: an earlier version did, and the off-by-one silently mis-coloured
 * strings as numbers while dropping every keyword.
 *
 * Strings use one alternative per quote character, each with a plain negated
 * character class. A `(?!quote)` lookahead looks equivalent but matches
 * zero-width, so the whole string collapses to just its opening quote.
 */
export function highlight(raw, langRaw) {
  const lang = String(langRaw || '').toLowerCase().split(/[\s:]/)[0];
  const spec = LANGS[lang];
  if (!spec) return esc(raw);

  const parts = [];
  const kinds = [];
  const add = (pattern, kind) => { parts.push(pattern); kinds.push(kind); };

  if (spec.line.length) {
    const alts = spec.line.map((c) => c.replace(RE_ESC, '\\$&') + '[^\\n]*');
    add('(?:' + alts.join('|') + ')', 'com');
  }
  if (spec.block) add('\\/\\*[\\s\\S]*?(?:\\*\\/|$)', 'com');
  if (spec.str.length) {
    const alts = spec.str.map((c) => {
      const q = c.replace(RE_ESC, '\\$&');
      return q + '(?:\\\\.|[^' + q + '\\\\])*' + q;
    });
    add('(?:' + alts.join('|') + ')', 'str');
  }
  add('\\b\\d[\\d._]*\\b', 'num');
  if (spec.kw) add('\\b(?:' + spec.kw + ')\\b', 'kw');
  if (spec.diff) add('^[+-]', 'diff');
  add('[{}()\\[\\];,.:?=+\\-*/<>!&|%^~]+', 'pun');

  // every alternative becomes its own capture group, so `kinds` indexes m[] directly
  const re = new RegExp('(' + parts.join(')|(') + ')', 'gm');
  const cls = { com: 'tc', str: 'ts', num: 'tn', kw: 'tk', diff: 'tk', pun: 'tp' };

  let out = '';
  let last = 0;
  let m;
  let guard = 0;
  while ((m = re.exec(raw)) !== null) {
    if (++guard > 20000) break;
    const full = m[0];
    out += esc(raw.slice(last, m.index));

    let kind = null;
    for (let i = 0; i < kinds.length; i++) {
      if (m[i + 1] !== undefined) { kind = kinds[i]; break; }
    }
    out += kind ? '<span class="' + cls[kind] + '">' + esc(full) + '</span>' : esc(full);

    last = m.index + full.length;
    if (full.length === 0) re.lastIndex++;
  }
  out += esc(raw.slice(last));
  return out;
}

/* ------------------------------------------------------------------ *
 * Inline
 * ------------------------------------------------------------------ */

const PLACEHOLDER = (i) => `\u0000${i}\u0000`;

function inline(src, warn) {
  const store = [];
  const keep = (html) => { store.push(html); return PLACEHOLDER(store.length - 1); };

  let s = String(src);

  // 1. code spans — first, so nothing inside them is touched again
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, code) =>
    keep('<code class="code-in">' + esc(code.replace(/^ | $/g, '')) + '</code>'));

  // 2. images
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src2, title) => {
    const t = title ? ' title="' + escAttr(title) + '"' : '';
    return keep('<img src="' + escAttr(src2) + '" alt="' + escAttr(alt) + '"' + t + '>');
  });

  // 3. links (reference-style is reported, not silently dropped)
  if (/\[[^\]]+\]\[[^\]]*\]/.test(s)) warn('reference-style link — not supported; use [text](url)');
  s = s.replace(/\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"([^"]*)")?\s*\)/g, (_, text, href, title) => {
    if (!href) warn('empty link destination');
    const external = /^https?:/i.test(href);
    const t = title ? ' title="' + escAttr(title) + '"' : '';
    const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return keep('<a href="' + escAttr(href) + '"' + t + rel + '>' + inline(text, warn) + '</a>');
  });

  // 4. autolinks + bare URLs
  s = s.replace(/<((?:https?|mailto):[^>\s]+)>/g, (_, u) =>
    keep('<a href="' + escAttr(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>'));
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (whole, pre, u) => {
    // trailing sentence punctuation is not part of the URL
    const trail = u.match(/[.,;:!?)\]]+$/);
    const url = trail ? u.slice(0, -trail[0].length) : u;
    if (!url) return whole;
    return pre + keep('<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>') + u.slice(url.length);
  });

  // 5. footnote references
  s = s.replace(/\[\^[^\]]+\]/g, () => { warn('footnote reference — not supported'); return ' '; });

  // 6. escape what remains
  s = esc(s);

  // 7. emphasis, strike, hard breaks (placeholders are digit-only, so they are inert here)
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(?<![\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '<em>$1</em>');
  s = s.replace(/(?<![\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '<em>$1</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n/g, '<br>\n');
  s = s.replace(/\\\n/g, '<br>\n');

  // 8. restore
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => store[Number(i)]);

  return s;
}

/* ------------------------------------------------------------------ *
 * Block
 * ------------------------------------------------------------------ */

const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';

function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|') { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  if (cells.length && !cells[0].trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  return cells.map((c) => c.trim());
}

const isTableDelim = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');

export function parse(src, opts = {}) {
  const warnings = [];
  const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
  const meta = opts.meta || {};

  let text = String(src).replace(/\r\n?/g, '\n');

  // optional frontmatter
  const fm = {};
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m2 = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (m2) fm[m2[1].toLowerCase()] = m2[2].trim().replace(/^["']|["']$/g, '');
    }
    text = text.slice(fmMatch[0].length);
  }

  const lines = text.split('\n');
  const blocks = [];
  const seenIds = new Set();
  const uniqueId = (base) => {
    let id = base;
    let n = 2;
    while (seenIds.has(id)) id = base + '-' + n++;
    seenIds.add(id);
    return id;
  };

  // pending directive, applied to the next block
  let pending = {};
  const readDirective = (line) => {
    const m = line.match(/^<!--\s*([a-z-]+)\s*(?::\s*([\s\S]*?))?\s*-->$/i);
    if (!m) return false;
    // normalise `in-measure` -> `in_measure` so lookups use one spelling
    pending[m[1].toLowerCase().replace(/-/g, '_')] = (m[2] || '').trim() || true;
    return true;
  };
  const takeDirective = (keys) => {
    const out = {};
    for (const k of keys) if (pending[k] !== undefined) { out[k] = pending[k]; delete pending[k]; }
    return out;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (readDirective(line.trim())) { i++; continue; }

    // fenced code
    const fence = line.match(/^(\s*)(`{3,}|~{3,})\s*(.*)$/);
    if (fence) {
      const marker = fence[2][0];
      const len = fence[2].length;
      const info = fence[3].trim();
      const lang = info.split(/\s+/)[0] || '';
      const captionDirective = takeDirective(['caption']);
      const body = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const c = lines[i];
        if (new RegExp('^\\s*' + marker + '{' + len + ',}\\s*$').test(c)) { closed = true; i++; break; }
        body.push(c); i++;
      }
      if (!closed) warn('unclosed code fence');
      blocks.push({
        type: 'code',
        lang,
        caption: typeof captionDirective.caption === 'string' ? captionDirective.caption : info.split(/\s+/).slice(1).join(' ') || null,
        code: body.join('\n'),
        inMeasure: pending.in_measure !== undefined,
      });
      delete pending.in_measure;
      continue;
    }

    // ATX heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      let txt = h[2];
      let num = null;
      const numMatch = txt.match(/^(?:§\s*)?(\d+(?:\.\d+)*)[.)]?\s+(.*)$/);
      if (numMatch) { num = numMatch[1]; txt = numMatch[2]; }
      if (!txt) warn('empty heading');
      blocks.push({
        type: 'heading',
        level,
        num,
        text: txt,
        id: uniqueId(slug(txt)),
        marker: pending.marker || null,
      });
      delete pending.marker;
      i++;
      continue;
    }

    // setext heading
    if (i + 1 < lines.length && /^\s*(={3,}|-{3,})\s*$/.test(lines[i + 1]) && line.trim() && !isTableDelim(lines[i + 1]) && !/^[-*+]\s/.test(line)) {
      warn('setext heading — use ATX (#) instead');
      i += 2;
      continue;
    }

    // thematic break
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableDelim(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const cells = splitRow(lines[i]);
        if (cells.length !== head.length) warn('table row has ' + cells.length + ' cells, header has ' + head.length);
        while (cells.length < head.length) cells.push('');
        rows.push(cells);
        i++;
      }
      const d = takeDirective(['in_measure', 'row_key', 'row_total']);
      blocks.push({
        type: 'table',
        head,
        align,
        rows,
        inMeasure: d.in_measure !== undefined,
        rowKey: d.row_key !== undefined,
        rowTotal: d.row_total !== undefined,
      });
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const d = takeDirective(['note', 'accent_note', 'risk_note', 'pull']);
      const inner = parse(body.join('\n'), { meta: {} });
      warnings.push(...inner.warnings);
      blocks.push({
        type: 'quote',
        blocks: inner.blocks,
        label: typeof d.note === 'string' ? d.note : typeof d.accent_note === 'string' ? d.accent_note : typeof d.risk_note === 'string' ? d.risk_note : null,
        variant: d.accent_note !== undefined ? 'accent' : d.risk_note !== undefined ? 'risk' : d.pull !== undefined ? 'pull' : null,
        inMeasure: pending.in_measure !== undefined,
      });
      delete pending.in_measure;
      continue;
    }

    // lists
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const start = listMatch;
      const ordered = /\d/.test(start[2]);
      const items = [];
      let tight = true;
      let sawBlank = false;
      let depth = 0;

      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // a blank line ends the list unless the next line continues it
          const nxt = lines[i + 1];
          if (nxt && (/^\s*([-*+]|\d+[.)])\s+/.test(nxt) || /^\s{2,}\S/.test(nxt))) {
            if (/^\s*([-*+]|\d+[.)])\s+/.test(nxt)) tight = false;
            sawBlank = true; i++;
            continue;
          }
          break;
        }
        const m2 = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        const indent = m2 ? m2[1].length : (l.match(/^\s*/)[0].length);
        if (m2 && indent < 2) {
          const isOrdered = /\d/.test(m2[2]);
          // A different list KIND at the same indent starts a new list. Without
          // this, bullets, ordered items and task items merge into one list.
          if (items.length && isOrdered !== ordered) break;
          let text2 = m2[3];
          let checked = null;
          const t = text2.match(/^\[([ xX])\]\s+(.*)$/);
          if (t) { checked = t[1].toLowerCase() === 'x'; text2 = t[2]; }
          items.push({ text: text2, checked, extra: sawBlank ? [l] : [] });
          sawBlank = false;
          i++;
          continue;
        }
        if (indent >= 2 && items.length) {
          if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) depth++;
          if (depth > 0) warn('nested list deeper than one level — flatten or hand-author');
          items[items.length - 1].extra.push(l);
          i++;
          continue;
        }
        if (sawBlank) break;
        break;
      }
      blocks.push({ type: 'list', ordered, items, tight, inMeasure: pending.in_measure !== undefined });
      delete pending.in_measure;
      continue;
    }

    // raw HTML block
    if (/^\s*<(\/?)([a-zA-Z][\w-]*)/.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim()) { body.push(lines[i]); i++; }
      blocks.push({ type: 'html', raw: body.join('\n') });
      warn('raw HTML block passed through unstyled — prefer a directive or hand-author');
      continue;
    }

    // link reference definition
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)) {
      warn('link reference definition — use inline [text](url)');
      while (i < lines.length && lines[i].trim()) i++;
      continue;
    }

    // paragraph
    const para = [];
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^\s*(`{3,}|~{3,})/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
      && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])
      && !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (!para.length) { para.push(lines[i]); i++; }
    {
      const d = takeDirective(['note', 'accent_note', 'risk_note', 'pull']);
      blocks.push({
        type: 'paragraph',
        text: para.join('\n'),
        inMeasure: pending.in_measure !== undefined,
        label: typeof d.note === 'string' ? d.note : typeof d.accent_note === 'string' ? d.accent_note : typeof d.risk_note === 'string' ? d.risk_note : null,
        variant: d.accent_note !== undefined ? 'accent' : d.risk_note !== undefined ? 'risk' : d.pull !== undefined ? 'pull' : null,
      });
    }
    delete pending.in_measure;
  }

  return { blocks, frontmatter: fm, warnings };
}

export { inline };
