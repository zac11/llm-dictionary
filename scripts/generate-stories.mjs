// -----------------------------------------------------------------------------
//  Story generator — adds a "story" field to every term JSON.
//
//  Run:  node scripts/generate-stories.mjs
//        node scripts/generate-stories.mjs --force   (regenerate existing)
//
//  Each term gets a 3–5 sentence micro-story in plain, everyday language:
//  a concrete scene → two plain explanations of the idea → a category analogy
//  → a takeaway that names the term. All the prose is hand-written per category
//  bucket (no technical definition is pasted in), so a non-expert can follow
//  every sentence. Selection is a deterministic hash of the slug, so re-running
//  is stable. Terms that already carry a hand-edited "story" are left untouched
//  unless --force is passed.
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'dictionary');
const FORCE = process.argv.includes('--force');

// Slugs with hand-written stories that must survive regeneration.
const PRESERVE = new Set(['scalable-oversight', 'transformer', 'transfer-learning']);

// ------------------------------------------------------------- small helpers --
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
};
const pick = (arr, seed) => arr[seed % arr.length];


// --------------------------------------------------------------- voice parts --
// Plain, everyday explanations of each concept family. These replace the raw
// technical definition in the story, so a non-expert can follow every line.
const EXPLANATIONS = {
  safety: [
    'The idea is simple: before something powerful is let loose, someone checks that it will not do real harm to real people.',
    'It is the habit of asking, before every launch, what could go wrong — and then doing something about it.',
    'Think of it as the quiet rule that a tool should be useful without being dangerous.',
  ],
  reinforcement: [
    'The machine is not handed the answers — it tries things, earns a reward or a miss, and slowly figures out what works.',
    'It learns the way a child learns to walk: wobble, fall, adjust, repeat.',
    'Instead of being told the rules, it discovers them by living with the consequences.',
  ],
  agents: [
    'The machine stops just answering one question and starts getting a job done, step by step, checking its work along the way.',
    'It plans a little, acts a little, looks at the result, and then decides what to do next.',
    'It is the difference between a search engine and a helper who actually finishes the task.',
  ],
  reasoning: [
    'Instead of blurting out an answer, the machine talks its way through the problem one step at a time.',
    'It writes its thinking down, reads it back, and fixes the parts that do not hold up.',
    'Slowing down to think often beats answering fast.',
  ],
  vision: [
    'The machine learns to see the way we do — starting with shapes and edges, then building up to whole objects and faces.',
    'It turns a picture into an understanding: this is a cat, that is a stop sign.',
    'What your eyes do without thinking, the machine does one careful layer at a time.',
  ],
  generation: [
    'Given a starting line, the machine imagines what comes next — a word, a note, a patch of a picture.',
    'It makes new things by recombining everything it has ever seen.',
    'The result feels creative because it is memory, reshuffled at speed.',
  ],
  language: [
    'The machine learns language the way you did — by hearing so much of it that the patterns sink in.',
    'It figures out meaning by noticing which words like to travel together.',
    'It does not memorize a rulebook; it absorbs a library.',
  ],
  training: [
    'The machine starts out clumsy, makes mistakes, and is nudged a little less wrong every time.',
    'It is the same loop you use to learn anything: try, miss, correct, try again.',
    'Underneath all the magic is a patient process of small improvements.',
  ],
  evaluation: [
    'Before trusting a machine, someone has to measure how good it really is — fairly and honestly.',
    'It is the exam that separates “it sounds good” from “it actually is good”.',
    'A fair scoreboard keeps everyone honest.',
  ],
  architecture: [
    'At the bottom of every machine is a design — the shape of it, and how its pieces talk to each other.',
    'The layout decides what the machine can even attempt, before it learns a single thing.',
    'It is the blueprint that makes everything else possible.',
  ],
  data: [
    'Every machine is shaped by what it was shown, so someone has to choose that material with care.',
    'The examples a machine reads become the world it believes in.',
    'Better ingredients make a better meal, and the same is true here.',
  ],
  general: [
    'Behind the jargon is an idea you could explain to a friend over coffee.',
    'At its heart it is a simple notion, once you strip away the fancy name.',
    'A small key that opens a much bigger door.',
  ],
};

