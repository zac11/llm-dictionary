import { loadGraph, neighbors } from './graph.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function communityColor(id) {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  const t = ((hash >>> 0) % 1000) / 999;
  const from = [159, 124, 255];
  const to = [110, 168, 254];
  return `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * t)).join(',')})`;
}

export class GraphMap {
  constructor(root, { onOpenTerm, onSelection } = {}) {
    this.root = root;
    this.onOpenTerm = onOpenTerm;
    this.onSelection = onSelection;
    this.canvas = root.querySelector('#graph-canvas');
    this.context = this.canvas.getContext('2d');
    this.search = root.querySelector('#graph-search');
    this.list = root.querySelector('#graph-term-list');
    this.panel = root.querySelector('#graph-detail');
    this.status = root.querySelector('#graph-status');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.selected = null;
    this.hovered = null;
    this.drag = null;
    this._perf = { drawCalls: 0, drawMs: 0, pickCalls: 0, pickMs: 0, frames: 0, fpsStart: 0, fps: 0, firstOpenTotalMs: 0, firstRenderMs: 0 };
    this._bind();
  }

  async load() {
    const started = performance.now();
    this.status.textContent = 'Loading terms…';
    this.index = await loadGraph();
    this.nodes = [...this.index.bySlug.values()];
    const ready = performance.now();
    this.status.textContent = `${this.nodes.length.toLocaleString()} terms · drag to explore · scroll to zoom`;
    this._resize();
    this._renderList('');
    this.draw();
    const done = performance.now();
    this._perf.firstOpenTotalMs = Math.round(done - started);
    this._perf.firstRenderMs = Math.round(done - ready);
  }

  show(slug) {
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this._resize();
    let selected = true;
    if (slug) selected = this.select(slug, { center: true, notify: false });
    this.draw();
    return selected;
  }

  hide() {
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
  }

  select(slug, { center = false, notify = true } = {}) {
    const node = this.index?.bySlug.get(slug);
    if (!node) return false;
    this.selected = node;
    if (center) {
      this.scale = Math.max(this.scale, 2.2);
      const point = this._world(node);
      this.offsetX += this.width / 2 - point.x;
      this.offsetY += this.height / 2 - point.y;
    }
    this._renderDetail(node);
    this.draw();
    if (notify) this.onSelection?.(slug);
    return true;
  }

  deselect() {
    if (!this.selected) return false;
    this.selected = null;
    this.hovered = null;
    this._renderDetail(null);
    this.draw();
    return true;
  }

