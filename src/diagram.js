// Draws an explainer diagram (`{ nodes, edges }`, see normalizeDiagram) as an
// inline SVG block diagram in the book's ink style. Pure string output, so the
// reader and tests share it. Layout: nodes are layered top to bottom by their
// longest path from a root, ordered within a layer by their parents' positions.

const WIDTH = 360;
const PAD = 10;
const H_GAP = 12;
const V_GAP = 34;
const LINE = 13;
const CHAR_W = 6.1;

const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Word-wraps a label into at most `maxLines` lines of `width` characters. */
export function wrapLabel(label, width, maxLines = 2) {
  const words = String(label).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(1, width - 1))}…`;
    return kept;
  }
  return lines.map((l) => (l.length > width ? `${l.slice(0, Math.max(1, width - 1))}…` : l));
}

/** Layer index per node id: longest path from any root, ignoring back edges. */
export function layerNodes(diagram) {
  const out = new Map();
  const children = new Map(diagram.nodes.map((n) => [n.id, []]));
  const indegree = new Map(diagram.nodes.map((n) => [n.id, 0]));
  const back = new Set();
  // Drop edges that close a cycle (found by DFS in declaration order).
  const state = new Map();
  const adjacency = new Map(diagram.nodes.map((n) => [n.id, []]));
  for (const e of diagram.edges) adjacency.get(e.from).push(e);
  const visit = (id) => {
    state.set(id, 1);
    for (const e of adjacency.get(id)) {
      if (state.get(e.to) === 1) back.add(e);
      else if (!state.get(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of diagram.nodes) if (!state.get(n.id)) visit(n.id);
  for (const e of diagram.edges) {
    if (back.has(e)) continue;
    children.get(e.from).push(e.to);
    indegree.set(e.to, indegree.get(e.to) + 1);
  }
  const queue = diagram.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (const id of queue) out.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    for (const child of children.get(id)) {
      out.set(child, Math.max(out.get(child) || 0, out.get(id) + 1));
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  return { layers: out, back };
}

/** Node boxes and edge paths for a normalized diagram. */
export function layoutDiagram(diagram) {
  const { layers, back } = layerNodes(diagram);
  const rows = [];
  for (const n of diagram.nodes) {
    const layer = layers.get(n.id) || 0;
    (rows[layer] ||= []).push(n);
  }
  const position = new Map();
  const parents = new Map(diagram.nodes.map((n) => [n.id, []]));
  for (const e of diagram.edges) if (!back.has(e)) parents.get(e.to).push(e.from);

  const boxes = new Map();
  let y = PAD;
  rows.forEach((row, layer) => {
    if (layer > 0) {
      const score = (n) => {
        const ps = parents.get(n.id).filter((p) => position.has(p));
        return ps.length ? ps.reduce((sum, p) => sum + position.get(p), 0) / ps.length : Infinity;
      };
      row.sort((a, b) => score(a) - score(b));
    }
    const count = row.length;
    const boxW = Math.min(150, (WIDTH - PAD * 2 - H_GAP * (count - 1)) / count);
    const chars = Math.max(6, Math.floor((boxW - 12) / CHAR_W));
    const wrapped = row.map((n) => wrapLabel(n.label, chars));
    const boxH = Math.max(...wrapped.map((lines) => lines.length)) * LINE + 16;
    const rowW = count * boxW + (count - 1) * H_GAP;
    let x = (WIDTH - rowW) / 2;
    row.forEach((n, i) => {
      boxes.set(n.id, { ...n, x, y, w: boxW, h: boxH, lines: wrapped[i] });
      position.set(n.id, x + boxW / 2);
      x += boxW + H_GAP;
    });
    y += boxH + V_GAP;
  });
  const height = Math.max(y - V_GAP + PAD, 60);

  const edges = diagram.edges.map((e) => {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    let d;
    let mid;
    if (back.has(e) || b.y < a.y) {
      // Loop back up along the right margin.
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x + b.w;
      const y2 = b.y + b.h / 2;
      const rx = Math.min(WIDTH - 3, Math.max(x1, x2) + 18);
      d = `M${x1},${y1} C${rx},${y1} ${rx},${y2} ${x2 + 1},${y2}`;
      mid = { x: rx - 4, y: (y1 + y2) / 2 };
    } else if (b.y === a.y) {
      const leftToRight = a.x < b.x;
      const x1 = leftToRight ? a.x + a.w : a.x;
      const x2 = leftToRight ? b.x - 1 : b.x + b.w + 1;
      const y1 = a.y + a.h / 2;
      d = `M${x1},${y1} L${x2},${y1}`;
      mid = { x: (x1 + x2) / 2, y: y1 - 4 };
    } else {
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + b.w / 2;
      const y2 = b.y - 1;
      const cy = (y1 + y2) / 2;
      d = `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
      mid = { x: (x1 + x2) / 2, y: cy };
    }
    return { ...e, d, mid };
  });

  return { width: WIDTH, height, boxes: [...boxes.values()], edges };
}

/** Inline SVG markup for a diagram; `id` keeps arrow markers unique per page. */
export function renderDiagramSvg(diagram, { id = 'dg', title = '' } = {}) {
  if (!diagram || !diagram.nodes || diagram.nodes.length < 2) return '';
  const safeId = String(id).replace(/[^a-z0-9-]/gi, '');
  const marker = `${safeId}-arrow`;
  const { width, height, boxes, edges } = layoutDiagram(diagram);
  const label = title || diagram.caption || diagram.nodes.map((n) => n.label).join(', ');

  const edgeSvg = edges
    .map(
      (e) =>
        `<path class="dg-edge" d="${e.d}" marker-end="url(#${marker})"/>` +
        (e.label
          ? `<text class="dg-edge-label" x="${e.mid.x.toFixed(1)}" y="${(e.mid.y + 3).toFixed(1)}" text-anchor="middle">${escapeXml(
              e.label.length > 22 ? `${e.label.slice(0, 21)}…` : e.label
            )}</text>`
          : '')
    )
    .join('');

  const nodeSvg = boxes
    .map((b) => {
      const top = b.y + b.h / 2 - ((b.lines.length - 1) * LINE) / 2 + 4;
      const lines = b.lines
        .map(
          (line, i) =>
            `<tspan x="${(b.x + b.w / 2).toFixed(1)}" y="${(top + i * LINE).toFixed(1)}">${escapeXml(line)}</tspan>`
        )
        .join('');
      return `<g class="dg-node">${b.note ? `<title>${escapeXml(`${b.label} — ${b.note}`)}</title>` : ''}<rect x="${b.x.toFixed(
        1
      )}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h}" rx="6"/><text text-anchor="middle">${lines}</text></g>`;
    })
    .join('');

  return `<svg class="dg-svg" viewBox="0 0 ${width} ${height.toFixed(0)}" role="img" aria-label="${escapeXml(
    label
  )}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-arrow"/></marker></defs>${edgeSvg}${nodeSvg}</svg>`;
}