// Each bucket: keyword test + hand-written scene openers, analogies and
// takeaways. `{term}` in takeaways is replaced with the term name.
const BUCKETS = [
  {
    name: 'safety',
    test: /safety|align|bias|fair|ethic|govern|jailbreak|harm|privacy|security|regulation|red.?team|anthropic|superalignment|misuse/i,
    scenes: [
      'Picture guardrails on a mountain road — not there to slow you down on the straightaways, but to keep you from flying off the cliff.',
      'Imagine a new medicine that works brilliantly in the lab but still has to be tested on real people before anyone takes it.',
      'Picture a parachute packed by a second pair of hands: nobody plans to need it, but everyone is glad it was checked.',
    ],
    analogies: [
      "It is the difference between “it works” and “it is safe to put in front of people.”",
      'Rules and red-teaming are the brakes that make the speed trustworthy.',
      'Caution is not the enemy of progress — it is the reason progress gets to keep going.',
    ],
    takeaways: [
      'That deliberate caution is {term}.',
      "And that is {term} — the reason we can move fast without breaking things, or people.",
    ],
  },
  {
    name: 'reinforcement',
    test: /reinforcement|reward|policy gradient|q-learning|bandit|markov decision|monte carlo tree|actor.?critic/i,
    scenes: [
      'Picture training a puppy: no long lectures, just treats for the right move and patience for the wrong one.',
      'Imagine a video game where the only feedback is the score ticking up or down — and you learn by playing a million rounds.',
      'Picture a gambler who slowly learns which slot machines pay out, not by reading a manual but by pulling the lever.',
    ],
    analogies: [
      'It is trial and error with a memory: actions that pay off get repeated, actions that hurt get dropped.',
      'Reward, not instructions, is the teacher.',
      'The learner writes its own textbook from consequences.',
    ],
    takeaways: [
      'That learn-by-reward loop is {term}.',
      'And that is {term} — skill forged from consequences.',
    ],
  },
  {
    name: 'agents',
    test: /agent|autonomous|tool.?use|function.?calling|orchestrat|workflow|react|multi.?step|planning and acting/i,
    scenes: [
      'Picture hiring a brilliant new assistant on their first morning — smart, motivated, but with no idea how anything in your office actually works.',
      'Imagine handing a to-do list to a very clever intern who refuses to guess: before each step, they look around, check the result, and adjust.',
      'Think of a chess player who never commits to a move blindly — they consider the board, try an action, watch what changes, and only then decide what is next.',
    ],
    analogies: [
      "It is a loop of look, act, and learn — the same way you cook from a recipe you have never tried: add, taste, correct.",
      'The model stops being a one-shot answer machine and becomes a coworker that checks its own work.',
    ],
    takeaways: [
      'That loop of reason, act, and observe is {term}.',
      'And that habit of checking, acting, then checking again is {term}.',
    ],
  },
  {
    name: 'reasoning',
    test: /reasoning|chain.?of.?thought|tree.?of.?thoughts|self.?consistency|rationale|reflection|test.?time compute|inference.?time compute|think before speaking|iterative reasoning/i,
    scenes: [
      'Picture solving a puzzle by talking yourself through it out loud — wrong turns, second guesses, and all — until the answer clicks.',
      'Imagine a mathematician who writes every step on paper, reads it back, crosses out a bad line, and starts that line over.',
      'Think of a chess player muttering through variations in their head before they touch a single piece.',
    ],
    analogies: [
      'It is thinking made visible — the model shows its work, then reads its own work and improves it.',
      'More time spent reconsidering can be worth more than a bigger model.',
      'The first answer is a draft; the last answer is the edited version.',
    ],
    takeaways: [
      'That loop of draft, check, and revise is {term}.',
      'And that habit of thinking twice — or a hundred times — is {term}.',
    ],
  },
  {
    name: 'vision',
    test: /vision|image|pixel|object detection|segmentation|cnn|convolution|face recognition|scene graph|optical/i,
    scenes: [
      'Picture a child pointing at pictures in a book — cat, car, cloud — learning to see by seeing a thousand examples.',
      'Imagine an art restorer who can spot a single cracked tile in a vast mosaic.',
      'Picture walking through a crowd and instantly picking out a familiar face without reading a single name tag.',
    ],
    analogies: [
      'It is eyes made of arithmetic — pixels become edges, edges become shapes, shapes become meaning.',
      'The model looks the way you look at a crowd and finds the one face you know.',
      'Sight, for a machine, is a long climb from raw light to a name.',
    ],
    takeaways: [
      'That pixel-to-meaning climb is {term}.',
      'And that is {term} — giving a machine the gift of sight.',
    ],
  },
  {
    name: 'language',
    test: /language|nlp|translation|sentiment|speech|parsing|linguistic|tokeniz|part-of-speech|syntax|semantic/i,
    scenes: [
      'Picture a translator at the United Nations, listening to one language and whispering the meaning into another in real time.',
      'Imagine learning a language by reading every book in the library and noticing, over time, which words travel together.',
      'Think of a grammar teacher who never memorized a rule but can still tell you when a sentence sounds wrong.',
    ],
    analogies: [
      'Meaning lives in company — a word is known by the words it keeps.',
      'It is fluency built from pattern, not from memorized rules.',
      'The machine learns to read between the lines by reading an impossible number of lines.',
    ],
    takeaways: [
      'That pattern-earned fluency is {term}.',
      'And that is {term} — teaching a machine to read between the lines.',
    ],
  },
  {
    name: 'generation',
    test: /generat|diffusion|gan|prompt|text-to-image|image synthesis|decoder|sampling|autoregressive|completion/i,
    scenes: [
      'Picture a novelist who has read so much that, given a first line, they cannot help but write the next one.',
      'Imagine a sketch artist who starts with static and, stroke by stroke, sharpens it into a face.',
      'Think of a jazz musician who has heard so many solos that a new one simply falls out of their fingers.',
    ],
    analogies: [
      'It is prediction pushed forward — each next word, or pixel, guessed from everything that came before it.',
      'The model dreams a little, then cleans up the dream.',
      'Creation, here, is memory recombined at speed.',
    ],
    takeaways: [
      'That next-word, next-stroke magic is {term}.',
      'And that is {term} — making something new out of everything it has ever seen.',
    ],
  },
  {
    name: 'training',
    test: /train|optimiz|gradient|loss|backprop|fine.?tun|learning rate|epoch|regulariz|dropout|adam|sgd|weight decay|overfit|underfit|early stopping|converge/i,
    scenes: [
      'Imagine teaching a friend to shoot a basketball. They miss, and you walk them backwards through the shot — elbow, wrist, release — to find what needs fixing.',
      'Picture a potter shaping clay on a spinning wheel: every nudge is tiny, but each one is guided by how the last attempt wobbled.',
      'Think of a hiker descending a foggy hill in the dark, taking small steps and feeling for the steepest way down.',
    ],
    analogies: [
      'It is learning from every miss instead of repeating the same mistake.',
      'Each pass is a tiny course-correction — the model gets a little less wrong every time.',
      'Skill, for a model, is just error pushed down until it is small enough to ignore.',
    ],
    takeaways: [
      'That steady, miss-by-miss improvement is {term}.',
      'And that is {term} — the quiet loop that turns flailing into skill.',
    ],
  },
  {
    name: 'evaluation',
    test: /eval|benchmark|metric|accuracy|perplex|bleu|hallucinat|score|f1|recall|precision|elo|leaderboard|human.?eval/i,
    scenes: [
      'Imagine a driving test that every new model has to pass before it is allowed on the road.',
      'Picture a scoreboard at a science fair: you need a fair, agreed way to tell who actually won.',
      'Think of a referee whose job is to be completely honest about who touched the ball last.',
    ],
    analogies: [
      'It is the exam that keeps everyone honest.',
      'A good metric is a ruler that does not bend when you lean on it.',
      'What gets measured is what actually gets better.',
    ],
    takeaways: [
      'That shared ruler is {term}.',
      'And that, done honestly, is {term}.',
    ],
  },
  {
    name: 'data',
    test: /data|dataset|corpus|embedding|retrieval|rag|knowledge graph|vector|token|annotation|label|common crawl|corpora/i,
    scenes: [
      'Picture a librarian organizing a million slips of paper so that any one of them can be found in a heartbeat.',
      'Imagine a chef tasting every ingredient before it goes into the pot, deciding what belongs and what would ruin the broth.',
      'Think of a historian sorting through boxes of letters, building a picture of an era one sentence at a time.',
    ],
    analogies: [
      'Garbage in, garbage out — and the reverse: clean, representative data makes the model quietly brilliant.',
      'It is the raw material; the model is only ever as good as what it was fed.',
      'The words a model reads become the world it believes in.',
    ],
    takeaways: [
      'That care with the raw material is {term}.',
      'And that is {term} — the unglamorous work everything else stands on.',
    ],
  },
  {
    name: 'architecture',
    test: /architecture|transformer|attention|neural|network|layer|neuron|activ|llm|gpt|bert|parameter|decoder|encoder|embedding model|perceptron/i,
    scenes: [
      'Picture an architect laying out a building where every room has to know which other rooms matter to it.',
      'Imagine a factory floor where each workstation can glance at every other workstation before doing its part.',
      'Think of an orchestra warming up: no single instrument carries the piece, but together they make the sound.',
    ],
    analogies: [
      'It is the difference between a row of isolated cubicles and one big room where everyone can hear each other.',
      'Structure decides what the model can even express — the blueprint before the bricks.',
      'The shape of the machine is half the idea.',
    ],
    takeaways: [
      'That blueprint is {term}.',
      'And that shape of the machine — {term} — is what makes everything else possible.',
    ],
  },
  {
    name: 'general',
    test: null,
    scenes: [
      'Picture an engineer at a cluttered workbench, turning a clever idea over in their hands until it finally clicks.',
      'Imagine explaining a hard concept to a friend using nothing but a napkin and a pen.',
      'Think of a lightbulb moment: the idea was always there, but someone had to point a finger at it.',
    ],
    analogies: [
      'It is one of those ideas that feels obvious only after someone shows it to you.',
      'A small mental model that makes a big tangle suddenly simple.',
      'Once you see it, you cannot unsee it.',
    ],
    takeaways: [
      'And that idea, made concrete, is {term}.',
      'That is {term} — a small key that opens a big door.',
    ],
  },
];