  _bind() {
    this.search.addEventListener('input', () => this._renderList(this.search.value));
    this.search.addEventListener('keydown', (event) => this._onSearchKeys(event));
    this.list.addEventListener('keydown', (event) => this._onSearchKeys(event));
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const oldScale = this.scale;
      this.scale = clamp(this.scale * Math.exp(-event.deltaY * 0.001), 0.65, 12);
      const ratio = this.scale / oldScale;
      this.offsetX = x - (x - this.offsetX) * ratio;
      this.offsetY = y - (y - this.offsetY) * ratio;
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.drag) {
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        this.drag.moved ||= Math.hypot(dx, dy) > 3;
        this.offsetX = this.drag.offsetX + dx;
        this.offsetY = this.drag.offsetY + dy;
        this.draw();
        return;
      }
      const node = this._pick(event);
      if (node !== this.hovered) {
        this.hovered = node;
        this.canvas.title = node ? `${node.label} · ${node.category}` : '';
        this.draw();
      }
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const moved = this.drag?.moved;
      this.drag = null;
      if (!moved) {
        const node = this._pick(event);
        if (node) this.select(node.slug);
      }
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.drag) {
        this.hovered = null;
        this.draw();
      }
    });
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.root);
  }

  _onSearchKeys(event) {
    if (event.key === 'Escape') {
      if (event.target !== this.search) return; // list rows: let the global Escape handle it
      if (!this.search.value) return; // empty box: let the global Escape exit the map
      event.stopPropagation();
      this.search.value = '';
      this._renderList('');
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...this.list.querySelectorAll('.graph-term-row')];
    if (!rows.length) return;
    const current = rows.indexOf(document.activeElement);
    const index = current === -1
      ? (event.key === 'ArrowDown' ? 0 : rows.length - 1)
      : current + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, index))]?.focus();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!this.initialized) {
      this.offsetX = rect.width / 2;
      this.offsetY = rect.height / 2;
      this.initialized = true;
    }
    this.draw();
  }

  _world(node) {
    const base = Math.min(this.width || 1, this.height || 1) * 0.44;
    return {
      x: this.offsetX + node.x * base * this.scale,
      y: this.offsetY + node.y * base * this.scale,
    };
  }

  _radius(node) {
    const count = this.nodes?.length || 1;
    return clamp(2 + Math.sqrt(node.centrality * count) * 1.5, 2.2, 9) * clamp(Math.sqrt(this.scale), 0.8, 2);
  }

  _pick(event) {
    if (!this.nodes) return null;
    const started = performance.now();
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let picked = null;
    let best = Infinity;
    for (const node of this.nodes) {
      const point = this._world(node);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < Math.max(14, this._radius(node) + 5) && distance < best) {
        picked = node;
        best = distance;
      }
    }
    this._perf.pickMs += performance.now() - started;
    this._perf.pickCalls += 1;
    return picked;
  }

  draw() {
    if (!this.nodes || !this.width) return;
    const started = performance.now();
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const focus = this.selected || this.hovered;
    if (focus) {
      context.strokeStyle = 'rgba(159,124,255,.28)';
      context.lineWidth = 1;
      for (const { node } of neighbors(this.index, focus.slug)) {
        const from = this._world(focus);
        const to = this._world(node);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
    }
    for (const node of this.nodes) {
      const point = this._world(node);
      if (point.x < -15 || point.y < -15 || point.x > this.width + 15 || point.y > this.height + 15) continue;
      const active = node === this.selected || node === this.hovered;
      context.beginPath();
      context.arc(point.x, point.y, this._radius(node) + (active ? 2 : 0), 0, Math.PI * 2);
      context.fillStyle = node === this.selected ? '#e6b45c' : communityColor(node.community);
      context.globalAlpha = active || !focus ? 0.82 : 0.28;
      context.fill();
      if (active) {
        context.globalAlpha = 1;
        context.strokeStyle = '#f5d28a';
        context.lineWidth = 1.5;
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    for (const node of new Set([this.hovered, this.selected])) {
      if (!node) continue;
      const point = this._world(node);
      context.font = '600 12px Inter, sans-serif';
      context.fillStyle = '#f3eef7';
      context.fillText(node.label, point.x + this._radius(node) + 7, point.y + 4);
    }
    this._recordDraw(performance.now() - started);
  }

  _recordDraw(elapsed) {
    this._perf.drawMs += elapsed;
    this._perf.drawCalls += 1;
    this._perf.frames += 1;
    const now = performance.now();
    if (!this._perf.fpsStart) this._perf.fpsStart = now;
    if (now - this._perf.fpsStart >= 1000) {
      this._perf.fps = Math.round((this._perf.frames * 1000) / (now - this._perf.fpsStart));
      this._perf.frames = 0;
      this._perf.fpsStart = now;
    }
  }

  stats() {
    const avgDrawMs = this._perf.drawCalls ? this._perf.drawMs / this._perf.drawCalls : 0;
    const avgPickMs = this._perf.pickCalls ? this._perf.pickMs / this._perf.pickCalls : 0;
    return {
      nodes: this.nodes?.length ?? 0,
      firstOpenTotalMs: this._perf.firstOpenTotalMs,
      firstRenderMs: this._perf.firstRenderMs,
      drawCalls: this._perf.drawCalls,
      avgDrawMs: Number(avgDrawMs.toFixed(3)),
      pickCalls: this._perf.pickCalls,
      avgPickMs: Number(avgPickMs.toFixed(3)),
      fps: this._perf.fps,
    };
  }

  _renderList(query) {
    if (!this.nodes) return;
    const needle = query.trim().toLowerCase();
    const matches = this.nodes
      .filter((node) => {
        if (!needle) return true;
        const hay = `${node.label} ${node.category} ${(node.aka || []).join(' ')}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => b.centrality - a.centrality || a.label.localeCompare(b.label))
      .slice(0, 100);
    this.list.replaceChildren(...matches.map((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'graph-term-row';
      const label = document.createElement('span');
      label.textContent = node.label;
      const category = document.createElement('small');
      category.textContent = node.category;
      button.append(label, category);
      button.addEventListener('click', () => this.select(node.slug, { center: true }));
      return button;
    }));
  }

  _renderDetail(node) {
    this.panel.replaceChildren();
    if (!node) {
      const empty = document.createElement('p');
      empty.className = 'graph-detail-empty';
      empty.textContent = 'Select any node to see its connections.';
      this.panel.appendChild(empty);
      return;
    }
    const related = neighbors(this.index, node.slug).slice(0, 6);
    const kicker = document.createElement('p');
    kicker.className = 'graph-detail-kicker';
    kicker.textContent = node.category;
    const title = document.createElement('h2');
    title.textContent = node.label;
    const meta = document.createElement('p');
    meta.className = 'graph-detail-meta';
    meta.textContent = `${related.length ? `${related.length} nearby connections shown` : 'No accepted connections'} · ${this.index.graph.communities[node.community].label}`;
    const links = document.createElement('div');
    links.className = 'graph-related';
    for (const { node: item } of related) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.addEventListener('click', () => this.select(item.slug, { center: true }));
      links.appendChild(button);
    }
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'graph-open-entry';
    open.textContent = 'Open encyclopaedia entry';
    open.addEventListener('click', () => this.onOpenTerm?.(node.slug));
    this.panel.append(kicker, title, meta, links, open);
  }
}
