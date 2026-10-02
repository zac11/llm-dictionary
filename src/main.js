import './styles.css';
import { volumes, findTerm, volumeByLetter, rangeTerms, summary, allTerms } from './terms.js';
import { Library } from './library.js';
import { UI } from './ui.js';
import { VolumeCard, volumeCardData } from './volume-card.js';
import { ArchiveNav, exploreActions } from './archive-nav.js';
import { parseAppLocation } from './navigation.js';
import { ArchiveHome } from './archive-home.js';
import { discoveryTarget } from './archive-discovery.js';
import { canCreateWebGL, createLibraryFacade, renderMode } from './render-capability.js';
import { MotionPreference } from './motion-preference.js';

const container = document.getElementById('scene-container');
const state = { folder: null, busy: false, view: 'library', map: null };
const volumeCard = new VolumeCard(document.getElementById('volume-card'));
const volumesByFolder = new Map(volumes.map((volume) => [volume.folder, volume]));
const motionPreference = new MotionPreference(window.matchMedia('(prefers-reduced-motion: reduce)'));
let ui;
const archiveNav = new ArchiveNav({
  toggle: document.getElementById('explore-toggle'),
  menu: document.getElementById('explore-menu'),
  actions: exploreActions({
    openMap: () => (state.view === 'map' ? closeMap() : openMap()),
    openRandomTerm: () => openRandomTerm(),
    showRecentlyAdded: () => archiveHome.showRecentlyAdded(),
    focusVolumeRail: () => focusVolumeRail(),
    openContribute: () => openContribute(),
    openFeedback: () => openFeedback(),
    openHelp: () => ui.openHelp(),
  }),
});

// Probe WebGL once, then either construct the live library or fall back to a
// static shelf poster. The `library` facade keeps every downstream call safe.
let realLibrary = null;
let constructionFailed = false;
const webglAvailable = canCreateWebGL({
  document,
  WebGLRenderingContext: window.WebGLRenderingContext,
});
if (webglAvailable) {
  try {
    realLibrary = new Library(container, volumes, {
      onSelectVolume: (folder) => openVolumeRitual(folder),
      onHoverVolume: (hover) => {
        if (!hover?.point?.visible) return volumeCard.hide();
        const volume = volumesByFolder.get(hover.folder);
        if (!volume) return volumeCard.hide();
        volumeCard.show(volumeCardData(volume, rangeTerms(volume.folder)), hover.point);
      },
    });
  } catch (error) {
    console.warn('Library construction failed — using static fallback:', error);
    constructionFailed = true;
  }
}
const library = createLibraryFacade(realLibrary);
if (renderMode({ webglAvailable, constructionFailed }) === 'fallback') {
  document.body.classList.add('library-fallback');
  container?.classList.add('library-fallback');
}

