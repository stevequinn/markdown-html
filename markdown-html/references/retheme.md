# Retheming to a project

A book page that looks like it came from a different product is worse than a
plain one. The default theme is a deliberate placeholder — a warm paper, a gold
accent, a system font — that belongs to no one project. If the target has its
own identity, move the theme to it. **Only the `:root` block in
`assets/theme.css` changes** — everything below reads those tokens.

## 1. Find the project's tokens

In rough order of authority:

| Where | What to take |
|---|---|
| `tailwind.config.*`, `theme.ts`, `tokens.json`, `*.css` `@theme` / `:root` | colours, radii, shadows, font stacks |
| `src/app/fonts/`, `public/fonts/`, `@font-face` blocks | the real typeface — use these, do not substitute |
| `package.json` | `tailwindcss`, `typography`, a UI kit that implies the house style |
| An existing rendered page | the last resort, and the most reliable for "what does it actually look like" |

Tailwind v4 puts tokens in CSS `@theme`; v3 puts them in JS config. Both are
worth reading. Look for the **background, foreground, primary, muted-foreground,
border, and destructive** roles — those six cover this theme.

```sh
# quick survey
rg -n --glob '!node_modules' -e '@theme' -e ':root' -e 'tailwind.config' -e '\-\-color-' -e 'oklch|#[0-9a-f]{6}' src/ *.css 2>/dev/null | head -60
rg -n --glob '!node_modules' 'font-family|@font-face|--font-' src/ | head -20
```

## 2. Map the project's roles onto this theme's tokens

| theme token | role it plays | typical source |
|---|---|---|
| `--paper` | the page ground | `background` |
| `--ink` | headings, strong prose | `foreground` |
| `--ink-2` | secondary prose | `muted-foreground`, darkened if needed |
| `--ink-3` | mono labels and captions | `muted-foreground` |
| `--rule` / `--rule-soft` | hairlines | `border`, two steps apart |
| `--accent` | **fill only** | `primary` |
| `--accent-ink` | accent **as text** | `primary`, darkened — see below |
| `--link` / `--link-ink` | links | `ring` or `accent` in a cool hue |
| `--risk` | the one alarm colour | `destructive` |
| `--good` / `--warn` | syntax hues | `chart-*` or hand-picked |
| `--font-sans` / `--font-mono` | the two families | the project's own |

A cool `--stock` for code figures is worth keeping whatever the palette: a
slightly different paper tone reads as "pasted in", which is the point.

## 3. Split the accent into a fill and an ink

**This is the step that gets skipped and it is the one that matters.** A brand
accent is chosen to be a large field of colour, usually at high lightness. At
11px on paper that is unreadable. The default gold is `oklch(0.82 0.16 85)` as a
fill and `oklch(0.52 0.115 70)` as text — same hue, 0.30 of lightness apart.

Derive the ink: keep hue and chroma, drop lightness until it passes. A rough
start is `L − 0.25` to `L − 0.35`, then measure. Do not guess and move on —
run the audit.

The same applies to `--ink-3`. Mono labels are small, so they need the full
4.5:1, and a "tertiary" grey chosen by eye is usually around 3:1.

## 4. Change the font

By default the page uses a **system font stack** and makes zero external
requests. That is a safe default, not a designed one — pick a real typeface
when the project has one.

- **Google-hosted** — set `font:` (and optionally `fontMono:`) in the
  frontmatter. `build.mjs` emits the `<link>` and overrides the `--font-sans` /
  `--font-mono` tokens:

  ```yaml
  font: Source Sans 3            # either spelling: fontMono / font-mono
  fontMono: Source Code Pro
  fontWeights: "400;500;600"    # optional, defaults to 400;450;500;600
  monoWeights: "400;500"        # optional, defaults to 400;500
  ```

  Either key may be set alone; each gets its own `family=` param, so a
  mono-only override still fetches its face. Verify the weights you request
  actually exist in the family — asking for a 550 that isn't there falls back
  silently.
- **Self-hosted (the project has a `fonts/` dir)** — omit `font:`, drop the
  Google link, and either inline the font as base64 or copy the files next to
  the output and add an `@font-face`. A single self-contained file is the point
  of this skill, so base64 is usually right even at a size cost.

Either way, **re-check the measure.** A face with a wide `0`, a large x-height,
or wide sidebearings changes characters-per-line substantially at the same
pixel width, and the system stack differs per OS. Only the audit's number is
trustworthy.

## 5. Audit, always

```sh
node "$SKILL_DIR/scripts/build.mjs" in.md -o out.html
# serve the directory, inject scripts/audit.js, then:
window.__bookAuditReport()
```

Fix every contrast line and every overflow before shipping. If a colour cannot be
darkened without abandoning the brand, change its **role** — demote it to a fill
and let `--accent-ink` carry the text.

## 6. If the project has no identity

Leave the default theme. A warm, well-set book page is a perfectly good
neutral, and inventing a palette for a document you were only asked to typeset is
scope creep. Say which theme you shipped and offer to retheme.

## What not to port

Do not carry over the project's component styling — cards, buttons, badges.
A book page is a different form. Take the **colours, the typeface, and the
voice**; leave the app's visual language behind. The one thing worth porting is
a sense of rhythm: if the project spaces things tightly, tighten `--gutter` and
the chapter margins to match.