const bucketFor = (record) => {
  const strong = [record.category, record.term, ...(record.aka || [])]
    .filter(Boolean)
    .join(' ');
  const definition = record.definition || '';
  for (const name of ORDER) {
    const b = BY_NAME[name];
    if (b.test && b.test.test(strong)) return b;
  }
  for (const name of ORDER) {
    const b = BY_NAME[name];
    if (b.test && b.test.test(definition)) return b;
  }
  return BY_NAME.general;
};

// Specific buckets first; generic keywords ("data", "token", "model") last.
const ORDER = [
  'safety',
  'reinforcement',
  'agents',
  'reasoning',
  'vision',
  'generation',
  'language',
  'training',
  'evaluation',
  'architecture',
  'data',
  'general',
];
const BY_NAME = Object.fromEntries(BUCKETS.map((b) => [b.name, b]));

const composeStory = (record, bucket) => {
  const seed = hash(record.slug || record.term);
  const term = record.term.trim();

  const scene = pick(bucket.scenes, seed);
  const explains = EXPLANATIONS[bucket.name] || EXPLANATIONS.general;
  const explain1 = pick(explains, seed + 1);
  const explain2 = pick(explains, seed + 2);
  const analogy = pick(bucket.analogies, seed + 3);
  const takeaway = pick(bucket.takeaways, seed + 4).replaceAll('{term}', term);

  const parts = [scene, explain1];
  if (explain2 && explain2 !== explain1) parts.push(explain2);
  parts.push(analogy, takeaway);
  return parts.join(' ');
};

