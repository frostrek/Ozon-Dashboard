export function replaceQuery(path, params = {}) {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = value == null ? '' : String(value).trim();
    if (!text) continue;
    search.set(key, text);
  }
  const qs = search.toString();
  const href = qs ? `${path}?${qs}` : path;
  if (`${window.location.pathname}${window.location.search}` === href) return;
  window.history.replaceState(window.history.state, '', href);
}
