// Small shared colour palette used by both the 3D books and the UI chrome.
// Kept in one place so letter/accent colours stay consistent everywhere.

const LETTER_COLORS = {
  A: '#ff7a6b',
  B: '#ff9f5a',
  C: '#f5c65a',
  D: '#d7e05a',
  E: '#8fd460',
  F: '#63d3a0',
  G: '#52c8b0',
  H: '#5ec8d8',
  I: '#6ea8fe',
  J: '#7a8cff',
  K: '#9f7cff',
  L: '#c97cff',
  M: '#ef6fc2',
  N: '#ff6f96',
  O: '#ff7a6b',
  P: '#ff9f5a',
  Q: '#f5c65a',
  R: '#d7e05a',
  S: '#8fd460',
  T: '#63d3a0',
  U: '#52c8b0',
  V: '#5ec8d8',
  W: '#6ea8fe',
  X: '#7a8cff',
  Y: '#9f7cff',
  Z: '#c97cff',
};

/** Accent colour for a given starting letter. */
export function letterColor(letter = 'A') {
  return LETTER_COLORS[String(letter).toUpperCase()] || LETTER_COLORS.A;
}

/** Per-category colour tags used for word chips. */
export const CATEGORY_COLORS = {
  Architecture: '#6ea8fe',
  'Generative Models': '#ef6fc2',
  'LLM Concepts': '#f5c65a',
  'Learning Paradigms': '#63d3a0',
  'In-Context Learning': '#5ec8d8',
  Representations: '#8fd460',
  Foundations: '#ff9f5a',
  Training: '#7a8cff',
  Optimization: '#ff7a6b',
  Evaluation: '#52c8b0',
  Prompting: '#c97cff',
  Alignment: '#ff6f96',
  Safety: '#ff6f96',
  Vision: '#7a8cff',
  'Classical ML': '#d7e05a',
  Tokenization: '#ff9f5a',
  'Compression': '#9f7cff',
  Inference: '#5ec8d8',
  Agents: '#ff9f5a',
  'Fine-tuning': '#ef6fc2',
  'Fine-Tuning': '#ef6fc2',
  'LLM Fundamentals': '#f5c65a',
  'Systems / Infrastructure': '#7a8cff',
  'Architecture / Systems': '#6ea8fe',
  'AI Safety': '#ff6f96',
  'AI Safety / Ethics': '#ff6f96',
  'AI Safety / Governance': '#ff6f96',
  'Agentic Systems': '#ff9f5a',
  'Model Behavior': '#ef6fc2',
  Data: '#d7e05a',
  'AI Engineering': '#5ec8d8',
  'NLP Tasks': '#8fd460',
  'ML Paradigms': '#63d3a0',
  Theory: '#9f7cff',
  Interpretability: '#52c8b0',
  'Model Optimization': '#ff7a6b',
  Multimodal: '#c97cff',
  Regularization: '#ff7a6b',
  General: '#a89bb8',
};

export function categoryColor(category = 'General') {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.General;
}
