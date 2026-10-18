import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cleanExtract,
  composeDefinition,
  foldAscii,
  mergePeople,
  normalizePerson,
  personKey,
  profileFromUrls,
  readPeopleFile,
  splitSentences,
} from '../scripts/import-people.mjs';

test('personKey collapses accents, middle initials, quotes and parentheticals', () => {
  assert.equal(personKey('Diederik P. Kingma'), personKey('Diederik Kingma'));
  assert.equal(personKey('Łukasz Kaiser'), personKey('Lukasz Kaiser'));
  assert.equal(personKey('Joëlle Pineau'), personKey('Joelle Pineau'));
  assert.equal(personKey('Margaret Mitchell (scientist)'), personKey('Margaret Mitchell'));
  assert.equal(personKey('Emily M. Bender'), personKey('Emily Bender'));
});

test('foldAscii transliterates letters NFKD leaves alone', () => {
  assert.equal(foldAscii('Łukasz'), 'Lukasz');
  assert.equal(foldAscii('Jürgen'), 'Jurgen');
});

test('normalizePerson reads both source shapes', () => {
  assert.deepEqual(
    normalizePerson({
      name: ' Alan Turing ',
      famous_for: 'Father of computer science',
      contribution: 'Formulated the Turing machine.',
      url: 'https://en.wikipedia.org/wiki/Alan_Turing',
    }),
    {
      name: 'Alan Turing',
      famousFor: 'Father of computer science',
      contribution: 'Formulated the Turing machine.',
      url: 'https://en.wikipedia.org/wiki/Alan_Turing',
      category: '',
    }
  );
  assert.deepEqual(
    normalizePerson({ name: 'Ruslan Salakhutdinov', contributions: 'Deep Boltzmann machines', website: 'https://example.com', category: 'Academic' }),
    {
      name: 'Ruslan Salakhutdinov',
      famousFor: '',
      contribution: 'Deep Boltzmann machines',
      url: 'https://example.com',
      category: 'Academic',
    }
  );
  assert.equal(normalizePerson({ famous_for: 'no name' }), null);
});

test('mergePeople merges spellings and keeps the longest contribution', () => {
  const merged = mergePeople([
    { name: 'Diederik P. Kingma', famousFor: 'Adam optimizer', contribution: 'Co-invented Adam.', url: 'https://a.example', category: '' },
    { name: 'Diederik Kingma', famousFor: '', contribution: 'Co-invented the Adam optimizer and authored the VAE paper.', url: 'https://b.example', category: 'Academic' },
    { name: 'Swyx (Shawn Wang)', famousFor: 'AI engineer', contribution: 'Runs the Latent Space podcast.', url: '', category: '' },
    { name: "Shawn 'swyx' Wang", famousFor: '', contribution: 'Wrote about AI engineering.', url: '', category: '' },
  ]);

  assert.equal(merged.length, 2);
  const kingma = merged.find((person) => person.names.includes('Diederik P. Kingma'));
  assert.deepEqual(kingma.names.sort(), ['Diederik Kingma', 'Diederik P. Kingma']);
  assert.equal(kingma.contribution, 'Co-invented the Adam optimizer and authored the VAE paper.');
  assert.deepEqual(kingma.urls, ['https://a.example', 'https://b.example']);
  assert.equal(merged.some((person) => person.names.length === 2 && person.names.includes("Shawn 'swyx' Wang")), true);
});

test('composeDefinition builds a sentence from either a verb or a role', () => {
  assert.equal(
    composeDefinition('John McCarthy', 'Coining the term "Artificial Intelligence" and inventing Lisp'),
    'John McCarthy is known for coining the term "Artificial Intelligence" and inventing Lisp.'
  );
  assert.equal(
    composeDefinition('Herbert A. Simon', 'Pioneered symbolic AI at RAND'),
    'Herbert A. Simon pioneered symbolic AI at RAND.'
  );
  assert.equal(
    composeDefinition('Alan Turing', 'Father of theoretical computer science'),
    'Alan Turing is the father of theoretical computer science.'
  );
  assert.equal(composeDefinition('Mausam', ''), 'Mausam is an artificial intelligence researcher.');
});