// ------------------------------------------------------------------- run --
// Related-term scoring: same category, one name contained in the other, or
// shared words in the term/alias names all signal "read this next".
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'is',
  'are', 'as', 'at', 'by', 'from', 'that', 'this', 'it', 'its', 'their', 'our',
  'your', 'using', 'used', 'via', 'into', 'than', 'then', 'which', 'when',
  'where', 'what', 'how', 'not', 'no', 'be', 'been', 'being', 'was', 'were',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'has', 'have',
  'had', 'do', 'does', 'did',
]);

const nameTokens = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

function computeRelated(records) {
  const metas = records.map((r) => ({
    slug: r.slug,
    lower: String(r.term).toLowerCase(),
    category: String(r.category || '').toLowerCase(),
    toks: new Set(nameTokens(`${r.term} ${(r.aka || []).join(' ')}`)),
  }));

  const out = new Map();
  records.forEach((r, i) => {
    const a = metas[i];
    const scored = [];
    for (let j = 0; j < records.length; j++) {
      if (i === j) continue;
      const b = metas[j];
      let score = 0;
      if (a.category && a.category === b.category) score += 4;
      if (a.lower !== b.lower && (a.lower.includes(b.lower) || b.lower.includes(a.lower))) {
        score += 6;
      }
      let shared = 0;
      for (const t of a.toks) if (b.toks.has(t)) shared++;
      score += shared * 2;
      if (score > 0) scored.push({ slug: b.slug, score });
    }
    scored.sort((x, y) => y.score - x.score || x.slug.localeCompare(y.slug));
    out.set(a.slug, scored.slice(0, 4).map((s) => s.slug));
  });
  return out;
}

