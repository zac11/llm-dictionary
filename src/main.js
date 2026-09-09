import './styles.css';
import { volumes, findTerm, volumeByLetter, summary } from './terms.js';
import { Library } from './library.js';
import { UI } from './ui.js';

const container = document.getElementById('scene-container');
const state = { folder: null, busy: false };

const library = new Library(container, volumes, {
  onSelectVolume: (folder) => openVolumeRitual(folder),
});

const ui = new UI({
  onPickVolume: (folder, letter) => openVolumeRitual(folder, { letter }),
  onPickTerm: (slug) => openTermRitual(slug),
  onVolumeClose: () => {
    state.folder = null;
    library.returnBook();
  },
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

// Deep links: ?term=attention opens straight to an entry, ?volume=a-b to a contents spread.
{
  const params = new URLSearchParams(location.search);
  const term = params.get('term');
  const vol = params.get('volume');
  if (term) openTermRitual(term);
  else if (vol) openVolumeRitual(vol);
}

// Dev/debug handle (safe to keep; exposes scene for inspection).
window.__lexicon = {
  library,
  scene: library.scene,
  camera: library._camera,
};
