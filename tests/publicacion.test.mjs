#!/usr/bin/env node
/*
 * Test de extremo a extremo: publicar una publicación de Facebook en un grupo y verificarla.
 *
 *   node tests/publicacion.test.mjs [URL_PUBLICACION] [URL_GRUPO]
 *
 * No usa ninguna cuenta ni accede a Facebook: las peticiones a https://www.facebook.com se
 * interceptan con el protocolo DevTools y se responden con un grupo simulado. Así se prueba
 * el código real de la app y del marcador sin riesgo para ninguna cuenta.
 *
 * Requisitos: Node 18+ y Google Chrome o Chromium (variable CHROME para otra ruta).
 */
import {spawn, execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const POST_URL = process.argv[2] || 'https://www.facebook.com/reel/1452025332928122';
const GROUP_URL = process.argv[3] || 'https://www.facebook.com/groups/1615283163101463';
const GROUP_NAME = 'Grupo de prueba';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = pathToFileURL(path.join(ROOT, 'facebook-publisher.html')).href;

const postId = (POST_URL.match(/\/reel\/(\d+)|\/videos\/(?:[^/?#]+\/)?(\d+)|\/posts\/(\w+)/) || []).slice(1).find(Boolean);
const groupSlug = (GROUP_URL.match(/\/groups\/([^/?#]+)/) || [])[1];
if (!postId || !groupSlug) { console.error('URL de publicación o de grupo no reconocida'); process.exit(2); }

/* ---------- Chrome + CDP mínimos (sin dependencias) ---------- */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execSync(`command -v ${c}`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch {}
  }
  for (const c of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(c)) return c;
  throw new Error('No se encontró Chrome. Define la variable CHROME con su ruta.');
}
const port = 9500 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fbp-test-'));
const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch {} }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const pending = {}; const errors = []; const handlers = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  handlers.forEach(h => h(m));
};
const send = (method, params = {}) => new Promise(r => { const i = ++seq; pending[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error');
  return r.result?.result?.value;
};
const go = async url => {
  await send('Page.navigate', {url}); await sleep(400);
  for (let i = 0; i < 60; i++) { try { if (await ev(`document.readyState!=='loading'&&(typeof S==='object'||!location.href.includes('facebook-publisher'))`)) break; } catch {} await sleep(250); }
  await sleep(300);
};

/* ---------- Facebook simulado ---------- */
let mockHasPost = true;
function mockGroupPage() {
  const other = '<div role="article"><a href="/groups/' + groupSlug + '/posts/1000000001/">hace 3 h</a><p>Otra publicación sin relación</p><a href="https://www.facebook.com/reel/999999999999/">Reel ajeno</a></div>';
  const ours = '<div role="article"><a href="/groups/' + groupSlug + '/posts/1000000002/">hace 1 min</a><p>¡Hola, comunidad de ' + GROUP_NAME + '! ' + POST_URL + '</p>' +
    '<a href="' + POST_URL + '/?__cft__[0]=AZX&amp;__tn__=R">Ver reel</a></div>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + GROUP_NAME + ' | Facebook</title></head><body>' +
    '<div role="main"><h1>' + GROUP_NAME + '</h1><div role="feed">' + (mockHasPost ? ours : '') + other + '</div></div></body></html>';
}
await send('Fetch.enable', {patterns: [{urlPattern: 'https://www.facebook.com/*'}]});
handlers.push(m => {
  if (m.method !== 'Fetch.requestPaused') return;
  const body = Buffer.from(mockGroupPage()).toString('base64');
  send('Fetch.fulfillRequest', {requestId: m.params.requestId, responseCode: 200, responseHeaders: [{name: 'Content-Type', value: 'text/html; charset=utf-8'}], body});
});
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false});

/* ---------- Pruebas ---------- */
let failed = 0, passed = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('condición no cumplida'); passed++; console.log(`  ✓ ${name}${typeof r === 'string' ? ' — ' + r : ''}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${String(e.message || e).split('\n')[0]}`); }
}
console.log(`\nPublicación: ${POST_URL}\nGrupo:       ${GROUP_URL}\n`);

await go(APP);
await ev(`localStorage.clear()`); await go(APP);
const bookmarklet = decodeURIComponent((await ev(`document.getElementById('bookmarklet').href`)).replace(/^javascript:/, ''));

console.log('1. Preparación en la app');
await t('reconoce la URL de la publicación', async () => {
  const r = await ev(`(()=>{srcEl.value=${JSON.stringify(POST_URL)};srcEl.dispatchEvent(new Event('input'));srcEl.dispatchEvent(new Event('blur'));return parseFbUrl(srcEl.value)})()`);
  if (r.error || r.url !== POST_URL.replace(/\/$/, '')) throw new Error(JSON.stringify(r));
  return `${r.kind} · ${r.url}`;
});
await t('añade el grupo desde el diálogo y normaliza su URL', async () => {
  await ev(`openGroupDlg();document.getElementById('gUrl').value=${JSON.stringify(GROUP_URL)};document.getElementById('gUrl').dispatchEvent(new Event('input'));document.getElementById('gName').value=${JSON.stringify(GROUP_NAME)};document.getElementById('groupForm').requestSubmit()`);
  const g = await ev(`S.groups[0]`);
  return g && g.url === `https://www.facebook.com/groups/${groupSlug}/` ? g.url : false;
});
await t('rechaza URLs que no son de Facebook', async () => (await ev(`normGroupUrl('https://evil.com/groups/1')`)) === null && (await ev(`parseFbUrl('javascript:alert(1)').error`)) != null);
await t('el grupo queda seleccionado como destino', async () => (await ev(`selectedGroups().map(g=>g.name).join()`)) === GROUP_NAME);
await ev(`txtEl.value='¡Hola, comunidad de {grupo}!';txtEl.dispatchEvent(new Event('input'))`);

console.log('2. Comprobación de seguridad');
await t('se muestra antes de empezar y permite continuar', async () => {
  await ev(`document.getElementById('startBtn').click()`); await sleep(200);
  const open = await ev(`document.getElementById('checkDlg').open`), dis = await ev(`document.getElementById('checkGo').disabled`);
  return open && !dis ? await ev(`[...document.querySelectorAll('#checkList .title')].map(e=>e.textContent).join(' | ')`) : false;
});

console.log('3. Publicación asistida');
await ev(`window.__opened=[];window.open=(u,n,f)=>{const w={opener:{},focus(){},location:{set href(v){window.__opened.push({name:n,href:v})}}};if(u)window.__opened.push({name:n,href:u});return w};
  window.__clip=[];navigator.clipboard.writeText=async t=>{window.__clip.push(t)}`);
await ev(`document.getElementById('checkGo').click()`); await sleep(300);
await t('abre el asistente con el grupo', async () => (await ev(`document.getElementById('runDlg').open&&document.querySelector('.run-group h3').textContent`)) === GROUP_NAME);
await ev(`stepOpen()`); await sleep(300);
await t('copia el texto personalizado con el enlace de la publicación', async () => {
  const txt = await ev(`window.__clip.at(-1)`);
  if (!txt || !txt.includes(`¡Hola, comunidad de ${GROUP_NAME}!`) || !txt.includes(POST_URL)) throw new Error(JSON.stringify(txt));
  return JSON.stringify(txt);
});
await t('abre exactamente el grupo de destino (ventana reutilizable, sin opener)', async () => {
  const o = await ev(`window.__opened.at(-1)`);
  return o && o.href === `https://www.facebook.com/groups/${groupSlug}/` && o.name === 'fbp_target' ? o.href : false;
});
await t('en modo «Compartir» usa el diálogo oficial con la publicación', async () => {
  await ev(`S.settings.mode='share';stepOpen()`); await sleep(200);
  const o = await ev(`window.__opened.at(-1).href`); await ev(`S.settings.mode='side'`);
  return o === `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(POST_URL)}` ? o : false;
});
await ev(`mark('done')`); await sleep(200);
await t('registra el grupo como publicado en el Historial', async () => (await ev(`S.history[0].items[0].status`)) === 'done');
await t('aplica la pausa de seguridad y bloquea el grupo 24 h', async () => (await ev(`isRecent(S.groups[0])`)) === true);
await ev(`closeRun(true)`);

console.log('4. Verificación en el grupo (marcador sobre Facebook simulado)');
async function runBookmarkletOnGroup() {
  await go(GROUP_URL);
  await ev(`window.__clip=[];navigator.clipboard.writeText=async t=>{window.__clip.push(t)}`);
  await ev(bookmarklet); await sleep(1600 * 4);
  await ev(`document.getElementById('fbpCopy')?.click()`); await sleep(300);
  return ev(`window.__clip.at(-1)||''`);
}
let check = await runBookmarkletOnGroup();
await t('el marcador lee las publicaciones del grupo y copia la verificación', async () => {
  if (!check.startsWith('FBP_CHECK:')) throw new Error(check.slice(0, 120));
  const d = JSON.parse(check.slice(10));
  if (!d.group.slugs.includes(groupSlug.toLowerCase())) throw new Error('grupo ' + d.group.slugs);
  return `${d.ids.length} publicaciones leídas; contiene ${postId}: ${d.ids.includes(postId)}`;
});
async function verifyInApp(payload) {
  await go(APP); await ev(`location.hash='historial'`); await sleep(300);
  await ev(`document.querySelector('[data-vf]').click()`); await sleep(200);
  await ev(`(()=>{const t=document.getElementById('vfText');t.value=${JSON.stringify(payload)};t.dispatchEvent(new Event('input'))})()`); await sleep(300);
  return ev(`document.getElementById('vfResult').textContent`);
}
await t('la app confirma que la publicación aparece en el grupo', async () => {
  const r = await verifyInApp(check);
  if (!/Verificada/.test(r)) throw new Error(r);
  return (await ev(`JSON.stringify(S.history[0].items[0].verify.found)`)) === 'true' ? r.trim() : false;
});
await t('el resultado se guarda y se muestra en el Historial', async () => {
  await go(APP + '#historial');
  return (await ev(`S.history[0].items[0].verify.found===true&&document.getElementById('histBox').textContent.includes('Verificada')`)) === true;
});

mockHasPost = false; check = await runBookmarkletOnGroup();
await t('caso negativo: si no está en el grupo, informa «No encontrada»', async () => {
  const r = await verifyInApp(check);
  return /No encontrada/.test(r) && (await ev(`S.history[0].items[0].verify.found`)) === false ? r.trim().slice(0, 90) + '…' : false;
});
await t('rechaza una verificación de otro grupo', async () => {
  const other = 'FBP_CHECK:' + JSON.stringify({v: 1, group: {name: 'Otro', slugs: ['123']}, ids: [postId], at: Date.now()});
  return /no de/.test(await verifyInApp(other));
});

console.log('5. Corregir un registro: «no se publicó»');
await t('el grupo bloqueado 24 h se puede liberar desde Destinos', async () => {
  await go(APP + '#publicar');
  if (!(await ev(`!!document.querySelector('[data-unlock]')&&document.querySelector('[data-dsel]').disabled`))) throw new Error('no aparece bloqueado');
  await ev(`document.querySelector('[data-unlock]').click()`); await sleep(300);
  await ev(`document.getElementById('cfYes').click()`); await sleep(400);
  const r = await ev(`JSON.stringify({recent:isRecent(S.groups[0]),status:S.history[0].items[0].status,disabled:document.querySelector('[data-dsel]').disabled,checked:document.querySelector('[data-dsel]').checked,day:usage().day.length})`);
  const o = JSON.parse(r);
  if (o.recent || o.status !== 'skipped' || o.disabled || !o.checked || o.day !== 0) throw new Error(r);
  return 'grupo disponible y seleccionado; ya no cuenta para los límites';
});
await t('sin errores de JavaScript', async () => errors.length === 0 || (() => { throw new Error(errors.join(' | ')); })());

console.log(`\n${passed} correctas, ${failed} fallidas\n`);
ws.close(); chrome.kill();
try { fs.rmSync(profile, {recursive: true, force: true}); } catch {}
process.exit(failed ? 1 : 0);
