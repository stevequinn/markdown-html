#!/usr/bin/env node
/**
 * Smoke test for the markdown-html skill.
 *
 * This repo ships executable code, so a broken parser must fail loudly rather
 * than quietly produce a worse page. No dependencies: node:test, built in.
 *
 *   node --test test/
 *   npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'markdown-html');
const BUILD = join(SKILL, 'scripts', 'build.mjs');
const AUDIT = join(SKILL, 'scripts', 'audit.js');
const PARSER = join(SKILL, 'scripts', 'markdown.mjs');
const THEME = join(SKILL, 'assets', 'theme.css');

const tmp = mkdtempSync(join(tmpdir(), 'markdown-html-test-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

const build = (fixture, out, extra = []) =>
  execFileSync(process.execPath, [BUILD, join(ROOT, 'test', 'fixtures', fixture), '-o', join(tmp, out), ...extra], {
    encoding: 'utf8',
  });

/* ------------------------------- shape ------------------------------- */

test('skill layout matches what `npx skills init` scaffolds', () => {
  for (const p of ['SKILL.md', 'scripts/build.mjs', 'scripts/markdown.mjs', 'scripts/audit.js', 'assets/theme.css']) {
    assert.ok(existsSync(join(SKILL, p)), `missing ${p}`);
  }
});

test('SKILL.md frontmatter declares name and description', () => {
  const src = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'no frontmatter block');
  assert.match(fm[1], /^name:\s*markdown-html$/m);
  assert.match(fm[1], /^description:\s*\S/m);
});

test('no machine-specific paths ship with the skill', () => {
  // a leading ~ followed by / must escape the slash or it closes the literal
  const machinePath = /\/Users\/|\/home\/|~\/\.agents|~\/\.config/;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(md|mjs|js|css)$/.test(entry.name)) continue;
      assert.ok(!machinePath.test(readFileSync(p, 'utf8')), `machine path in ${p}`);
    }
  };
  walk(SKILL);
});

test('all three scripts parse', () => {
  for (const f of [PARSER, BUILD, AUDIT]) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

/* ----------------------------- happy path ----------------------------- */

test('a clean document builds with zero warnings', () => {
  const out = build('clean.md', 'clean.html');
  assert.match(out, /no parser warnings/);
  assert.match(out, /\d+ chapters/);
});

test('the clean document renders every structure it declares', () => {
  const html = readFileSync(join(tmp, 'clean.html'), 'utf8');

  const has = (label, re) => assert.match(html, re, label);

  has('masthead title', /Release Notes 4\.2/);
  has('meta fact row', /class="meta-row"/);
  has('contents with leaders', /class="leader"/);
  has('running head', /class="rh-mark"/);
  has('reading thread', /class="thread"/);
  has('chapter numerals', /class="ch-num">§1</);
  has('subsection numerals', /class="ch-num"[^>]*>2\.1</);
  has('prose wrapper', /class="prose-doc"/);

  has('breakout figure wider than the measure', /class="fig-code breakout"/);
  has('right-aligned numeric column', /<th scope="col" class="num">/);
  has('code figure', /<figure class="fig-code breakout"><pre><code>/);
  has('syntax highlighting', /<span class="tk">export<\/span>/);
  has('comment highlighting', /<span class="tc">\/\/ idempotent<\/span>/);

  has('pull quote', /class="pull"/);
  has('risk note', /note-risk/);
  has('promoted note label', /class="note-label">Read this first/);
  has('checklist', /class="checks"/);
  has('checked item keeps its state', /class="box is-done"/);
  has('checked item is announced', /class="sr">Done: </);
  has('ordered list', /class="num-list is-hairline"/);

  has('entity not double-escaped', /&amp; that must not/);
  has('angle brackets escaped', /&lt; and &gt; that must escape/);
  has('bare url linkified', /href="https:\/\/example\.org\/x\?a=1"/);
  has('trailing period not swallowed', /a=1<\/a>\./);
  has('strikethrough', /<del>struck<\/del>/);
});

test('output is self-contained: no local files, no webfont by default', () => {
  const html = readFileSync(join(tmp, 'clean.html'), 'utf8');
  // A document's own hyperlinks are content, not dependencies. What must not
  // appear is a reference to a file that has to travel with the page, or a
  // webfont the page asked for without being told to.
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const local = refs.filter((r) => !r.startsWith('#') && !/^https?:\/\//.test(r));
  assert.deepEqual(local, [], 'page references local files: ' + local.join(' '));
  assert.ok(!/fonts\.(googleapis|gstatic)/.test(html), 'webfont loaded without a font: key');
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), 'external stylesheet in a self-contained page');
});

/* ---------------------------- warning path ---------------------------- */

test('unrepresentable constructs warn instead of vanishing', () => {
  const out = build('warns.md', 'warns.html');
  for (const w of [
    'setext heading',
    'reference-style link',
    'footnote reference',
    'link reference definition',
    'nested list deeper than one level',
  ]) {
    assert.ok(out.includes(w), `missing warning: ${w}`);
  }
});

test('--strict fails the build when there are warnings', () => {
  const r = spawnSync(process.execPath, [BUILD, join(ROOT, 'test', 'fixtures', 'warns.md'), '-o', join(tmp, 'w.html'), '--strict'], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'expected exit 2');
});

test('--strict passes on a clean document', () => {
  const r = spawnSync(process.execPath, [BUILD, join(ROOT, 'test', 'fixtures', 'clean.md'), '-o', join(tmp, 'c.html'), '--strict'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});

/* -------------------------------- theme ------------------------------- */

test('theme exposes the tokens a retheme depends on', () => {
  const css = readFileSync(THEME, 'utf8');
  for (const token of [
    '--paper', '--stock', '--ink', '--ink-2', '--ink-3',
    '--rule', '--accent', '--accent-ink', '--link', '--risk',
    '--font-sans', '--font-mono', '--measure', '--breakout',
  ]) {
    assert.ok(css.includes(token + ':'), `missing token ${token}`);
  }
});

test('theme never ships a hardcoded webfont', () => {
  const css = readFileSync(THEME, 'utf8');
  assert.ok(!/@import|@font-face|fonts\.googleapis/.test(css), 'theme should not load a font');
  assert.match(css, /--font-sans:\s*ui-sans-serif/, 'expected a system font stack default');
});

/* ------------------------------- audit ------------------------------- */
// audit.js needs a real layout engine, so it cannot be executed here. These
// guard the two things that actually regressed, so a future rewrite that
// reintroduces them fails loudly.

test('audit measures the first visual line, not chars-per-line-count', () => {
  const src = readFileSync(AUDIT, 'utf8');
  assert.ok(!/t\.length\s*\/\s*lines/.test(src), 'regressed to dividing chars by line count');
  assert.match(src, /firstLineChars/, 'no first-line measurement');
  assert.match(src, /binary search/i, 'wrap-point search is gone');
});

test('audit refuses to judge the measure on a thin sample', () => {
  const src = readFileSync(AUDIT, 'utf8');
  assert.match(src, /MEASURE_MIN_SAMPLES/, 'no minimum-sample gate');
  assert.match(src, /measureTrustworthy/, 'measure is not gated on sample count');
});

test('audit converts any colour format before measuring contrast', () => {
  const src = readFileSync(AUDIT, 'utf8');
  assert.match(src, /getImageData/, 'colours are not resolved through a canvas');
  assert.match(src, /getContext\('2d'/, 'no 2d context for colour resolution');
});
