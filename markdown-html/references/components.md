# Component vocabulary

Every class the theme defines, what it is for, and what it maps from in
markdown. Use this when hand-authoring.

## Page frame

| Class | Role |
|---|---|
| `.book` | Centred column, max `--breakout`, with a responsive gutter. One per section. |
| `.in-measure` | The prose measure. Prose lives here. |
| `.masthead` | A wider variant of the measure, for the title block only. |
| `.breakout` | Opt out of the measure: tables, code figures, notes. |
| `.prose-doc` | Sets body size, leading, colour, and paragraph spacing for a run of blocks. **Every chapter body needs one.** |

`grid-column` does **not** make a nested element break the measure — a figure
inside `.in-measure` stays trapped. That is why `.breakout` centres with
`margin-left: 50%; transform: translateX(-50%)` instead: it works nested.

## Type

| Class | Size / treatment |
|---|---|
| `.h-chapter` | `clamp(1.55rem, 3.1vw, 2.1rem)` / 600 / -0.02em — a `##` |
| `.h-section` | `1.1875rem` / 600 / -0.012em — a `###` |
| `.h-sub` | `1.0625rem` / 600 — a `####` |
| `.ch-num` | Mono, 13px, accent-ink — the `§1` / `2.1` marker |
| `.chapter-head` | Flex row pairing a `.ch-num` with a heading |
| `.chapter` | Top rule + 4rem padding + 4.5rem margin. Suppresses the rule on the first. |
| `.subsection` | 3rem padding-top above a sub-heading |
| `.prose-doc` | 17px / 1.75, with `> * + *` at 1.25rem |
| `.code-in` | Inline code — a tinted stamp, not a grey box |
| `.tnum` | Tabular figures for data |

Measure is `--measure: 33rem`, which lands at roughly 60–70 characters on a
typical UI sans. **Do not express this in `ch`.** A grotesk's `0` is wide, so
`68ch` measured 721px and read as 84 characters per line, and the default
system stack's metrics differ per OS. Verify with `audit.js` and adjust.

## Structures

| Class | Role |
|---|---|
| `.pull` | Centred pull quote with a gold tick on the top rule |
| `.note` / `.note-accent` / `.note-risk` | Callout box on tinted stock with a `.note-label` |
| `.note-body` | 15px / 1.65 callout prose, `--ink-2` |
| `.bullets` | List with a short accent rule as the marker |
| `.num-list` / `.is-hairline` | Hanging numerals, optionally hairline-separated |
| `.checks` / `.box` | Checklist with a drawn square |
| `.tbl` / `.num` / `.muted` / `.row-key` / `.row-total` | Hairline data table |
| `.tbl-cap` | Mono uppercase caption under a table or figure |
| `.tbl-scroll` | Wraps a 4+ column table so it scrolls rather than crushing |
| `.fig-code` | Code figure on `--stock` with an optional `<figcaption>` |
| `.fig-plain` | A one-line code or result, between two rules |
| `.fig-chart` / `.bar-row` / `.bar-label` / `.bar-val` / `.bar-track` / `.bar-fill` | Horizontal bar chart |
| `.toc-*` / `.leader` | Contents, with a hairline leader out to the right edge |
| `.rh` / `.rh-in` / `.rh-mark` / `.rh-now` / `.rh-link` | Running head |
| `.thread` | The gold reading thread. Animate `transform: scaleX()`, never `width`. |
| `.meta-row` | The three-item masthead fact row |
| `.colophon` / `.folio` / `.print-btn` | Document close |

## Syntax colours

Four hues, no more: `.tk` keyword (link-ink), `.ts` string (good), `.tn`
number (warn), `.tc` comment (ink-3), `.tp` punctuation (ink-2).

## The reading grid, in one paragraph

Prose sits in a 33rem measure centred on the page. Tables, code, and notes
break out to 62rem — wider than the prose, so the eye registers them as a
different kind of object, the way a figure breaks the text block on a printed
page. The masthead runs to 44rem. Nothing else leaves the measure.
