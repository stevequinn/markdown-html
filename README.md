# markdown-html

Turn a markdown document into **one self-contained HTML file** that reads like a
printed book: a measured prose column, figures that break out wider than the
text, a running head that names the chapter you are in, hairline tables, and
code set on pasted-in stock.

No build step in your project. No runtime dependency. Open the file, email it,
or drop it into any static site.

```sh
npx skills add <owner>/markdown-html@markdown-html
```

## Install

```sh
# globally (user-level, all your projects)
npx skills add <owner>/markdown-html@markdown-html -g

# into one project only
npx skills add <owner>/markdown-html@markdown-html

# see what's in the repo first
npx skills add <owner>/markdown-html -l
```

Add `-y` to skip prompts and `--copy` to copy files rather than symlink them.

## Use it

Ask your agent for it — "typeset `docs/plan.md` as a book page", "turn this
release notes file into a shareable HTML doc" — or run it directly:

```sh
node scripts/build.mjs input.md -o output.html
```

| Flag | Effect |
|---|---|
| `-o <file>` | output path (default: input name with `.html`) |
| `--open` | open the result |
| `--strict` | exit non-zero if the parser reported any warning (for CI) |

Requires **Node 18+**, no dependencies.

## What you get

```
output.html
```

Everything inlined. With no `font:` key the page makes **zero external
requests** — the type is a system stack and the theme is inlined CSS.

- Title page with a standfirst and a hairline-ruled fact row
- Contents with leaders, built from your headings
- Chapters with a running head and a gold reading thread
- Tables, code figures, and callouts that break out of the measure
- Print stylesheet, so browser Print → PDF gives a real book

## Frontmatter

Optional, and the source of the masthead. Delete the H1 if it just repeats
`title` — the paragraphs after it are kept either way.

```yaml
---
title: Q3 Platform Review
subtitle: What shipped, what slipped, and what we are changing.
date: 2026-09-27
scope: frontend platform
source: the analytics export and the tracker
path: docs/q3-review.md
brand: Platform          # running-head label; defaults to title
description: ...         # meta description
font: Source Sans 3      # optional; omit for the system stack
fontMono: Source Code Pro
fontWeights: "400;600"
---
```

## Directives

Markdown can't express everything. An HTML comment attaches to the next block:

| Directive | Effect |
|---|---|
| `<!-- caption: src/db/schema.ts -->` | figcaption on the next code block |
| `<!-- pull -->` | next blockquote becomes a centred pull quote |
| `<!-- note: Implication -->` | next block or paragraph becomes a labelled note |
| `<!-- accent-note: Why this matters -->` | as above, accent-tinted |
| `<!-- risk-note: Legal -->` | as above, risk-tinted |
| `<!-- in-measure -->` | next figure stays inside the measure |
| `<!-- row-key -->` / `<!-- row-total -->` | emphasise the first / final table row |

A blockquote or paragraph already starting `**Some label:**` is promoted to a
note label automatically.

## Retheming

The default palette is a placeholder that belongs to no product. To match your
project, edit **only the `:root` token block** in `markdown-html/assets/theme.css`
— every other rule reads those tokens.

The one step people skip: an accent tuned for large fills usually fails WCAG AA
as small text. Keep **two** values, `--accent` for fills and `--accent-ink` for
text. See `markdown-html/references/retheme.md`.

## Verifying

The build reports anything the parser could not represent — it never silently
drops content. Then audit the render:

```sh
cp "$SKILL_DIR/scripts/audit.js" .
python3 -m http.server 3111
```

Open the page, inject the script, and call the report:

```js
var s = document.createElement('script'); s.src = '/audit.js';
document.head.appendChild(s);
// then, in a second call:
window.__bookAuditReport()
```

It checks WCAG AA contrast against composited backgrounds, characters per line,
horizontal overflow, layout-animating transitions, and table column alignment.

## Limitations

The parser covers a linear, chaptered document: prose, headings, lists, tables,
code, callouts, task lists. It **warns rather than guesses** on footnotes,
setext headings, reference-style links, and lists nested deeper than one level.
A warning means fix the source, or hand-author with `assets/theme.css` and
`references/components.md`.

Syntax highlighting is cosmetic and covers the common languages; an unlisted
language renders as plain escaped text.

## Licence

MIT