test('composeDefinition keeps acronyms and picks the right article', () => {
  assert.equal(composeDefinition('Koray Kavukcuoglu', 'CTO of Google DeepMind'), 'Koray Kavukcuoglu is CTO of Google DeepMind.');
  assert.equal(composeDefinition('Ming-Yu Liu', 'VP of Research at NVIDIA'), 'Ming-Yu Liu is VP of Research at NVIDIA.');
  assert.equal(composeDefinition('Andriy Burkov', 'ML author'), 'Andriy Burkov is the author of ML.');
  assert.equal(
    composeDefinition('Tariq King', 'AI testing researcher and leader'),
    'Tariq King is an AI testing researcher and leader.'
  );
  assert.equal(
    composeDefinition('Grant Sanderson', '3Blue1Brown creator'),
    'Grant Sanderson is the creator of 3Blue1Brown.'
  );
  assert.equal(
    composeDefinition('Jacob Devlin', 'BERT lead author'),
    'Jacob Devlin is the lead author of BERT.'
  );
  assert.equal(composeDefinition('Dave Ferrucci', 'IBM Watson lead'), 'Dave Ferrucci led IBM Watson.');
});

test('splitSentences keeps initials and abbreviations intact', () => {
  assert.deepEqual(
    splitSentences('Daniela L. Rus (born 1963) is a Romanian-American computer scientist. She directs CSAIL.'),
    ['Daniela L. Rus (born 1963) is a Romanian-American computer scientist.', 'She directs CSAIL.']
  );
  assert.deepEqual(
    splitSentences('Patrick J. Esser is a researcher at Runway. He co-authored Stable Diffusion.'),
    ['Patrick J. Esser is a researcher at Runway.', 'He co-authored Stable Diffusion.']
  );
  assert.deepEqual(splitSentences('Dr. Smith works in the U.S. on AI safety. He publishes.'), [
    'Dr. Smith works in the U.S. on AI safety.',
    'He publishes.',
  ]);
});

test('profileFromUrls labels services, skips Wikipedia and dedupes', () => {
  assert.deepEqual(
    profileFromUrls([
      'https://www.linkedin.com/in/samaltman',
      'https://www.linkedin.com/in/samaltman',
      'https://en.wikipedia.org/wiki/Sam_Altman',
      'https://blog.samaltman.com',
      '',
    ]),
    {
      links: [
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/samaltman' },
        { label: 'Website', url: 'https://blog.samaltman.com' },
      ],
      highlights: [],
    }
  );
});

test('cleanExtract repairs the empty-pronunciation artifact', () => {
  assert.equal(
    cleanExtract('Alan Turing (; 23 June 1912 – 7 June 1954) was a mathematician.'),
    'Alan Turing (23 June 1912 – 7 June 1954) was a mathematician.'
  );
  assert.equal(cleanExtract('A  name\n with   space '), 'A name with space');
});

test('readPeopleFile accepts an array, a people wrapper, and repairs stray quotes', () => {
  const dir = tmpdir();
  const arrayFile = join(dir, 'aidict-people-array.json');
  writeFileSync(arrayFile, JSON.stringify([{ name: 'A Person', famous_for: 'Things' }]));
  assert.equal(readPeopleFile(arrayFile).length, 1);

  const wrapperFile = join(dir, 'aidict-people-wrapper.json');
  writeFileSync(wrapperFile, JSON.stringify({ count: 1, people: [{ name: 'B Person' }] }));
  assert.deepEqual(readPeopleFile(wrapperFile).map((p) => p.name), ['B Person']);

  const brokenFile = join(dir, 'aidict-people-broken.json');
  writeFileSync(
    brokenFile,
    '[\n  {\n    "name": "C Person",\n    "contribution": "Proved patches ("An Image") work",\n    "url": "https://example.com"\n  }\n]\n'
  );
  const repaired = readPeopleFile(brokenFile);
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].contribution, 'Proved patches ("An Image") work');
});
