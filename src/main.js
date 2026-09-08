import './styles.css';
import { volumes, findTerm, volumeByLetter, summary } from './terms.js';
import { Bookshelf } from './bookshelf.js';
import { UI } from './ui.js';

const container = document.getElementById('scene-container');
const state = { folder: null };

const bookshelf = new Bookshelf(container, volumes, {
  onSelectVolume: (folder) => handlePickVolume(folder, { fromScene: true }),
});

const ui = new UI({
  onPickVolume: (folder, letter) => handlePickVolume(folder, { letter }),
  onPickTerm: (slug) => {
    const term = findTerm(slug);
    if (!term) return;
    const vol = volumeByLetter(term.letter);
    if (!vol) return;
    focusVolume(vol.folder, term.letter, { openPanel: false });
  },
  onVolumeClose: () => {
    state.folder = null;
    bookshelf.clearSelection();
  },
});

function focusVolume(folder, letter, { openPanel = true } = {}) {
  const wasSame = state.folder === folder;
  state.folder = folder;
  bookshelf.select(folder);
  ui.setActiveVolume(folder, letter);
  if (openPanel && !ui.isVolumeOpen()) {
    ui.openVolume(folder);
  } else if (openPanel && wasSame) {
    // already open — just ensure it’s fresh
    ui.openVolume(folder);
  }
}

function handlePickVolume(folder, { fromScene = false, letter } = {}) {
  // Clicking the already-open volume’s book (or its ✕ target) closes it.
  if (state.folder === folder && ui.isVolumeOpen() && fromScene) {
    state.folder = null;
    bookshelf.clearSelection();
    ui.closeVolume();
    return;
  }
  focusVolume(folder, letter);
}

window.addEventListener('resize', () => {});

// Report how many terms were found (helpful when authoring content).
console.info(`📚 ${summary()} — ${volumes.length} volumes rendered.`);

// Dev/debug handle (safe to keep; exposes scene for inspection).
window.__llmDict = {
  bookshelf,
  scene: bookshelf.scene,
  camera: bookshelf._camera,
};
