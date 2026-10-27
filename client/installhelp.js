// The install help sheet's steps and Repair install (the title's and Settings' Install buttons when the browser offers
// no install prompt of its own, and the Repair buttons): loaded the first time one is pressed, out of the page's
// start-up code (client/main.js openInstall, repairInstall). The native prompt itself stays in main.js: it must be
// shown inside the press.
const UA = navigator.userAgent;
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/.test(UA);
const IS_SAMSUNG = /SamsungBrowser/.test(UA);
const IS_FIREFOX = /Firefox|FxiOS/.test(UA);

export function installSteps() {
  if (IS_IOS) return `<h3>iPhone / iPad (Safari)</h3><ol><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><p>Reinstalling after a delete works the same way - iOS keeps no install record.</p>`;
  if (IS_SAMSUNG) return `<h3>Samsung Internet</h3><ol><li>Tap the <b>☰ menu</b>.</li><li>Choose <b>Add page to</b> → <b>Apps screen</b> (or <b>Home screen</b>).</li></ol>`;
  if (IS_FIREFOX && IS_ANDROID) return `<h3>Firefox for Android</h3><ol><li>Tap the <b>⋮ menu</b>.</li><li>Choose <b>Install</b> (or <b>Add to Home screen</b>).</li></ol>`;
  if (IS_ANDROID) return `<h3>Chrome on Android</h3><ol><li>Tap the <b>⋮ menu</b> (top right).</li><li>Choose <b>Install app</b> (older Chrome: <b>Add to Home screen</b> → <b>Install</b>).</li></ol>`;
  return `<h3>Desktop Chrome / Edge</h3><ol><li>Click the <b>install icon</b> at the right end of the address bar, or open the <b>⋮ / … menu</b>.</li><li>Choose <b>Install City Life Auto</b> (Edge: <b>Apps → Install this site as an app</b>).</li></ol>`;
}
export function stuckSteps() {
  if (IS_IOS) return '';
  const android = IS_ANDROID && !IS_FIREFOX;
  return `<h3>Says "already installed" after you removed it?</h3><ol>
    ${android ? '<li>Make sure it is really gone: phone <b>Settings → Apps → City Life Auto → Uninstall</b>. Removing only the home-screen icon can leave the app installed.</li>' : '<li>Make sure it is really gone: open <b>chrome://apps</b> (Edge: <b>edge://apps</b>), right-click City Life Auto → <b>Uninstall</b>.</li>'}
    <li>Tap <b>Repair install and reload</b> below. It clears only this game's offline copy - your saves and other games are untouched.</li>
    <li>${android ? 'Fully close Chrome (swipe it away in recent apps), reopen it' : 'Restart the browser'} and come back to this page, then install again.</li>
  </ol>`;
}
// wipes only this game's service worker and caches (never the other deadbaron.com games), then reloads fresh
export async function repairInstall() {
  const scopePath = new URL('./', location.href).pathname;
  try {
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) {
        if (new URL(r.scope).pathname !== scopePath) continue; // never touch the other games
        try { (r.active || r.waiting || r.installing)?.postMessage('cla-reset'); } catch { /* gone */ }
        await r.unregister();
      }
    }
    if (self.caches) for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k);
  } catch { /* best effort */ }
  try { localStorage.removeItem('cla.build'); } catch { /* storage blocked */ }
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.href);
}
