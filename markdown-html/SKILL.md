---
name: markdown-html
description: Render a markdown document as a single self-contained HTML page typeset like a bound book or field report — measured prose column, breakout figures, running head, hairline tables, themed to an existing project's design tokens. Use when asked to turn a .md plan, report, audit, spec, RFC, or notes file into a nicely typeset shareable HTML page, or to restyle/beautify a markdown document for reading. Also use for "book-ify", "typeset", "make this markdown look good as HTML".
---

# markdown-html

Turns a markdown document into **one self-contained HTML file** that reads like a
printed book: a measured prose column, figures that break out wider than the
text, a running head that names the chapter you are in, hairline tables, and
code set on pasted-in stock. No build tooling in the consuming project, no
runtime dependency, no external CSS or JS beyond a webfont link.

Default theme is a neutral placeholder: a system font stack (no webfont, no
network request) and a warm-paper / gold-accent palette that belongs to no one
product. **Retheme it to the target project before shipping** — see
`references/retheme.md`.

## Workflow

1. **Read the source.** Note its title, structure, and which markdown constructs
   it uses. Do not rewrite the author's prose, headings, or voice. You are
   typesetting a document, not editing it.
2. **Add frontmatter** if absent, so the masthead is sourced from the document
   rather than invented:

   ```yaml
   ---
   title: Q3 Platform Review
   subtitle: What shipped, what slipped, and what we are changing.
   date: 2026-09-27
   scope: frontend platform
   source: the analytics export and the tracker
   path: docs/q3-review.md
   brand: Platform
   description: One-line meta description, optional.
   font: Inter            # optional, omit for the system stack
   fontMono: JetBrains Mono
   ---
   ```

   A leading `# H1` that duplicates `title` is dropped, but the paragraphs
   after it are preserved. `brand` is what the running head shows; it defaults
   to `title`.
3. **Retheme** `assets/theme.css` if the target project has its own identity.
   Only the `:root` token block changes. See `references/retheme.md`.
4. **Build.**

   ```sh
   node "$SKILL_DIR/scripts/build.mjs" input.md -o output.html
   ```

   `$SKILL_DIR` is this skill's own directory — the one holding this file. The
   agent runtime reports it when the skill loads; it is never a fixed path,
   because the skill may be installed per-project, globally, or symlinked.
   Flags: `--open` opens it, `--strict` exits non-zero on any parser warning
   (use in CI).
5. **Read the warnings.** The parser never silently drops content; anything it
   cannot represent is reported. A clean run is the precondition for shipping.
6. **Verify** — see below. Do not skip this; it is where the real defects are.
7. **Report** what you built, the warnings, and the audit result. If you
   declined a finding, say so and why.

## Self-contained by default

One HTML file, no build step, no local assets. With no `font:` key the page
makes **zero external requests** — everything is inlined and the type is a system
stack. Add `font:` only when the target project has a typeface worth loading.

## Verify

The audit is a browser script, not a node script, because it needs computed
styles and real layout. **Inject it as a file** — long inline `browser.evaluate`
scripts get mangled or rejected by automation harnesses.

```sh
cd <dir containing the built html>
cp "$SKILL_DIR/scripts/audit.js" .
python3 -m http.server 3111     # any static server
```

Then, in the browser:

```js
// open http://localhost:3111/output.html, then:
var s = document.createElement('script'); s.src = '/audit.js';
document.head.appendChild(s);
// then, in a SECOND call (the first returns before the script runs):
window.__bookAuditReport()
```

`__bookAuditReport()` returns a PASS/FAIL line plus detail. It checks:

| Check | Fail condition |
|---|---|
| Contrast | Any text node below WCAG AA (4.5:1, or 3:1 at ≥24px) against its **composited** background |
| Measure | Average characters per line outside 60–80 |
| Overflow | Any horizontal scroll |
| Layout transitions | `transition` on `width`/`height`/`top`/`left`/etc. — must be `transform` |
| Table alignment | A `th` and its `td` differing by >1.5px on the same edge |

Then **screenshot and actually look at it**, desktop and a phone width. The
audit cannot see composition. Two rounds maximum; fix findings in one batch.

## Directives

Markdown cannot express everything, so a few HTML-comment directives attach to
the **next** block:

| Directive | Effect |
|---|---|
| `<!-- caption: path/to/file.ts:91-106 -->` | figcaption on the next code block |
| `<!-- pull -->` | next blockquote becomes a centred pull quote |
| `<!-- note: Implication -->` | next block **or paragraph** becomes a labelled note |
| `<!-- accent-note: Why this matters -->` | as above, accent-tinted |
| `<!-- risk-note: Australian Consumer Law -->` | as above, risk-tinted |
| `<!-- in-measure -->` | next figure stays inside the measure instead of breaking out |
| `<!-- row-key -->` / `<!-- row-total -->` | emphasise the first / final table row |
| `<!-- marker -->` | a marker square on the next heading |

A blockquote or paragraph that already begins `**Some label:**` is promoted to
a note label automatically — no directive needed.

## When to hand-author

The renderer covers a linear, chaptered document: prose, headings, lists,
tables, code, callouts. **Hand-author instead** when:

- the build reports warnings you cannot fix in the source (footnotes, setext
  headings, reference links, deep list nesting);
- the document needs a real data figure, a diagram, a non-linear flow, or
  per-section visual variety;
- you need a structure the reading grid cannot express.

To hand-author: copy `assets/theme.css` verbatim into a `<style>`, then write
the markup using the class vocabulary in `references/components.md`. The
generated page ships **no preflight**, so do not emit Tailwind classes — use the
`.only-wide` / `.only-wide-lg` helpers, not `sm:` / `md:`.

## Read before writing markup

- `references/components.md` — the class vocabulary and what maps to what.
- `references/guardrails.md` — the refuses-list and the failure modes that
  cost a full rewrite the first time. Read it before hand-authoring.
- `references/retheme.md` — reading a project's tokens and splitting an accent
  into a fill and a text-safe ink.
