---
title: Release Notes 4.2
subtitle: What shipped, what slipped, and what changes next.
date: 2026-09-27
scope: the whole platform
source: the tracker and the staging logs
path: docs/release-4.2.md
---

# Release Notes 4.2

Release notes are usually a wall of bullet points. This one is a document, so
it gets a measured column, a contents list, and a running head that tells you
where you are. This paragraph exists to give the audit something real to sample
when it measures characters per line across several paragraphs of body text.

## 1. Shipped

- A new export path for the nightly job
- Two migrations folded into one

| Surface | Before | After |
|---|---:|---:|
| Build time | 412 s | 268 s |
| Cache hit rate | 61% | 88% |

> **Read this first:** the cache change is the reason for most of the numbers
> above, and it is safe to roll back.

<!-- pull -->

> A pull quote is a claim the reader should stop on, set larger and centred
> between two rules so the page has one moment of emphasis rather than ten.

<!-- risk-note: Migration window -->

> A risk note is tinted and labelled from the directive, so a compliance or
> safety caveat is impossible to skim past.

```ts
export function revalidate(paths: string[]): void {
  paths.forEach((p) => cache.delete(p)); // idempotent
}
```

## 2. Slipped

The importer rewrite moved to 4.3. The tracking gap is documented in the
tracker, and the interim workaround is written up below so nobody has to
rediscover it while the rewrite is in flight.

### 2.1 The gap

Long enough to be a measured paragraph in its own right, which helps the audit
confirm the measure is still inside the comfortable band after any theme or
font change rather than drifting wider with every token edit that lands.

- [ ] Confirm the importer owner
- [x] Post the interim workaround

1. Cut 4.3
2. Retire the legacy exporter

## 3. Notes

Text with `inline code`, **bold**, *emphasis*, ~~struck~~, a
[link](https://example.com), an entity &amp; that must not double-escape, and
angle brackets < and > that must escape. A bare URL https://example.org/x?a=1.
should linkify without swallowing the period that follows it.
