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

// What the earlier round said that a repair must carry forward, read from
// repaired-before.md rather than typed out again here. Claims about a commit
// are replaced by claims about the current head, so they are carried as
// evidence labelled with their commit instead of as visible text.
const flat = (text) => text.replace(/\s+/g, ' ').trim();
const pastTense = (text) =>
  flat(text)
    .replace(/\bpassed\b/g, 'pass')
    .replace(/\.$/, '');

function factsToKeep(source) {
  const { visible, evidence } = split(source);
  const facts = [
    { name: 'owner note', kind: 'text', text: source.match(/^> Owner note:[\s\S]*?\n\n/m)[0] },
    ...markers(source).map((text) => ({ name: text, kind: 'text', text })),
    { name: 'Closes line', kind: 'text', text: source.match(/^Closes #\d+$/m)[0] },
    { name: 'attribution', kind: 'text', text: ATTRIBUTION },
  ];
  for (const [, label, body] of visible.matchAll(/^\*\*(Checks|Not done):\*\*([\s\S]*?)\n\n/gm)) {
    for (const sentence of flat(body).split(/(?<=\.)\s+/)) {
      if (/`[0-9a-f]{7}`/.test(sentence)) continue;
      facts.push({ name: `${label} limit: ${sentence}`, kind: 'limit', text: sentence });
    }
  }
  for (const [, command, commit, result] of evidence.matchAll(
    /^- (`[^`]+`) on `([0-9a-f]{7})`: (.+)$/gm,
  )) {
    facts.push({
      name: `${command} result on ${commit}`,
      kind: 'earlier',
      command,
      commit,
      result,
    });
  }
  return facts;
}

/** The evidence listed under one head's label, up to the next head's label. */
function underHead(evidence, commit) {
  const sections = evidence.split(/^(?=\S.* head `[0-9a-f]{7}`)/m);
  return sections.find((section) => section.includes(`head \`${commit}\``)) ?? '';
}

/** The names of the facts from `source` that `rewritten` lost. */
function missingFacts(source, rewritten) {
  const { visible, evidence } = split(rewritten);
  return factsToKeep(source)
    .filter((fact) => {
      if (fact.kind === 'text') return !rewritten.includes(fact.text);
      if (fact.kind === 'limit') return !flat(visible).includes(fact.text);
      const bullets = underHead(evidence, fact.commit).match(
        /^- [\s\S]*?(?=^- |\n\n|$(?![\s\S]))/gm,
      );
      return !(bullets ?? []).some(
        (bullet) =>
          bullet.startsWith(`- ${fact.command}`) &&
          pastTense(bullet).includes(pastTense(fact.result)),
      );
    })
    .map((fact) => fact.name);
}

test('repaired: the earlier round has the facts these checks look for', () => {
  assert.deepEqual(
    factsToKeep(before).map((fact) => fact.name),
    [
      'owner note',
      '<!-- tessl-factory:issue-label: tessl -->',
      'Closes line',
      'attribution',
      'Checks limit: Not checked in a browser.',
      "Not done limit: the game's README still says a rim landing scores nothing.",
      '`npm run check` result on a1b2c3d',
    ],
  );
});

test('repaired: keeps every fact, limit and result from the earlier round', () => {
  assert.deepEqual(missingFacts(before, repaired), []);
});

// Each mutant deletes one fact from repaired.md and leaves the headings and
// labels around it, so a check that only looks for the heading would pass it.
const mutants = {
  'owner note': (text) => text.replace(/^> Owner note:[\s\S]*?\n\n/m, ''),
  '<!-- tessl-factory:issue-label: tessl -->': (text) =>
    text.replace('<!-- tessl-factory:issue-label: tessl -->\n', ''),
  'Closes line': (text) => text.replace('Closes #812\n', ''),
  attribution: (text) => text.replace(ATTRIBUTION, ''),
  'Checks limit: Not checked in a browser.': (text) =>
    text.replace(/ Not checked in a\s+browser\./, ''),
  "Not done limit: the game's README still says a rim landing scores nothing.": (text) =>
    text.replace(
      /\*\*Not done:\*\* the game's README still says a rim landing scores nothing\. /,
      '**Not done:** ',
    ),
  '`npm run check` result on a1b2c3d': (text) =>
    text.replace(/(Earlier head `a1b2c3d`.*\n\n)- `npm run check`: all steps passed\.\n/, '$1'),
};

test('repaired: every fact the earlier round had has a mutant', () => {
  assert.deepEqual(
    Object.keys(mutants),
    factsToKeep(before).map((fact) => fact.name),
  );
});

for (const [name, mutate] of Object.entries(mutants)) {
  test(`repaired: deleting ${name} fails the preservation check`, () => {
    const mutant = mutate(repaired);
    assert.notEqual(mutant, repaired, 'the mutant changes the fixture');
    assert.match(mutant, /^Earlier head `a1b2c3d`/m, 'the earlier head heading remains');
    assert.match(mutant, /^\*\*Not done:\*\*/m, 'the Not done label remains');
    assert.deepEqual(missingFacts(before, mutant), [name]);
  });
}

test('repaired: an earlier result moved under the current head is not kept', () => {
  const mutant = repaired
    .replace(/(Earlier head `a1b2c3d`.*\n\n)- `npm run check`: all steps passed\.\n/, '$1')
    .replace(/(Current head `e4f5a6b`:\n\n)/, '$1- `npm run check`: all steps passed.\n');
  assert.deepEqual(missingFacts(before, mutant), ['`npm run check` result on a1b2c3d']);
});

test('repaired: an earlier result reported as failed is not kept', () => {
  const mutant = repaired.replace('all steps passed.', 'two steps failed.');
  assert.deepEqual(missingFacts(before, mutant), ['`npm run check` result on a1b2c3d']);
});
