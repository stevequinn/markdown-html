# Guardrails and failure modes

## Refuse

These are category defaults. A brief can earn one back; reaching for one because
it is the safe pick means you were not deciding.

**Page scaffolds**
- Same-size cards of icon + heading + text as the page structure. Cards are the
  lazy container; nested cards are always wrong.
- The hero-metric template: big number, small label, supporting stats, accent.
- **A kicker or eyebrow above a heading.** Not a default — a ban. Delete the
  label and let the heading carry its own weight.
- Section numbers used as decoration. Here they carry information (the source
  document is numbered), which is the condition that makes them legitimate.
- A modal for a task needing neither interruption nor protected focus.

**Surface habits**
- Gradient text. Emphasis comes from weight or size.
- Glass and blur as decoration.
- **A coloured `border-left` thicker than 1px on a card, callout, or alert.**
  Use a hairline box on tinted stock with a mono label instead.
- Hard offset shadows (`4px 4px 0`) outside a genuinely neobrutalist world.
- Progress rings and soft-shadowed rounded rectangles standing in for content.
- Monospace as a costume for "technical". Mono here carries code, data,
  measurement, and labels — nothing else.
- **Unicode glyphs or emoji as icons.** Draw them, or use one consistent stroke.
- Geometric masks standing in for organic contours.
- Light or dark picked by category. Pick from the scene.

## Failure modes that cost a rewrite

Each of these happened for real and each produced a page that looked plausible
in code and broken on screen.

### 1. One bad `@apply` silently kills the whole Tailwind build

The Play CDN's `<style type="text/tailwindcss">` compiles as a unit. A single
unsupported class — `decoration-teal/35` against a custom colour — threw a
`CssSyntaxError` and **every utility disappeared**. The page rendered in Times
New Roman. There was no visual error, only a console message nobody read.

Consequence: this theme is plain CSS, not `@apply`. The generated page also ships
no preflight, which means browser defaults (link underlines, list markers, body
margin, font) are your problem. `theme.css` resets them explicitly.

### 2. Grid breakout does nothing for nested figures

`grid-column` only applies to a **grid item**. A `<figure class="breakout">`
nested inside the measure's `<div>` is not a grid item, so the breakout silently
did nothing and every figure rendered at prose width. The whole premise of the
layout was decorative.

Consequence: `.breakout` centres with `margin-left: 50%; transform:
translateX(-50%)`, which works at any nesting depth.

### 3. `ch` units lie about measure

`max-width: 68ch` on a modern grotesk measured 721px and read as **84 characters
per line** — comfortably past the 60–80 band. A grotesk's `0` glyph is wide, so
`ch` overstates line length by ~20%. The fix is not a better guess at the ratio;
it is to measure real paragraphs. `audit.js` clones actual text at the actual
width and divides characters by rendered lines. This holds for any face, and
more so for the default system stack, whose metrics vary by OS.

### 4. Contrast auditing must composite and must convert

Two traps in the same check:
- `getComputedStyle` returns `oklch(...)` unchanged, not rgb. Naive
  `match(/[\d.]+/)` reads oklch's components as RGB and reports a contrast
  ratio near 1.0 for everything. Convert through a canvas first.
- Semi-transparent backgrounds (`oklch(... / 0.09)`, `color-mix`) must be
  composited down the whole ancestor chain before comparison, or every tinted
  callout reads as failing.

### 5. An accent tuned for fills fails as text

A brand gold at `oklch(0.82 0.16 85)` is a fine rule and a terrible label:
3.68:1 on paper. Seven elements failed AA before the accent was split in two.
Accents need **two** values — a fill and a text-safe ink — and the text one has
to be re-derived per theme. See `retheme.md`.

### 6. Animating `width` on a scroll handler

The reading thread transitioned `width`, forcing layout on every scroll frame.
`transform: scaleX()` is composited. The audit flags layout properties for this
reason.

### 7. Dropping a heading can drop its content

Splitting a document into chapters at `##` and then removing a leading `# H1`
took the paragraphs after it with it. Data loss with no warning — the exact
failure the parser's no-silent-drop rule exists to prevent, committed by the
splitter instead. When you drop a block, check what it contained.

### 8. Doubled separators leave dead air

Markdown's `---` before each `##` **plus** the template's chapter rule gives two
rules and ~200px of nothing. After splitting, those separators are the *trailing*
block of a chapter, not a block with a following sibling — so the obvious filter
("drop an `hr` followed by a heading") never fires. Check the tail explicitly.

### 9. Long inline scripts get rejected by harnesses

A ~40-line `browser.evaluate` failed with `SyntaxError: Unexpected token
'return'` repeatedly, including a version nearly identical to one that had just
worked. The fix is not to debug the script: write it to a file, serve the
directory, inject a `<script src>`, and call the function in a second step.

## Craft floor

- Contrast: body and placeholder ≥4.5:1, large text ≥3:1. On a coloured surface,
  tint the secondary text from that hue — never grey.
- Depth: shadows carry an offset and a blur. **This theme uses no shadows**;
  elevation is a hairline or an inset stock. Do not add one.
- Spacing: tight groups, generous separation, more space above a heading than
  below. One rhythm throughout.
- Type: body 17px / 1.75, measure 60–80 characters, tracking no tighter than
  -0.04em (this theme uses -0.02 to -0.03).
- Motion: one authored moment. Here, the reading thread. Not a hover effect on
  every link.
- Browser surfaces: selection, scrollbars, focus rings, underline offset, and
  tabular figures all ship themed in `theme.css`. They are the cheapest signal
  that a page was built rather than assembled.
- States: hover, focus-visible, reduced-motion, and print all handled. There is
  no async state, so no loading or error state to design.