const report = { stories: 0, related: 0, malformed: 0 };

// Load everything first so related-term links can see the whole collection.
const entries = [];
for (const folder of readdirSync(DICT)) {
  if (!/^[a-z]-[a-z]$/.test(folder)) continue;
  const dir = join(DICT, folder);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const path = join(dir, file);
    let record;
    try {
      record = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      report.malformed++;
      console.warn(`! skipping unparseable file: ${path}`);
      continue;
    }
    if (!record.term || !record.definition) {
      report.malformed++;
      console.warn(`! skipping record without term/definition: ${path}`);
      continue;
    }
    record.slug = record.slug || file.replace(/\.json$/, '');
    entries.push({ path, record });
  }
}

const relatedBySlug = computeRelated(entries.map((e) => e.record));

for (const { path, record } of entries) {
  const hadStory = !!(record.story && String(record.story).trim());
  const hadRelated = !!(Array.isArray(record.related) && record.related.length);

  const story =
    PRESERVE.has(record.slug) && hadStory
      ? record.story
      : !FORCE && hadStory
        ? record.story
        : composeStory(record, bucketFor(record));
  const related = !FORCE && hadRelated ? record.related : relatedBySlug.get(record.slug) || [];

  // Insert `story` and `related` right after `details` so the JSON stays tidy;
  // drop any old copies first — never copy them back over the fresh values.
  const ordered = {};
  for (const key of Object.keys(record)) {
    if (key === 'story' || key === 'related') continue;
    ordered[key] = record[key];
    if (key === 'details') {
      ordered.story = story;
      ordered.related = related;
    }
  }
  if (!('story' in ordered)) ordered.story = story;
  if (!('related' in ordered)) ordered.related = related;

  writeFileSync(path, JSON.stringify(ordered, null, 2) + '\n');
  if (!hadStory || FORCE) report.stories++;
  if (!hadRelated || FORCE) report.related++;
}

console.log('\n=== story report ===');
console.log(`stories written: ${report.stories}`);
console.log(`related lists written: ${report.related}`);
console.log(`malformed/skipped records: ${report.malformed}`);
