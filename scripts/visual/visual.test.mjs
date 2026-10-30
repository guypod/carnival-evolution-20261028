// Checks the visual-design lens's rubric, its calibration fixtures and the
// baseline's provenance. These are bookkeeping checks: they keep the recorded
// assessments honest and the screenshots present. They are not a visual
// judgment; a person or the lens makes that by looking at the images.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url)));
const exists = (path) => existsSync(new URL(`../../${path}`, import.meta.url));
const rubric = read('review-lenses/visual-design/rubric.json');
const { samples } = read('review-lenses/visual-design/fixtures/assessments.json');
const verdictOf = (text) => text.split(':')[0];

test('every fixture assessment judges every rubric criterion with a known verdict', () => {
  for (const [name, sample] of Object.entries(samples)) {
    assert.deepEqual(Object.keys(sample.verdicts).sort(), [...rubric.criteria].sort(), name);
    for (const [criterion, text] of Object.entries(sample.verdicts)) {
      assert.ok(rubric.verdicts.includes(verdictOf(text)), `${name}.${criterion}: ${text}`);
      assert.ok(text.split(':')[1]?.trim(), `${name}.${criterion} says what the image shows`);
    }
  }
});

test('the inconsistent sample is caught and the compliant one passes', () => {
  const findings = (name) =>
    Object.entries(samples[name].verdicts)
      .filter(([, text]) => verdictOf(text) === 'finding')
      .map(([criterion]) => criterion);
  for (const required of ['composition', 'controls', 'focus-contrast']) {
    assert.ok(findings('inconsistent').includes(required), required);
  }
  assert.deepEqual(findings('compliant'), []);
  assert.ok(
    Object.values(samples.compliant.verdicts).every((text) => verdictOf(text) === 'pass'),
    'a compliant verdict cannot be unverified',
  );
});

test('every assessment and baseline entry points at a screenshot that exists', () => {
  for (const sample of Object.values(samples)) {
    assert.ok(sample.screenshots.length > 0);
    for (const file of sample.screenshots) {
      assert.ok(exists(`review-lenses/visual-design/fixtures/${file}`), file);
    }
  }
  const provenance = read('docs/visual-baseline/provenance.json');
  for (const phase of ['before', 'after']) {
    assert.match(provenance[phase].commit, /^[0-9a-f]{7,40}$/);
    for (const shot of provenance[phase].shots) {
      const folder = phase === 'after' ? 'after' : shot.route === '#/' ? 'reference' : 'before';
      assert.ok(exists(`docs/visual-baseline/${folder}/${shot.file}`), shot.file);
      assert.ok(shot.pixels.colours >= 8 && shot.pixels.flatShare <= 0.97, `${shot.file} is blank`);
      assert.deepEqual(shot.errors, [], shot.file);
    }
  }
});

test('every repository-local action skill is exported by its plugin', () => {
  const { actions } = read('tessl.json');
  const { skills } = read('tessl-factory/.tessl-plugin/plugin.json');
  for (const [name, { skill }] of Object.entries(actions)) {
    const local = skill.match(/^file:tessl-factory#(.+)$/);
    if (!local) continue;
    assert.ok(skills.includes(`skills/${local[1]}`), `${name} needs skills/${local[1]}`);
    assert.ok(exists(`tessl-factory/skills/${local[1]}/SKILL.md`), `${name} has a SKILL.md`);
  }
});
