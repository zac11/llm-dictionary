import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadySaid, isUseful, parseSections, repairLead, tidy } from '../scripts/enrich-people.mjs';
import { detailHighlights } from '../src/entry-actions.js';

test('repairLead rejoins a definition cut at an initial', () => {
  const fixed = repairLead('Ian J.', 'Goodfellow (born 1987) is an American computer scientist. He invented GANs.');
  assert.equal(fixed.definition, 'Ian J. Goodfellow (born 1987) is an American computer scientist.');
  assert.equal(fixed.details, 'He invented GANs.');
  assert.equal(repairLead('A full sentence.', 'More text.'), null);
});

test('parseSections splits a plain-text extract on its headings', () => {
  const { intro, sections } = parseSections('Intro line.\n\n== Career ==\nShe joined MIT.\n\n== Awards ==\nMany.');
  assert.equal(intro, 'Intro line.');
  assert.deepEqual(sections.map((s) => s.heading), ['Career', 'Awards']);
  assert.equal(sections[0].text, 'She joined MIT.');
});

test('tidy strips citation marks and raw URLs', () => {
  assert.equal(tidy('Built a repository (https://example.org/x) for tribal languages.[3]'), 'Built a repository for tribal languages.');
});

test('alreadySaid spots sentences page one already covers', () => {
  assert.ok(alreadySaid('Known for generative adversarial networks', 'He is known for generative adversarial networks.'));
  assert.ok(!alreadySaid('Joined Google Brain in 2017 to lead research', 'He is known for generative adversarial networks.'));
});

test('isUseful needs a lead and at least one filled section', () => {
  assert.ok(isUseful({ lead: 'A scientist.', affiliations: ['MIT'] }));
  assert.ok(!isUseful({ lead: 'A scientist.' }));
  assert.ok(!isUseful({ affiliations: ['MIT'] }));
});

test('detailHighlights turns a list of achievements into bullets', () => {
  assert.deepEqual(detailHighlights('Co-created PyTorch at Meta AI, co-authored DCGAN, and shaped open-source AI tooling.'), [
    'Co-created PyTorch at Meta AI',
    'Co-authored DCGAN',
    'Shaped open-source AI tooling',
  ]);
  assert.deepEqual(detailHighlights('Pioneered text-to-image systems.'), ['Pioneered text-to-image systems.']);
  assert.deepEqual(detailHighlights(''), []);
});
