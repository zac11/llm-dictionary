// Coverage dashboard data: how many terms each letter, category and type
// holds, and which of them are thin enough to ask contributors for help.
import { LETTERS } from './term-schema.js';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const countBy = (terms, key) => {
  const counts = new Map();
  for (const term of terms) {
    const value = key(term);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
};

/**
 * Letters below `thinRatio` of the median letter count are thin. Categories
 * are ranked by size; small ones (at most `thinCategory` terms) are listed as
 * thin so the dashboard can point contributors at them.
 */
export function coverageStats(terms, { thinRatio = 0.5, thinCategory = 3, topCategories = 12 } = {}) {
  const letterCounts = countBy(terms, (term) => term.letter);
  const letterMedian = median(LETTERS.split('').map((letter) => letterCounts.get(letter) || 0));
  const letters = LETTERS.split('').map((letter) => {
    const count = letterCounts.get(letter) || 0;
    return { letter, count, thin: count < letterMedian * thinRatio };
  });
  const categories = [...countBy(terms, (term) => term.category)]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  const types = [...countBy(terms, (term) => term.type)]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const withExplainer = terms.filter((term) => term.explainer).length;
  const withContributors = terms.filter((term) => term.contributors?.length).length;
  return {
    total: terms.length,
    letterMedian,
    letters,
    thinLetters: letters.filter((item) => item.thin),
    categoryCount: categories.length,
    topCategories: categories.slice(0, topCategories),
    thinCategories: categories.filter((item) => item.count <= thinCategory),
    types,
    withExplainer,
    withContributors,
  };
}
