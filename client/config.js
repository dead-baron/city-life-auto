// Which game server the page connects to.
// Order: ?server=wss://host/ws  ->  window.CLA_SERVER  ->  hosted page default  ->  same origin.
// When the page is hosted on GitHub Pages (deadbaron.com/city-life-auto) the live server is
// expected at PROD_SERVER - update it once your Oracle instance + DNS record are live.
export const PROD_SERVER = 'wss://play.deadbaron.com/ws';

export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (window.CLA_SERVER) return window.CLA_SERVER;
  const h = location.hostname;
  if (h.endsWith('github.io') || h === 'deadbaron.com' || h === 'www.deadbaron.com') return PROD_SERVER;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export const TOKEN_KEY = 'cla.token';