// On the mobile immersive header, constrain volume hover/selection to the
// header canvas so the discovery sheet below scrolls without interacting.
const applyInteractiveRegion = () => {
  if (window.innerWidth < 860 && container && realLibrary) {
    const rect = container.getBoundingClientRect();
    realLibrary.setInteractiveRegion({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  } else {
    realLibrary?.setInteractiveRegion(null);
  }
};
window.addEventListener('resize', applyInteractiveRegion);
applyInteractiveRegion();

ui = new UI({
  onPickVolume: (folder, letter) => openVolumeRitual(folder, { letter }),
  onPickTerm: async (slug) => {
    if (state.view === 'map') await closeMap({ updateHistory: false });
    openTermRitual(slug);
  },
  onVolumeClose: () => {
    state.folder = null;
    library.returnBook();
  },
  onAskTerm: (slug) => openAskForTerm(slug),
  onMapTerm: (slug) => openMapForTerm(slug),
});

const archiveHome = new ArchiveHome(document.getElementById('archive-home'), {
  terms: allTerms,
  onSearch: () => document.getElementById('search')?.focus(),
  onRandomTerm: () => openRandomTerm(),
  onOpenMap: () => openMap(),
  onOpenTerm: (slug) => openTermRitual(slug),
  reducedMotion: motionPreference.reduced,
});

// One observer fans live reduced-motion changes out to every consumer.
motionPreference.subscribe((reduced) => {
  realLibrary?.setReducedMotion(reduced);
  ui?.setReducedMotion(reduced);
  archiveHome.setReducedMotion(reduced);
});

// Any direct use of search is a meaningful first interaction.
document.getElementById('search')?.addEventListener('input', () => archiveHome.collapseWelcome());

/** Random Term from the welcome panel / Explore menu. */
function openRandomTerm() {
  const term = discoveryTarget({ busy: state.busy, terms: allTerms });
  if (term) openTermRitual(term.slug);
}

/** Move keyboard focus to the A–B volume rail. */
function focusVolumeRail() {
  document.querySelector('#letter-nav button:not(:disabled)')?.focus();
}

const viewToggle = document.getElementById('view-toggle');
const graphView = document.getElementById('graph-view');
const graphSearch = document.getElementById('graph-search');

const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function setMapChrome(active) {
  document.body.classList.toggle('map-mode', active);
  viewToggle.setAttribute('aria-pressed', String(active));
  viewToggle.title = active ? 'Return to 3D library' : 'Open knowledge map';
  viewToggle.textContent = active ? 'Return to Library' : 'Knowledge Map';
}

async function openMap(slug = null, { updateHistory = true } = {}) {
  if (state.busy) return;
  archiveHome.collapseWelcome();
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
    const selected = state.map.show(slug);
    if (slug && !selected) {
      state.map.status.textContent = `"${slug}" wasn't found — explore the map or search instead.`;
    }
    if (updateHistory) {
      const target = slug && selected ? `/?map=${encodeURIComponent(slug)}` : '/?view=map';
      history.pushState({}, '', target);
    }
    graphSearch?.focus();
  } catch (error) {
    await closeMap({ updateHistory: false });
    showToast('Knowledge map is unavailable right now — try again.');
    archiveNav.toggle.focus();
    console.warn('Map open failed:', error);
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

// Escape inside the map first clears the selection, then returns to the library.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || state.view !== 'map' || !state.map) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== graphSearch) return;
  if (state.map.selected) state.map.deselect();
  else {
    closeMap();
    archiveNav.toggle.focus();
  }
});

// ---------- Ask ----------
const askView = document.getElementById('ask-view');
const askToggle = document.getElementById('ask-toggle');
let askChat = null;

async function openAsk({ query } = {}) {
  archiveHome.collapseWelcome();
  if (!askChat) {
    const { AskChat } = await import('./ask.js');
    askChat = new AskChat(askView, {
      onOpenTerm: async (slug) => {
        closeAsk();
        if (state.view === 'map') await closeMap({ updateHistory: false });
        openTermRitual(slug);
      },
    });
  }
  askView.classList.add('open');
  askView.setAttribute('aria-hidden', 'false');
  askToggle.setAttribute('aria-pressed', 'true');
  askChat.open({ query });
}

/** Ask about a term straight from its entry page. */
async function openAskForTerm(slug) {
  const term = findTerm(slug);
  if (!term) return;
  if (state.view === 'map') await closeMap({ updateHistory: false });
  openAsk({ query: term.term });
}

/** Close the reader safely, then open the Map focused on a term. */
async function openMapForTerm(slug) {
  if (!findTerm(slug)) return;
  if (askView.classList.contains('open')) closeAsk();
  await openMap(slug);
}

function closeAsk() {
  askView.classList.remove('open');
  askView.setAttribute('aria-hidden', 'true');
  askChat?.close();
  askToggle.setAttribute('aria-pressed', 'false');
  askToggle.focus();
}

askToggle.addEventListener('click', () => {
  if (askView.classList.contains('open')) closeAsk();
  else openAsk();
});
document.getElementById('ask-close')?.addEventListener('click', closeAsk);
document.getElementById('ask-backdrop')?.addEventListener('click', closeAsk);

const feedbackModal = document.getElementById('feedback-modal');
const feedbackToggle = document.getElementById('feedback-toggle');
const feedbackClose = document.getElementById('feedback-close');

function openFeedback() {
  if (askView.classList.contains('open')) closeAsk();
  feedbackModal.classList.add('open');
  feedbackModal.setAttribute('aria-hidden', 'false');
  feedbackToggle.setAttribute('aria-expanded', 'true');
  document.getElementById('feedback-message')?.focus();
}

function closeFeedback() {
  feedbackModal.classList.remove('open');
  feedbackModal.setAttribute('aria-hidden', 'true');
  feedbackToggle.setAttribute('aria-expanded', 'false');
  archiveNav.toggle.focus();
}

feedbackClose.addEventListener('click', closeFeedback);
document.getElementById('feedback-backdrop')?.addEventListener('click', closeFeedback);

// ---------- Contribute ----------
const contributeModal = document.getElementById('contribute-modal');
const contributeToggle = document.getElementById('contribute-toggle');
let contributeForm = null;

async function openContribute() {
  if (askView.classList.contains('open')) closeAsk();
  if (!contributeForm) {
    const { ContributeForm } = await import('./contribute.js');
    contributeForm = new ContributeForm(contributeModal);
  }
  contributeModal.classList.add('open');
  contributeModal.setAttribute('aria-hidden', 'false');
  contributeToggle.setAttribute('aria-expanded', 'true');
  contributeForm.open();
}

function closeContribute() {
  contributeModal.classList.remove('open');
  contributeModal.setAttribute('aria-hidden', 'true');
  contributeForm?.close();
  contributeToggle.setAttribute('aria-expanded', 'false');
  archiveNav.toggle.focus();
}

document.getElementById('contribute-close')?.addEventListener('click', closeContribute);
document.getElementById('contribute-backdrop')?.addEventListener('click', closeContribute);

// Capture-phase Escape: the Ask overlay takes priority over book/map/help Escape.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape') return;
    if (feedbackModal.classList.contains('open')) {
      event.stopPropagation();
      closeFeedback();
    } else if (contributeModal.classList.contains('open')) {
      event.stopPropagation();
      closeContribute();
    } else if (askView.classList.contains('open')) {
      event.stopPropagation();
      closeAsk();
    }
  },
  true
);

/** Click a shelf book / letter: pull the volume out and open its contents spread. */
async function openVolumeRitual(folder, { letter } = {}) {
  if (state.busy) return;
  archiveHome.collapseWelcome();
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
  archiveHome.collapseWelcome();
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
    archiveHome.recordTerm(slug);
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
  const { view, slug, folder } = parseAppLocation({
    pathname: location.pathname,
    search: location.search,
  });
  if (view === 'map') {
    await openMap(slug, { updateHistory: false });
    return;
  }
  if (state.view === 'map') await closeMap({ updateHistory: false });
  if (view === 'term') openTermRitual(slug);
  else if (view === 'volume') openVolumeRitual(folder);
}

window.addEventListener('popstate', () => applyLocation());
applyLocation();

// Dev/debug handle (safe to keep; exposes scene for inspection).
window.__theaidictionary = {
  library,
  scene: realLibrary?.scene,
  camera: realLibrary?._camera,
  get map() { return state.map; },
};
