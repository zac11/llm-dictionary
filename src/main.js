import './styles.css';
import { volumes, findTerm, volumeByLetter, summary } from './terms.js';
import { Library } from './library.js';
import { UI } from './ui.js';

const container = document.getElementById('scene-container');
const state = { folder: null, busy: false, view: 'library', map: null };

const library = new Library(container, volumes, {
  onSelectVolume: (folder) => openVolumeRitual(folder),
});

const ui = new UI({
  onPickVolume: (folder, letter) => openVolumeRitual(folder, { letter }),
  onPickTerm: async (slug) => {
    if (state.view === 'map') await closeMap({ updateHistory: false });
    openTermRitual(slug);
  },
  onVolumeClose: () => {
    state.folder = null;
    library.returnBook();
  },
});

const viewToggle = document.getElementById('view-toggle');
const graphView = document.getElementById('graph-view');

function setMapChrome(active) {
  document.body.classList.toggle('map-mode', active);
  viewToggle.setAttribute('aria-pressed', String(active));
  viewToggle.title = active ? 'Return to 3D library' : 'Open knowledge map';
  viewToggle.querySelector('span').textContent = active ? 'Library' : 'Map';
}

async function openMap(slug = null, { updateHistory = true } = {}) {
  if (state.busy) return;
  if (state.view === 'map' && state.map) {
    if (slug) state.map.select(slug, { center: true, notify: false });
    return;
  }
  state.busy = true;
  viewToggle.disabled = true;
  try {
    if (ui.isSpreadOpen()) ui.closeSpread({ silent: true });
    if (state.folder) await library.returnBook();
    state.folder = null;
    state.view = 'map';
    library.pause();
    setMapChrome(true);
    graphView.classList.add('open');
    graphView.setAttribute('aria-hidden', 'false');
    if (!state.map) {
      const { GraphMap } = await import('./map.js');
      state.map = new GraphMap(graphView, {
        onSelection: (selectedSlug) => {
          history.replaceState({}, '', `/?map=${encodeURIComponent(selectedSlug)}`);
        },
        onOpenTerm: async (selectedSlug) => {
          await closeMap({ updateHistory: false });
          history.pushState({}, '', `/term/${encodeURIComponent(selectedSlug)}/`);
          openTermRitual(selectedSlug);
        },
      });
    }
    if (!state.map.nodes) await state.map.load();
    state.map.show(slug);
    if (updateHistory) {
      history.pushState({}, '', slug ? `/?map=${encodeURIComponent(slug)}` : '/?view=map');
    }
  } catch (error) {
    document.getElementById('graph-status').textContent = `Map unavailable: ${error.message}`;
  } finally {
    state.busy = false;
    viewToggle.disabled = false;
  }
}

async function closeMap({ updateHistory = true } = {}) {
  if (state.view !== 'map') return;
  state.map?.hide();
  graphView.classList.remove('open');
  graphView.setAttribute('aria-hidden', 'true');
  state.view = 'library';
  setMapChrome(false);
  library.resume();
  if (updateHistory) history.pushState({}, '', '/');
}

viewToggle.addEventListener('click', () => {
  if (state.view === 'map') closeMap();
  else openMap();
});

/** Click a shelf book / letter: pull the volume out and open its contents spread. */
async function openVolumeRitual(folder, { letter } = {}) {
  if (state.busy) return;
  // clicking the volume that's already open puts it back on the shelf
  if (state.folder === folder && ui.isSpreadOpen()) {
    ui.closeSpread();
    return;
  }
  state.busy = true;
  try {
    if (state.folder) {
      ui.closeSpread({ silent: true });
      await library.returnBook();
    }
    state.folder = folder;
    ui.setActiveVolume(folder, letter);
    await library.pullOutBook(folder);
    if (state.folder !== folder) return; // interrupted meanwhile
    ui.openSpreadIndex(folder);
  } finally {
    state.busy = false;
  }
}

/** Search pick: pull the right volume and land straight on the term's page. */
async function openTermRitual(slug) {
  const term = findTerm(slug);
  if (!term || state.busy) return;
  const vol = volumeByLetter(term.letter);
  if (!vol) return;
  state.busy = true;
  try {
    if (state.folder !== vol.folder) {
      if (state.folder) {
        ui.closeSpread({ silent: true });
        await library.returnBook();
      }
      state.folder = vol.folder;
      ui.setActiveVolume(vol.folder, term.letter);
      await library.pullOutBook(vol.folder);
      if (state.folder !== vol.folder) return;
    }
    ui.openEntry(slug, { from: 'ritual' });
  } finally {
    state.busy = false;
  }
}

// Report how many terms were found (helpful when authoring content).
console.info(`📚 ${summary()} — ${volumes.length} volumes on the shelf.`);

// Deep links: /term/attention (the share-link form, also prerendered for
// crawlers) and ?term=attention open straight to an entry; ?volume=a-b opens a
// contents spread.
async function applyLocation() {
  const params = new URLSearchParams(location.search);
  const pathTerm = location.pathname.match(/\/term\/([^/]+)\/?$/i);
  const mapTerm = params.get('map');
  if (mapTerm || params.get('view') === 'map') {
    await openMap(mapTerm, { updateHistory: false });
    return;
  }
  if (state.view === 'map') await closeMap({ updateHistory: false });
  const term = params.get('term') || (pathTerm ? decodeURIComponent(pathTerm[1]) : null);
  const vol = params.get('volume');
  if (term) openTermRitual(term);
  else if (vol) openVolumeRitual(vol);
}

window.addEventListener('popstate', () => applyLocation());
applyLocation();

// Dev/debug handle (safe to keep; exposes scene for inspection).
window.__neuropaedia = {
  library,
  scene: library.scene,
  camera: library._camera,
};
