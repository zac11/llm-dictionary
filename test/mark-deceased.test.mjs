import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deceasedFromWikitext,
  disambiguationVerdict,
  readsAsDeceased,
  wikipediaDeceased,
} from '../scripts/mark-deceased.mjs';

test('readsAsDeceased spots a lifespan or death wording', () => {
  assert.equal(readsAsDeceased('Alan Mathison Turing (23 June 1912 – 7 June 1954) was an English mathematician.'), 'lifespan');
  assert.equal(readsAsDeceased('Trenchard More (1930 – 2019) was a mathematician.'), 'lifespan');
  assert.equal(readsAsDeceased('William Arthur Martin (1938-1981) was a computer scientist.'), 'lifespan');
  assert.equal(readsAsDeceased('He died in 2014.'), 'wording');
  assert.equal(readsAsDeceased('Sam Altman (born April 22, 1985) is an American entrepreneur.'), null);
});

test('wikipediaDeceased reads only the opening, so a show run is not a lifespan', () => {
  assert.equal(
    wikipediaDeceased(
      'Alan Mathison Turing (23 June 1912 – 7 June 1954) was an English mathematician and logician.'
    ),
    'wiki-lifespan'
  );
  // a living broadcaster with a dated show: "(2001–2010)" must not count
  assert.equal(
    wikipediaDeceased(
      'Jonathan Stephen Ross (born 17 November 1960) is an English broadcaster. He presented Friday Night with Jonathan Ross (2001–2010).'
    ),
    null
  );
  assert.equal(wikipediaDeceased('Sam Altman (born April 22, 1985) is an American entrepreneur.'), null);
});

test('disambiguationVerdict picks the right namesake using the field', () => {
  const nils = [
    'Nils Nilsson may refer to:',
    'Nils Nilsson (art director) (1919–1981), Swedish film set designer',
    'Nils John Nilsson (1933–2019), artificial intelligence researcher',
    'Nils Nilsson (ice hockey) (1936–2017), Swedish ice hockey player',
  ].join('\n');
  assert.equal(disambiguationVerdict(nils, 'Nils Nilsson'), 'wiki-disambiguation');

  const stuart = [
    'Stuart Russell may refer to:',
    'Stuart Russell (footballer) (1906–1978), Australian rules footballer',
    'Stuart J. Russell (born 1962), computer scientist known for artificial intelligence',
  ].join('\n');
  assert.equal(disambiguationVerdict(stuart, 'Stuart Russell'), null);

  // two people in the same field: do not guess
  const rachel = [
    'Rachel Thomas may refer to:',
    'Rachel Thomas (academic) (born 1983), American computer scientist',
    'Rachel Thomas (engineer) (1920–1999), British software engineer',
  ].join('\n');
  assert.equal(disambiguationVerdict(rachel, 'Rachel Thomas'), null);
});

test('deceasedFromWikitext reads a listing that explaintext dropped', () => {
  const wikitext = [
    '* [[John McCarthy (Irish politician)]] (1862–1893), member of parliament',
    '* [[John McCarthy (computer scientist)]] (1927–2011), American computer scientist and cognitive scientist',
    '* [[John H. McCarthy]] (1850–1908), U.S. representative',
  ].join('\n');
  assert.equal(deceasedFromWikitext(wikitext, 'John McCarthy'), 'wikitext-disambiguation');

  const living = '* [[Stuart J. Russell]] (born 1962), computer scientist known for artificial intelligence';
  assert.equal(deceasedFromWikitext(living, 'Stuart Russell'), null);
});
