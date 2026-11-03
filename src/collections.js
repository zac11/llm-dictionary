// Learning paths bundled from collections/*.json (see collection-schema.js).
import { collectionsForSlug, normalizeCollection, sortCollections } from './collection-schema.js';

const modules = import.meta.glob('../collections/*.json', { eager: true, import: 'default' });

export const collections = sortCollections(
  Object.entries(modules)
    .map(([path, raw]) => normalizeCollection(raw, path.replace(/^.*\//, '').replace(/\.json$/, '')))
    .filter(Boolean)
);

export function findCollection(id) {
  return collections.find((collection) => collection.id === id) || null;
}

export function collectionsForTerm(slug) {
  return collectionsForSlug(collections, slug);
}
