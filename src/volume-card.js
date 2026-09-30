import { letterColor } from './palette.js';

export function volumeCardData(volume, terms = []) {
  const sorted = [...terms]
    .map((term) => term.term)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return {
    folder: volume.folder,
    label: volume.label,
    count: sorted.length,
    samples: sorted.slice(0, 3),
    color: letterColor(volume.letters?.[0]),
  };
}

export function clampCardPosition(point, cardSize, viewport, margin = 12) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const preferredLeft = point.x + 16;
  const preferredTop = point.y - cardSize.height / 2;
  return {
    left: Math.max(margin, Math.min(preferredLeft, viewport.width - cardSize.width - margin)),
    top: Math.max(margin, Math.min(preferredTop, viewport.height - cardSize.height - margin)),
  };
}

export function nextVolumeCardState({ folder, animating = false, pulled = false, paused = false } = {}) {
  return folder && !animating && !pulled && !paused ? 'show' : 'hide';
}

function text(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

export class VolumeCard {
  constructor(element) {
    this.element = element;
    this.point = null;
  }

  show(data, point) {
    this.point = point;
    this.element.replaceChildren();
    this.element.style.setProperty('--volume-accent', data.color);
    this.element.append(
      text('p', 'volume-card-kicker', `Volume ${data.label}`),
      text('h2', 'volume-card-title', `${data.count.toLocaleString()} terms`)
    );
    if (data.samples.length) {
      const list = document.createElement('ul');
      list.className = 'volume-card-samples';
      for (const sample of data.samples) {
        const item = document.createElement('li');
        item.textContent = sample;
        list.appendChild(item);
      }
      this.element.appendChild(list);
    }
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
    this.move(point);
  }

  move(point) {
    if (!point || !this.element.classList.contains('visible')) return;
    this.point = point;
    const rect = this.element.getBoundingClientRect();
    const view = this.element.ownerDocument.defaultView;
    const position = clampCardPosition(
      point,
      { width: rect.width, height: rect.height },
      { width: view.innerWidth, height: view.innerHeight }
    );
    if (!position) return;
    this.element.style.left = `${position.left}px`;
    this.element.style.top = `${position.top}px`;
  }

  hide() {
    this.point = null;
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
  }
}
