// Post-build step: writes a real HTML page per term at /term/<slug>/.
//
// Social crawlers (LinkedIn, X, Slack, Medium) do not run JavaScript, so the
// single-page app alone cannot describe an individual entry to them. Each
// generated page is a copy of the built index.html with the <title>, the
// description and the Open Graph / Twitter tags rewritten for that term, so the
// link previews read "Transformer — ..." instead of a generic site blurb. The
// page still boots the normal app, which opens the entry from the URL path.
//
//   node scripts/prerender-share.mjs
//
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');

// Netlify exposes URL / DEPLOY_PRIME_URL; SITE_URL lets any host or local build
// set it explicitly. Without one we fall back to root-relative URLs.
const SITE_URL = (process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || '')
  .trim()
  .replace(/\/+$/, '');
const abs = (path) => (SITE_URL ? SITE_URL + path : path);

const SITE_TITLE = 'Tokenary — The AI Engineering Dictionary';
const SITE_DESC =
  'An interactive 3D dictionary of AI and machine-learning terms, A–Z, with citations.';

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Trim to a tidy length on a word boundary (crawlers cut us off otherwise). */
function clamp(text, max = 200) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.]$/, '') + '…';
}

function socialBlock({ title, description, path, type }) {
  const image = abs('/og.png');
  return `<!-- social:start -->
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="Tokenary" />
    <meta property="og:locale" content="en" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(abs(path))}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <link rel="canonical" href="${esc(abs(path))}" />
    <!-- social:end -->`;
}

const SOCIAL_RE = /<!-- social:start -->[\s\S]*?<!-- social:end -->/;
const TITLE_RE = /<title>[\s\S]*?<\/title>/;
const DESC_RE = /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/>/;

/** Rewrite a copy of the built index.html for one page. */
function render(html, { title, description, path, type = 'website', jsonLd = null }) {
  let out = html
    .replace(TITLE_RE, `<title>${esc(title)}</title>`)
    .replace(DESC_RE, `<meta name="description" content="${esc(description)}" />`)
    .replace(SOCIAL_RE, socialBlock({ title, description, path, type }));
  if (jsonLd) {
    out = out.replace(
      '</head>',
      `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`
    );
  }
  return out;
}

// ------------------------------------------------------------------ terms ----
const dictionary = join(root, 'dictionary');
const terms = [];
for (const entry of readdirSync(dictionary, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const file of readdirSync(join(dictionary, entry.name))) {
    if (!file.endsWith('.json')) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(dictionary, entry.name, file), 'utf8'));
    } catch {
      console.warn(`   ! skipping malformed ${entry.name}/${file}`);
      continue;
    }
    const term = String(raw.term || '').trim();
    if (!term) continue;
    terms.push({
      term,
      slug: raw.slug || term.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: raw.category || 'General',
      definition: raw.definition || '',
    });
  }
}
terms.sort((a, b) => a.term.localeCompare(b.term));

let template;
try {
  template = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('✗ dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

// the site root itself gains an absolute og:url / canonical when we know it
writeFileSync(
  join(dist, 'index.html'),
  render(template, { title: SITE_TITLE, description: SITE_DESC, path: '/', type: 'website' })
);

const bySlug = new Map();
for (const term of terms) {
  const title = `${term.term} — Tokenary`;
  const description = clamp(`${term.category}: ${term.definition}`, 200) || SITE_DESC;
  // trailing slash on purpose: every static host resolves /x/ to /x/index.html,
  // whereas the extensionless form relies on host-specific "pretty URL" rules
  const path = `/term/${term.slug}/`;
  const html = render(template, {
    title,
    description,
    path,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      name: term.term,
      description: term.definition,
      url: abs(path),
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        name: SITE_TITLE,
        url: abs('/'),
      },
    },
  });
  const dir = join(dist, 'term', term.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  bySlug.set(term.slug, term);
}

// sitemap + robots (only meaningful with a public origin)
if (SITE_URL) {
  const urls = [
    `<url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...[...bySlug.keys()].map(
      (slug) => `<url><loc>${SITE_URL}/term/${slug}/</loc><priority>0.8</priority></url>`
    ),
  ];
  writeFileSync(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      '\n'
    )}\n</urlset>\n`
  );
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

console.log(
  `🔗 prerendered ${bySlug.size} share pages → dist/term/<slug>/index.html${
    SITE_URL ? ` (origin ${SITE_URL})` : ' (no SITE_URL — using relative URLs)'
  }`
);
