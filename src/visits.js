// One beacon per page load keeps the footer's distinct-reader count current.
// The server owns identity (an HttpOnly cookie), so this module never reads or
// writes cookies itself; it only asks for the latest total and shows it.

const ENDPOINT = '/api/visit';

export function formatVisitorCount(total) {
  const value = Number(total);
  if (!Number.isFinite(value) || value < 0) return '';
  return new Intl.NumberFormat('en-US').format(Math.floor(value));
}

/** Reveal the footer only when there is a real, positive count to show. */
export function applyVisitorCount(root, total) {
  const footer = root?.querySelector?.('[data-visitor-footer]');
  const count = root?.querySelector?.('[data-visitor-count]');
  const value = Math.floor(Number(total));
  const formatted = formatVisitorCount(total);
  if (!footer || !count || !formatted || value < 1) {
    if (footer) footer.hidden = true;
    return false;
  }

  count.textContent = `${formatted} distinct ${value === 1 ? 'reader' : 'readers'}`;
  footer.hidden = false;
  return true;
}

export async function recordVisit({
  fetchImpl = globalThis.fetch,
  root = globalThis.document,
  endpoint = ENDPOINT,
} = {}) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return null;
    if (response.status === 204) return null;
    const data = await response.json();
    const total = Number(data?.total);
    if (!Number.isFinite(total)) return null;
    applyVisitorCount(root, total);
    return total;
  } catch {
    // Static previews and local `vite dev` have no function; the footer simply
    // stays hidden rather than showing a broken count.
    return null;
  }
}

function start() {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return;
  recordVisit();
}

if (typeof document !== 'undefined') {
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', start, { once: true });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
