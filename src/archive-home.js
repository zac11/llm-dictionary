// Archive home controller: the editorial welcome panel, About tab, and the
// discovery surface that sits on top of the library scene. Owns DOM and state;
// all selection/persistence rules live in archive-discovery.js.

import {
  createRecentHistory,
  readWelcomeState,
  recentlyAdded,
  termOfDay,
  writeWelcomeState,
} from './archive-discovery.js';
import { CarouselState } from './discovery-carousel.js';

function safeStorage() {
  try {
    const storage = window.localStorage;
    const probe = '__theaidictionary_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ArchiveHome {
  constructor(
    root,
    { terms = [], onSearch, onRandomTerm, onOpenMap, onOpenTerm, reducedMotion = false } = {}
  ) {
    this.root = root;
    this.terms = terms;
    this.onSearch = onSearch;
    this.onRandomTerm = onRandomTerm;
    this.onOpenMap = onOpenMap;
    this.onOpenTerm = onOpenTerm;
    this.reducedMotion = reducedMotion;
    this.storage = safeStorage();
    this.history = createRecentHistory({ storage: this.storage });

    this.welcome = root.querySelector('.archive-welcome');
    this.aboutTab = root.querySelector('.archive-about-tab');
    this.countEl = root.querySelector('#archive-term-count');
    this.searchBtn = root.querySelector('.archive-search');
    this.randomBtn = root.querySelector('.archive-random');
    this.mapBtn = root.querySelector('.archive-map');

    this._renderCount();
    this._bind();
    this._buildCarousel();

    if (readWelcomeState(this.storage).collapsed) this.collapseWelcome({ persist: false });
    else this.openWelcome();
  }

  _renderCount() {
    if (!this.countEl) return;
    const count = this.terms.length.toLocaleString('en-US');
    this.countEl.textContent = `${count} cited terms on the shelf`;
  }

  _bind() {
    this._onSearchClick = () => {
      this.collapseWelcome();
      this.onSearch?.();
    };
    this._onRandomClick = () => {
      this.collapseWelcome();
      this.onRandomTerm?.();
    };
    this._onMapClick = () => {
      this.collapseWelcome();
      this.onOpenMap?.();
    };
    this._onAboutClick = () => this.openWelcome();

    this.searchBtn?.addEventListener('click', this._onSearchClick);
    this.randomBtn?.addEventListener('click', this._onRandomClick);
    this.mapBtn?.addEventListener('click', this._onMapClick);
    this.aboutTab?.addEventListener('click', this._onAboutClick);
  }

  /** Reveal the editorial panel without changing the persisted default. */
  openWelcome() {
    this.root.classList.remove('collapsed');
    if (this.aboutTab) this.aboutTab.hidden = true;
  }

  /** Collapse to the About tab; optionally persist the collapsed default. */
  collapseWelcome({ persist = true } = {}) {
    this.root.classList.add('collapsed');
    if (this.aboutTab) this.aboutTab.hidden = false;
    if (persist) writeWelcomeState(this.storage, { collapsed: true });
  }

  /** Record a successful entry open and refresh Continue Exploring. */
  recordTerm(slug) {
    this.history.record(slug);
    this._buildCarousel();
  }

  /** Select the Recently Added carousel slide when it exists. */
  showRecentlyAdded() {
    const index = this._slides?.findIndex((slide) => slide.id === 'added');
    if (index != null && index >= 0 && this._carousel) this._carousel.select(index);
  }

  _buildSlides() {
    const slides = [];
    const bySlug = new Map(this.terms.map((term) => [term.slug, term]));

    const daily = termOfDay(this.terms, new Date());
    if (daily) slides.push({ id: 'daily', label: 'Term of the Day', term: daily });

    const recent = this.history.read([...bySlug.keys()]).map((slug) => bySlug.get(slug)).find(Boolean);
    if (recent) slides.push({ id: 'recent', label: 'Continue Exploring', term: recent });

    const added = recentlyAdded(this.terms);
    if (added.length) slides.push({ id: 'added', label: 'Recently Added', term: added[0] });

    return slides;
  }

  _buildCarousel() {
    const root = document.getElementById('discovery-carousel');
    if (!root) return;
    // Tear down any previous carousel before rebuilding (recordTerm refreshes it).
    this._carousel?.destroy();
    this._carouselAbort?.abort();
    this._carouselAbort = new AbortController();
    const { signal } = this._carouselAbort;

    const slides = this._buildSlides();
    if (!slides.length) {
      root.hidden = true;
      root.replaceChildren();
      return;
    }
    root.hidden = false;
    this._slides = slides;

    const stage = document.createElement('div');
    stage.className = 'carousel-stage';
    stage.setAttribute('aria-live', 'polite');

    this._slideEls = slides.map((slide) => {
      const card = document.createElement('article');
      card.className = 'carousel-slide';
      card.dataset.slide = slide.id;
      card.hidden = true;
      const definition = (slide.term.definition || '').slice(0, 140);
      card.innerHTML = `
        <p class="carousel-kicker">${escapeHtml(slide.label)}</p>
        <h3 class="carousel-term">${escapeHtml(slide.term.term)}</h3>
        <p class="carousel-meta">${escapeHtml(slide.term.category)}</p>
        <p class="carousel-def">${escapeHtml(definition)}</p>`;
      const open = document.createElement('button');
      open.className = 'carousel-open';
      open.type = 'button';
      open.textContent = 'Open entry';
      open.addEventListener('click', () => this.onOpenTerm?.(slide.term.slug));
      card.appendChild(open);
      stage.appendChild(card);
      return card;
    });

    const dots = document.createElement('div');
    dots.className = 'carousel-dots';
    dots.setAttribute('role', 'tablist');
    this._dotEls = slides.map((slide, index) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', slide.label);
      dot.addEventListener('click', () => this._carousel.select(index));
      dots.appendChild(dot);
      return dot;
    });

    const makeArrow = (dir, label, glyph) => {
      const button = document.createElement('button');
      button.className = 'carousel-arrow';
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.textContent = glyph;
      button.addEventListener('click', () =>
        dir === 'prev' ? this._carousel.previous() : this._carousel.next()
      );
      return button;
    };

    const pause = document.createElement('button');
    pause.className = 'carousel-pause';
    pause.type = 'button';
    pause.setAttribute('aria-pressed', 'false');
    pause.textContent = 'Pause';
    pause.addEventListener('click', () => {
      if (this._carousel.paused) {
        this._carousel.resume('manual');
        pause.textContent = 'Pause';
        pause.setAttribute('aria-pressed', 'false');
      } else {
        this._carousel.pause('manual');
        pause.textContent = 'Play';
        pause.setAttribute('aria-pressed', 'true');
      }
    });

    const controls = document.createElement('div');
    controls.className = 'carousel-controls';
    controls.append(makeArrow('prev', 'Previous slide', '‹'), dots, pause, makeArrow('next', 'Next slide', '›'));

    root.replaceChildren(stage, controls);

    this._carousel = new CarouselState(slides.length, {
      intervalMs: 9000,
      reducedMotion: this.reducedMotion,
      onChange: (index) => this._showSlide(index),
    });

    root.addEventListener('mouseenter', () => this._carousel.pause('hover'), { signal });
    root.addEventListener('mouseleave', () => this._carousel.resume('hover'), { signal });
    root.addEventListener('focusin', () => this._carousel.pause('focus'), { signal });
    root.addEventListener('focusout', () => this._carousel.resume('focus'), { signal });
    const onVisibility = () => {
      if (document.hidden) this._carousel.pause('visibility');
      else this._carousel.resume('visibility');
    };
    document.addEventListener('visibilitychange', onVisibility, { signal });

    this._showSlide(0);
    this._carousel.start();
  }

  _showSlide(index) {
    this._slideEls.forEach((el, i) => {
      el.hidden = i !== index;
      el.classList.toggle('active', i === index);
    });
    this._dotEls.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  destroy() {
    this.searchBtn?.removeEventListener('click', this._onSearchClick);
    this.randomBtn?.removeEventListener('click', this._onRandomClick);
    this.mapBtn?.removeEventListener('click', this._onMapClick);
    this.aboutTab?.removeEventListener('click', this._onAboutClick);
    this._carouselAbort?.abort();
    this._carousel?.destroy();
  }
}
