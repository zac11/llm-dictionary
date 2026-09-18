function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isShortAcronym(value) {
  return value.length <= 3 && value.length >= 2 && /^[A-Z0-9]+$/.test(value);
}

function phrasePattern(value) {
  return value
    .split(/[\s\u2010-\u2015-]+/u)
    .map(escapeRegExp)
    .join('[\\s\\u2010-\\u2015-]+');
}

function createMatcher(phrase, caseSensitive) {
  const target = String(phrase || '').normalize('NFKC');
  if (!target || (!caseSensitive && target.length < 3)) return null;
  const finalCharacter = target.at(-1);
  const repeatedPunctuationGuard = /[\p{L}\p{N}]/u.test(finalCharacter)
    ? ''
    : `(?!${escapeRegExp(finalCharacter)})`;
  return {
    regex: new RegExp(
      `(^|[^\\p{L}\\p{N}])(${phrasePattern(target)})(?=$|[^\\p{L}\\p{N}])${repeatedPunctuationGuard}`,
      `gu${caseSensitive ? '' : 'i'}`
    ),
  };
}

function matchesWith(matcher, text) {
  if (!matcher) return [];
  const source = String(text || '').normalize('NFKC');
  const matches = [];
  matcher.regex.lastIndex = 0;
  let match;
  while ((match = matcher.regex.exec(source))) {
    const start = match.index + match[1].length;
    matches.push(`${start}:${start + match[2].length}`);
    if (matcher.regex.lastIndex === match.index) matcher.regex.lastIndex++;
  }
  return matches;
}

function occurrences(text, phrase, caseSensitive) {
  return matchesWith(createMatcher(phrase, caseSensitive), text);
}

function compileTarget(target) {
  return {
    canonical: createMatcher(target.term, false),
    aliases: [...target.aka]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map((alias) => {
        const acronym = isShortAcronym(alias);
        if (alias.length < 3 && !acronym) return null;
        return { matcher: createMatcher(alias, acronym), score: acronym ? 2 : 3 };
      })
      .filter(Boolean),
  };
}

function evidenceFor(source, compiledTarget) {
  const occupied = { definition: new Set(), details: new Set() };
  const canonical = { definition: false, details: false };
  const evidence = { definition: false, details: false, canonical: false, alias: false, mentions: 0 };

  for (const field of ['definition', 'details']) {
    for (const range of matchesWith(compiledTarget.canonical, source[field])) {
      occupied[field].add(range);
      canonical[field] = true;
      evidence[field] = true;
      evidence.canonical = true;
    }
  }

  let aliasScore = 0;
  for (const alias of compiledTarget.aliases) {
    for (const field of ['definition', 'details']) {
      for (const range of matchesWith(alias.matcher, source[field])) {
        if (occupied[field].has(range)) continue;
        occupied[field].add(range);
        evidence[field] = true;
        evidence.alias = true;
        aliasScore = Math.max(aliasScore, alias.score);
      }
    }
  }

  evidence.mentions = occupied.definition.size + occupied.details.size;
  if (!evidence.mentions) return null;
  const score =
    (canonical.definition ? 7 : 0) +
    (canonical.details ? 5 : 0) +
    aliasScore +
    Math.log2(1 + evidence.mentions);
  return { score: Number(score.toFixed(4)), evidence };
}

export function buildCoOccurrenceCandidates(terms, { limit = 8 } = {}) {
  const sorted = [...terms].sort((a, b) => a.slug.localeCompare(b.slug));
  const bySource = new Map(sorted.map((source) => [source.slug, []]));
  for (const target of sorted) {
    const compiledTarget = compileTarget(target);
    for (const source of sorted) {
      if (source.slug === target.slug) continue;
      const result = evidenceFor(source, compiledTarget);
      if (!result) continue;
      bySource.get(source.slug).push({
        source: source.slug,
        target: target.slug,
        score: result.score,
        evidence: result.evidence,
      });
    }
  }

  const edges = [];
  for (const source of sorted) {
    const candidates = bySource.get(source.slug);
    candidates.sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
    edges.push(...candidates.slice(0, limit));
  }
  return edges;
}

export const _test = { escapeRegExp, isShortAcronym, occurrences, compileTarget, evidenceFor };
