// The sample descriptions in docs/pr-writing-fixtures follow docs/pr-writing.md.
// These tests check what a description must keep when it is written or
// rewritten: markers, the closing line, attribution, human edits, visible
// limits and the detailed evidence. They do not grade the prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`../../docs/pr-writing-fixtures/${name}`, import.meta.url), 'utf8');
const fresh = read('fresh.md');
const before = read('repaired-before.md');
const repaired = read('repaired.md');

const ATTRIBUTION = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const markers = (text) => text.match(/^<!-- tessl-[^>]*-->$/gm) ?? [];

/** The description split into what a reader sees and what is collapsed. */
function split(text) {
  const blocks = [
    ...text.matchAll(/<details><summary>Evidence<\/summary>\n([\s\S]*?)<\/details>/g),
  ];
  let visible = text;
  for (const [whole] of blocks) visible = visible.replace(whole, '');
  return { visible, evidence: blocks.map(([, body]) => body).join('\n') };
}

for (const [name, text] of Object.entries({ fresh, repaired })) {
  test(`${name}: keeps the title prefix, closing line, markers and attribution`, () => {
    assert.match(text, /^# #812: /);
    assert.match(text, /^Closes #812$/m);
    assert.deepEqual(markers(text), ['<!-- tessl-factory:issue-label: tessl -->']);
    assert.ok(text.trimEnd().endsWith(ATTRIBUTION));
  });

  test(`${name}: detailed evidence is collapsed, limits stay visible`, () => {
    const { visible, evidence } = split(text);
    assert.match(evidence, /npm run check/);
    assert.match(visible, /^\*\*Checks:\*\*.*`[0-9a-f]{7}`/m, 'visible checks name a commit');
    assert.match(visible, /^\*\*Not done:\*\*/m, 'remaining work is visible');
    assert.match(visible, /Not checked in a\s+browser|did not look at the change in\s+a\s+browser/);
  });
}

test('repaired: keeps the owner note word for word', () => {
  const note = before.match(/^> Owner note:[\s\S]*?\n\n/m)[0];
  assert.ok(repaired.includes(note));
});

test('repaired: keeps everything the earlier round had to keep', () => {
  for (const marker of markers(before)) assert.ok(repaired.includes(marker), marker);
  assert.match(repaired, /^Closes #812$/m);
  assert.ok(repaired.includes(ATTRIBUTION));
});

test('repaired: claims cover the current head, older evidence is labelled with its commit', () => {
  const oldHead = before.match(/passes on `([0-9a-f]{7})`/)[1];
  const { visible, evidence } = split(repaired);
  const newHead = visible.match(/passes on `([0-9a-f]{7})`, the current head/)[1];
  assert.notEqual(newHead, oldHead);
  assert.ok(!visible.includes(oldHead), 'visible claims are about the current head only');
  assert.match(evidence, new RegExp(`Current head \`${newHead}\``));
  assert.match(evidence, new RegExp(`Earlier head \`${oldHead}\``));
});

test('repaired: a queued check and a merge are not reported as passed or deployed', () => {
  const { visible } = split(repaired);
  assert.match(visible, /queued[^.]*has not finished/);
  assert.match(visible, /Not\s+deployed/);
});

test('repaired: describes the change once, not a diary of rounds', () => {
  assert.equal((repaired.match(/<details>/g) ?? []).length, 1);
  assert.equal((repaired.match(/^# /gm) ?? []).length, 1);
});
