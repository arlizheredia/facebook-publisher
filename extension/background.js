/* Facebook Publisher · service worker
 * Recibe de la app (vía bridge.js) una publicación para un grupo, abre el grupo en una
 * ventana dedicada con la sesión del usuario y pide a fb.js que la publique.
 * Los límites de ritmo (pausas, máximos por hora y día) los aplica la app antes de cada envío. */
const APP_URL = [
  /^https:\/\/arlizheredia\.github\.io\/facebook-publisher\//,
  /^file:\/\/\/.*facebook-publisher[^/]*\.html/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/.*facebook-publisher/
];
const GROUP_URL = /^https:\/\/www\.facebook\.com\/groups\/[\w.\-]+\/$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fbTabId = null, fbWinId = null, appTabId = null, busy = false;

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  if (msg.from === 'fb' && msg.type === 'progress') { progress(msg.step); return; }
  if (msg.from !== 'bridge') return;
  if (!APP_URL.some(r => r.test(sender.url || ''))) { send({ok: false, step: 'ext', error: 'Origen no permitido'}); return; }
  appTabId = sender.tab && sender.tab.id;
  if (msg.cmd === 'post') {
    if (busy) { send({ok: false, step: 'ext', error: 'Ya hay una publicación en curso'}); return; }
    busy = true;
    handlePost(msg.job).then(send, e => send({ok: false, step: 'ext', error: String((e && e.message) || e)})).finally(() => { busy = false; });
    return true;
  }
  if (msg.cmd === 'focusApp') { if (appTabId != null) chrome.tabs.update(appTabId, {active: true}).catch(() => {}); send({ok: true}); return; }
  send({ok: false, step: 'ext', error: 'Orden desconocida'});
});

function progress(step) {
  if (appTabId != null) chrome.tabs.sendMessage(appTabId, {to: 'bridge', type: 'progress', step}).catch(() => {});
}

function validJob(j) {
  return j && typeof j === 'object' && typeof j.url === 'string' && GROUP_URL.test(j.url) &&
    typeof j.text === 'string' && j.text.length <= 63206 && Array.isArray(j.files) && j.files.length <= 20 &&
    j.files.every(f => f && typeof f.name === 'string' && /^(image|video)\//.test(f.type) && typeof f.data === 'string');
}

async function openGroup(url) {
  let tabId = null;
  if (fbTabId != null) { try { await chrome.tabs.get(fbTabId); tabId = fbTabId; } catch { fbTabId = null; } }
  const loaded = new Promise(res => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); res(false); }, 45000);
    const l = (id, info) => { if (id === (tabId ?? fbTabId) && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); res(true); } };
    chrome.tabs.onUpdated.addListener(l);
  });
  if (tabId != null) {
    await chrome.tabs.update(tabId, {url, active: true});
    if (fbWinId != null) chrome.windows.update(fbWinId, {focused: true}).catch(() => {});
  } else {
    const w = await chrome.windows.create({url, type: 'normal', focused: true, width: 1100, height: 900});
    fbWinId = w.id; fbTabId = tabId = w.tabs[0].id;
  }
  const ok = await loaded;
  return ok ? tabId : null;
}

async function handlePost(job) {
  if (!validJob(job)) return {ok: false, step: 'ext', error: 'Datos de publicación no válidos'};
  progress('Abriendo el grupo…');
  const tabId = await openGroup(job.url);
  if (tabId == null) return {ok: false, step: 'load', error: 'El grupo no terminó de cargar'};
  for (let i = 0; i < 30; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, {cmd: 'post', job});
      if (r) return r;
    } catch { /* fb.js aún no está listo */ }
    await sleep(500);
  }
  return {ok: false, step: 'load', error: 'No se pudo conectar con la página de Facebook'};
}
