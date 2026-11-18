#!/usr/bin/env node
/*
 * Test de la publicación automática (app + extensión) contra un Facebook simulado.
 *
 *   node tests/automatico.test.mjs [URL_PUBLICACION] [URL_GRUPO]
 *
 * Carga la extensión real de /extension en Chrome, sirve la app en su URL de GitHub Pages y
 * responde a www.facebook.com con grupos simulados (normal, con aprobación, sin ser miembro y con
 * aviso de bloqueo). No accede a Facebook ni usa ninguna cuenta.
 * Requisitos: Node 18+ y Chrome 126+ (CHROME=/ruta si no está en el PATH).
 */
import {spawn, execSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const POST_URL = process.argv[2] || 'https://www.facebook.com/reel/1452025332928122';
const GROUP_URL = (process.argv[3] || 'https://www.facebook.com/groups/1615283163101463').replace(/\/?$/, '/');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_URL = 'https://arlizheredia.github.io/facebook-publisher/facebook-publisher.html';
const MAIN = GROUP_URL.match(/\/groups\/([^/]+)/)[1];
const GROUPS = [
  {id: 'g1', slug: MAIN, name: 'Grupo principal', mode: 'ok'},
  {id: 'g2', slug: '2000000002', name: 'Grupo con aprobación', mode: 'pending'},
  {id: 'g3', slug: '2000000003', name: 'Grupo sin ser miembro', mode: 'notmember'},
  {id: 'g4', slug: '2000000004', name: 'Grupo con aviso', mode: 'block'},
  {id: 'g5', slug: '2000000005', name: 'Grupo cinco', mode: 'ok'},
  {id: 'g6', slug: '2000000006', name: 'Grupo seis', mode: 'ok'},
  {id: 'g7', slug: '2000000007', name: 'Grupo con mensaje', mode: 'notice'},
  {id: 'g8', slug: '2000000008', name: 'Grupo solo administradores', mode: 'adminsonly'},
  {id: 'g9', slug: '2000000009', name: 'Grupo nueve', mode: 'ok'},
  {id: 'g10', slug: '2000000010', name: 'Grupo diez', mode: 'ok'},
  {id: 'g11', slug: '2000000011', name: 'Grupo once', mode: 'ok'},
  {id: 'g12', slug: '2000000012', name: 'Grupo doce', mode: 'ok'},
  {id: 'g13', slug: '2000000013', name: 'Grupo trece', mode: 'ok'},
  {id: 'g14', slug: '2000000014', name: 'Grupo catorce', mode: 'ok'},
  {id: 'g15', slug: '2000000015', name: 'Grupo quince', mode: 'ok'}
];

/* ---------- Chrome por tubería (necesario para cargar extensiones) ---------- */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'])
    try { return execSync(`command -v ${c}`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch {}
  throw new Error('No se encontró Chrome (define CHROME)');
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fbp-auto-'));
const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, '--screen-info={1920x1080}'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
const out = chrome.stdio[3], inp = chrome.stdio[4];
let seq = 0, buf = ''; const pending = {}, listeners = [];
inp.on('data', d => {
  buf += d.toString(); let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    listeners.forEach(f => f(m));
  }
});
const send = (method, params = {}, sessionId) => new Promise(r => { const id = ++seq; pending[id] = r; out.write(JSON.stringify({id, method, params, sessionId}) + '\0'); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Respuestas simuladas ---------- */
const posted = [];
const appHtml = fs.readFileSync(path.join(ROOT, 'facebook-publisher.html'));
function mockGroup(g) {
  const composer = g.mode === 'notmember'
    ? '<div role="button" aria-label="Unirte al grupo">Unirte al grupo</div>'
    : '<div role="button" id="c"><div><span>Escribe algo...</span></div></div>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${g.name} | Facebook</title></head><body>
<div role="main"><h1>${g.name}</h1>${composer}<div role="feed" id="feed"></div></div>${g.mode === 'adminsonly' ? '<div role="dialog"><div>Solo los administradores pueden publicar en este grupo.</div><div role="button">Aceptar</div></div>' : ''}
<script>
const MODE=${JSON.stringify(g.mode)};
function msg(t){const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<div>'+t+'</div><div role="button" aria-label="Cerrar">Cerrar</div>';document.body.appendChild(d)}
const c=document.getElementById('c');
if(c)c.addEventListener('click',()=>{
  if(document.getElementById('tb'))return;
  const d=document.createElement('div');d.setAttribute('role','dialog');d.id='dlg';
  d.innerHTML='<h2>Crear publicación</h2><div contenteditable="true" role="textbox" id="tb" style="min-height:40px"></div><div id="att"></div>'+
    '<input type="file" multiple style="display:none" id="fi"><div role="button" aria-label="Publicar" aria-disabled="true" id="pb">Publicar</div>';
  document.body.appendChild(d);
  const tb=d.querySelector('#tb'),att=d.querySelector('#att'),pb=d.querySelector('#pb'),fi=d.querySelector('#fi');let files=[];
  const upd=()=>pb.setAttribute('aria-disabled',tb.innerText.trim()||files.length?'false':'true');
  const addF=fs=>{[...fs].forEach(f=>{files.push(f);const i=document.createElement('img');i.src=URL.createObjectURL(f);att.appendChild(i)});const lp=d.querySelector('#lp');if(lp)lp.remove();upd()};
  const linkPreview=()=>{const x=tb.innerText,i=x.indexOf('https://www.facebook.com/');if(i<0||d.querySelector('#lp')||files.length)return;const url=x.slice(i).split(' ')[0].split(String.fromCharCode(10))[0];setTimeout(()=>{if(d.querySelector('#lp'))return;const lp=document.createElement('div');lp.id='lp';lp.innerHTML='<a href="'+url+'">Vista previa de la publicación</a><div role="button" aria-label="Quitar vista previa del enlace">x</div>';d.insertBefore(lp,pb)},800)};
  tb.addEventListener('paste',e=>{e.preventDefault();const t=e.clipboardData.getData('text/plain');const sel=getSelection();if(t){if(sel.rangeCount&&!sel.isCollapsed&&tb.contains(sel.anchorNode))tb.innerText=t;else tb.innerText+=t}if(e.clipboardData.files.length)addF(e.clipboardData.files);linkPreview();upd()});
  tb.addEventListener('input',linkPreview);
  fi.addEventListener('change',()=>addF(fi.files));
  pb.addEventListener('click',async()=>{
    if(pb.getAttribute('aria-disabled')==='true')return;
    const toast=document.createElement('div');toast.setAttribute('role','status');toast.textContent='Publicando';document.body.appendChild(toast);setTimeout(()=>toast.remove(),1500);
    if(MODE==='block'){msg('Estás publicando demasiado rápido. Se ha bloqueado temporalmente esta función.');return}
    await fetch('https://www.facebook.com/__fbp_test_posted',{method:'POST',body:JSON.stringify({group:${JSON.stringify(g.slug)},text:tb.innerText,preview:(d.querySelector('#lp a')||{}).href||null,files:files.map(f=>({name:f.name,type:f.type,size:f.size}))})});
    d.remove();
    if(MODE==='notice')msg('Tu publicación se compartió, pero puede tardar unos minutos en aparecer para los miembros del grupo.');
    if(MODE==='pending')msg('Tu publicación está pendiente. Los administradores la revisarán antes de que aparezca en el grupo.');
  });
});
</script></body></html>`;
}
const PNG = fs.readFileSync(path.join(ROOT, 'extension', 'icon128.png'));
/* Versión «nueva» de la extensión (9.9.9) para probar la autoactualización */
const REMOTE_EXT = 'https://arlizheredia.github.io/facebook-publisher/extension/';
const UPD = {serveNew: false, tamper: false};
const NEWEXT = fs.mkdtempSync(path.join(os.tmpdir(), 'fbp-newext-'));
{
  const crypto = await import('node:crypto');
  const names = fs.readdirSync(path.join(ROOT, 'extension')).filter(n => n !== 'files.json');
  for (const n of names) fs.copyFileSync(path.join(ROOT, 'extension', n), path.join(NEWEXT, n));
  const m = JSON.parse(fs.readFileSync(path.join(NEWEXT, 'manifest.json'), 'utf8')); m.version = '9.9.9';
  fs.writeFileSync(path.join(NEWEXT, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const files = names.sort().map(n => ({name: n, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(NEWEXT, n))).digest('hex')}));
  fs.writeFileSync(path.join(NEWEXT, 'files.json'), JSON.stringify({version: '9.9.9', files}));
}
const TYPES = {js: 'application/javascript', json: 'application/json', png: 'image/png', html: 'text/html; charset=utf-8', svg: 'image/svg+xml'};
const USER = {id: '100012345678', name: 'Ana Pérez'};
/* PNG de 300×300 para el plan B de la miniatura (imagen ya cargada en la página) */
const BIG = (() => { const zlib = require('node:zlib'); const n = 300, row = Buffer.alloc(1 + n * 4); for (let x = 0; x < n; x++) row.set([232, 113, 10, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({length: n}, () => row)); const crc = b => { let c, t = []; for (let i = 0; i < 256; i++) { c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(n, 0); ih.writeUInt32BE(n, 4); ih.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); })();
function fulfill(sessionId, ev) {
  const u = ev.request.url; let body = '', type = 'text/html; charset=utf-8', code = 200;
  if (u.startsWith(REMOTE_EXT)) {
    const name = u.slice(REMOTE_EXT.length).split('?')[0], dir = UPD.serveNew ? NEWEXT : path.join(ROOT, 'extension'), f = path.join(dir, name);
    if (/^[\w.-]+$/.test(name) && fs.existsSync(f)) { body = fs.readFileSync(f); if (UPD.tamper && name === 'fb.js') body = Buffer.concat([body, Buffer.from('\n// alterado')]); type = TYPES[name.split('.').pop()] || 'application/octet-stream'; }
    else { body = 'no encontrado'; code = 404; }
  }
  else if (u.startsWith(APP_URL)) body = appHtml;
  else if (/^https:\/\/www\.facebook\.com\/me(\?|$)/.test(u)) body = `<html><head><title>(3) ${USER.name} | Facebook</title><meta property="og:image" content="https://scontent.test.fbcdn.net/avatar.png"></head><body></body></html>`;
  else if (/\/reel\/999/.test(u)) body = '<html><head><title>Otro reel | Facebook</title></head><body><div role="main"><img src="https://scontent.test.fbcdn.net/big.png" width="300" height="300"></div></body></html>';
  else if (/big\.png/.test(u)) { body = BIG; type = 'image/png'; }
  else if (/\/reel\//.test(u)) body = '<html><head><title>Reel | Facebook</title><meta property="og:title" content="Reel de prueba · Ofertas de la semana"><meta property="og:description" content="Descripción del reel de prueba"><meta property="og:image" content="https://scontent.test.fbcdn.net/reel.png"></head><body></body></html>';
  else if (/favicon\.ico|fbcdn\.net/.test(u)) { body = PNG; type = 'image/png'; }
  else if (u.includes('/__fbp_test_posted')) { posted.push(JSON.parse(ev.request.postData || '{}')); body = 'ok'; type = 'text/plain'; }
  else if (u.startsWith('https://fonts.')) { body = ''; type = 'text/css'; }
  else { const m = u.match(/\/groups\/([^/?#]+)/); const g = m && GROUPS.find(x => x.slug === m[1]); body = g ? mockGroup(g) : '<h1>404</h1>'; code = g ? 200 : 404; }
  send('Fetch.fulfillRequest', {requestId: ev.requestId, responseCode: code, responseHeaders: [{name: 'Content-Type', value: type}], body: Buffer.from(body).toString('base64')}, sessionId);
}
const errors = [];
let swSession = null, swTarget = null;
const swEval = async expr => { const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}, swSession); if (process.env.DEBUG_SW) console.log('SW', JSON.stringify(r).slice(0, 400)); return r.result?.result?.value; };
listeners.push(async m => {
  if (m.method === 'Target.attachedToTarget') {
    const sid = m.params.sessionId;
    if (m.params.targetInfo.type === 'page') await send('Runtime.enable', {}, sid);
    if (m.params.targetInfo.type === 'service_worker' && /^chrome-extension:\/\/[a-p]{32}\/background\.js/.test(m.params.targetInfo.url)) { swSession = sid; swTarget = m.params.targetInfo.targetId; }
    send('Runtime.runIfWaitingForDebugger', {}, sid);
  }
  if (m.method === 'Fetch.requestPaused') fulfill(m.sessionId, m.params);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});

/* ---------- Pruebas ---------- */
let passed = 0, failed = 0;
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('condición no cumplida'); passed++; console.log(`  ✓ ${name}${typeof r === 'string' ? ' — ' + r : ''}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${String(e.message || e).split('\n')[0]}`); }
}
/* Interceptación a nivel de navegador: cubre también las ventanas que abre la extensión desde su primera petición */
await send('Fetch.enable', {patterns: [{urlPattern: 'https://www.facebook.com/*'}, {urlPattern: 'https://*.fbcdn.net/*'}, {urlPattern: 'https://arlizheredia.github.io/*'}, {urlPattern: 'https://fonts.*'}]});
const login = () => send('Storage.setCookies', {cookies: [{name: 'c_user', value: USER.id, domain: '.facebook.com', path: '/', secure: true}]});
await login();
await send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: false, flatten: true});
await send('Target.setDiscoverTargets', {discover: true});
const EXTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fbp-ext-'));
for (const n of fs.readdirSync(path.join(ROOT, 'extension'))) fs.copyFileSync(path.join(ROOT, 'extension', n), path.join(EXTDIR, n));
const ext = await send('Extensions.loadUnpacked', {path: EXTDIR});
console.log(`\nExtensión cargada: ${ext.result?.id || JSON.stringify(ext.error)}\nPublicación: ${POST_URL}\nGrupo:       ${GROUP_URL}\n`);
const {result: {targetId}} = await send('Target.createTarget', {url: 'about:blank'});
const {result: {sessionId: app}} = await send('Target.attachToTarget', {targetId, flatten: true});
await send('Runtime.enable', {}, app); await send('Page.enable', {}, app);
const ev = async expr => { const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}, app);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error'); return r.result?.result?.value; };
await send('Page.navigate', {url: APP_URL}, app);
for (let i = 0; i < 60; i++) { await sleep(250); try { if (await ev(`typeof S==='object'&&typeof Ext==='object'`)) break; } catch {} }
await sleep(1500);

/* Reloj acelerable: permite saltar las pausas de seguridad en el test sin tocar el código de la app */
await ev(`(()=>{const real=Date.now.bind(Date);window.__off=0;Date.now=()=>real()+window.__off})()`);
const fastForward = async () => ev(`(()=>{const G=gate();if(!G.ok&&G.reason!=='lock'&&G.reason!=='day'){window.__off+=G.until-Date.now()+1000;return true}return false})()`);
const pctSeen = [], statsSeen = [];
async function waitAuto(maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const p = await ev(`(()=>{const e=document.getElementById('apPct');return e?parseInt(e.textContent):null})()`); if (p != null) pctSeen.push(p);
    const st = await ev(`(document.getElementById('apStats')||{}).textContent||''`); if (st) statsSeen.push(st.replace(/\s+/g,' ').trim());
    await fastForward();
    if (await ev(`!S.run||!S.run.autoRunning`)) return;
    await sleep(700);
  }
  throw new Error('la publicación automática no terminó');
}

/* Las notificaciones de la extensión se registran sin mostrarse en el escritorio */
for (let i = 0; i < 20 && !swSession; i++) await sleep(250);
await swEval(`chrome.storage.session.set({dryNotify:true})`);
const dryCount = async () => +(await swEval(`chrome.storage.session.get('dryLog').then(v=>String((v.dryLog||[]).length))`));
console.log('1. Extensión');
await t('la app detecta la extensión', async () => (await ev(`Ext.ready`)) ? `v${await ev('Ext.version')}` : false);
await ev(`(()=>{localStorage.setItem('fbp.welcomed','true');S.groups=cleanGroups(${JSON.stringify(GROUPS.map(g => ({id: g.id, name: g.name, url: `https://www.facebook.com/groups/${g.slug}/`, active: true})))});persist.groups();
  srcEl.value=${JSON.stringify(POST_URL)};srcEl.dispatchEvent(new Event('input'));txtEl.value='¡Hola, comunidad de {grupo}!';txtEl.dispatchEvent(new Event('input'))})()`);
await t('el asistente detecta la extensión y activa la publicación automática', async () => {
  await ev(`document.getElementById('autoChip').click()`); await sleep(300);
  if (!(await ev(`document.getElementById('autoDlg').open&&document.getElementById('wzStatus').textContent.includes('detectada')`))) throw new Error('extensión no detectada en el asistente');
  if (!(await ev(`document.getElementById('wzOn').disabled`))) throw new Error('se podía activar sin aceptar el aviso');
  await ev(`document.getElementById('wzAck').click();document.getElementById('wzOn').click()`); await sleep(200);
  return (await ev(`S.settings.autoMode&&S.settings.autoTest&&!document.getElementById('autoDlg').open`)) ? 'activada en modo prueba' : false;
});
await t('muestra la cuenta de Facebook detectada con verificación, foto y nombre', async () => {
  await ev(`checkFb(true)`); await sleep(300);
  const r = await ev(`JSON.stringify({st:Fb.state,name:Fb.name,id:Fb.id,img:!!document.querySelector('#fbAcct img'),ok:!!document.querySelector('#fbAcct .bdg.ok'),txt:document.getElementById('fbAcct').textContent})`);
  const o = JSON.parse(r);
  if (o.st !== 'in' || o.name !== USER.name || o.id !== USER.id || !o.img || !o.ok) throw new Error(r);
  return `${o.name} (ID ${o.id})`;
});
await t('la vista previa muestra la miniatura y el título reales de la publicación', async () => {
  for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('#preview .lk-shot img')`)); i++) await sleep(300);
  const r = await ev(`JSON.stringify({img:!!document.querySelector('#preview .lk-shot img'),title:document.querySelector('#preview .lk-h')?.textContent})`);
  const o = JSON.parse(r);
  return o.img && /Reel de prueba/.test(o.title || '') ? o.title : (() => { throw new Error(r); })();
});
if (process.env.FBP_SHOTS) {
  await send('Emulation.setDeviceMetricsOverride', {width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false}, app); await sleep(500);
  const shot = await send('Page.captureScreenshot', {format: 'png'}, app);
  fs.writeFileSync(path.join(process.env.FBP_SHOTS, 'auto-publicar.png'), Buffer.from(shot.result.data, 'base64'));
  await ev(`document.getElementById('fbAcct').click()`); await sleep(300);
  const s2 = await send('Page.captureScreenshot', {format: 'png'}, app);
  fs.writeFileSync(path.join(process.env.FBP_SHOTS, 'auto-cuenta.png'), Buffer.from(s2.result.data, 'base64')); await ev(`closePop()`);
}
await t('si Facebook no da la miniatura directamente, la obtiene abriendo la publicación en segundo plano', async () => {
  const r = await ev(`Ext.call('preview',{url:'https://www.facebook.com/reel/999'},40000).then(r=>JSON.stringify({ok:r.ok,img:!!r.image,title:r.title}))`);
  const o = JSON.parse(r); return o.ok && o.img ? `miniatura obtenida («${o.title}»)` : (() => { throw new Error(r); })();
});
console.log('   (la vista previa con miniatura solo aparece sin archivos adjuntos; se adjunta la imagen después)');
await ev(`(async()=>{const c=document.createElement('canvas');c.width=60;c.height=60;const x=c.getContext('2d');x.fillStyle='#1877f2';x.fillRect(0,0,60,60);
  const b=await new Promise(r=>c.toBlob(r,'image/png'));addFiles([new File([b],'oferta.png',{type:'image/png'})])})()`);
await sleep(500);
await t('el selector de pausa está en la barra y no baja de 10 s', async () => {
  const r = await ev(`(()=>{const s=document.getElementById('paceSel');const v=[...s.options].map(o=>+o.value);s.value='120';s.dispatchEvent(new Event('change'));const p=S.settings.pause;S.settings.pause=60;persist.settings();renderSummary();return JSON.stringify({min:Math.min(...v),p})})()`);
  const o = JSON.parse(r); return o.min === 10 && o.p === 120 ? `mínimo ${o.min} s; cambio a ${o.p} s aplicado` : (() => { throw new Error(r); })();
});

console.log('2. Errores antes de publicar');
await send('Network.enable', {}, app);
await send('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1}, app); await sleep(400);
await t('sin Internet: aviso fijo y mensaje de error al pulsar Comenzar', async () => {
  await ev(`S.sel=new Set(['g1']);renderDest();renderSummary()`);
  const banner = await ev(`!document.getElementById('netBanner').hidden`);
  await ev(`document.getElementById('startBtn').click()`); await sleep(400);
  const r = await ev(`JSON.stringify({open:document.getElementById('confirmDlg').open,title:document.getElementById('cfTitle').textContent,check:document.getElementById('checkDlg').open})`);
  await ev(`document.getElementById('cfYes').click()`);
  const o = JSON.parse(r); return banner && o.open && /Sin conexión a Internet/.test(o.title) && !o.check ? o.title.replace(/^\w+/, '').trim() : (() => { throw new Error(banner + r); })();
});
await send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1}, app); await sleep(400);
await send('Storage.clearCookies', {});
await t('sin sesión de Facebook: mensaje de error con «Abrir Facebook»', async () => {
  await ev(`document.getElementById('startBtn').click()`);
  for (let i = 0; i < 30 && !(await ev(`document.getElementById('confirmDlg').open`)); i++) await sleep(300);
  const r = await ev(`JSON.stringify({title:document.getElementById('cfTitle').textContent,ok:document.getElementById('cfYes').textContent,chip:document.getElementById('fbAcct').textContent,check:document.getElementById('checkDlg').open})`);
  await ev(`document.getElementById('cfNo').click()`);
  const o = JSON.parse(r); return /No has iniciado sesión/.test(o.title) && o.ok === 'Abrir Facebook' && /Sin sesión/.test(o.chip) && !o.check ? 'bloquea el inicio y lo indica en la barra' : (() => { throw new Error(r); })();
});
await login(); await ev(`checkFb(true)`);

await t('límites: pausa mínima 10 s, máximo diario 500 por defecto y sin límite por hora', async () => {
  const r = await ev(`JSON.stringify({min:SAFE.MIN_PAUSE,day:cleanSettings({}).dayCap,mig:cleanSettings({dayCap:20,pause:60}).dayCap,keep:cleanSettings({v:2,dayCap:120}).dayCap,hourUI:!!document.getElementById('setHour'),p5:cleanSettings({pause:5}).pause})`);
  const o = JSON.parse(r);
  return o.min === 10 && o.day === 500 && o.mig === 500 && o.keep === 120 && !o.hourUI && o.p5 === 10 ? 'mínimo 10 s; 500/día (se migra desde 20); sin límite por hora' : (() => { throw new Error(r); })();
});
await t('el botón cambia a «Probar publicación automática»', async () => /Probar publicación automática/.test(await ev(`document.getElementById('startBtn').textContent`)));

console.log('3. Modo prueba');
await ev(`S.sel=new Set(['g1']);renderDest();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
await waitAuto();
await t('prepara la publicación en el grupo sin pulsar «Publicar»', async () => posted.length === 0 && (await ev(`S.run.testDone===true&&S.history[0].items[0].status==='pending'`)));
await t('«Todo bien: publicar de verdad» desactiva el modo prueba con un clic', async () => {
  await ev(`document.getElementById('aReal').click()`); await sleep(400);
  return (await ev(`S.settings.autoTest===false&&!S.run`)) === true;
});

console.log('4. Publicación automática real (Facebook simulado)');
const fbWindows = async () => (await send('Target.getTargets')).result.targetInfos.filter(t => t.type === 'page' && t.url.startsWith('https://www.facebook.com/')).length;
await ev(`S.sel=new Set(['g1']);renderDest();renderSummary()`);
await t('el botón cambia a «Comenzar publicación automática»', async () => /Comenzar publicación automática/.test(await ev(`document.getElementById('startBtn').textContent`)));
await ev(`openPreflight()`); for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await t('la comprobación previa muestra la cuenta con la que se publicará', async () => /Cuenta: Ana Pérez/.test(await ev(`document.getElementById('checkList').textContent`)));
await ev(`document.getElementById('checkGo').click()`);
await waitAuto(240000);
const p1 = posted.find(p => p.group === MAIN);
await t('publica en el grupo principal el texto personalizado con la URL', async () => {
  if (!p1) throw new Error('no se publicó');
  if (!p1.text.includes('¡Hola, comunidad de Grupo principal!') || !p1.text.includes(POST_URL)) throw new Error(JSON.stringify(p1.text));
  return JSON.stringify(p1.text);
});
await t('adjunta la imagen', async () => p1 && p1.files.length === 1 && p1.files[0].name === 'oferta.png' ? `${p1.files[0].name} (${p1.files[0].size} B)` : false);
await t('marca «Publicado» en el Historial', async () => (await ev(`S.history[0].items[0].status==='done'&&!S.history[0].items[0].review`)) === true);
await t('muestra la carga con porcentaje mientras publica', async () => {
  const mid = pctSeen.filter(p => p > 0 && p < 100), fin = await ev(`document.getElementById('runCount').textContent`);
  return mid.length && /100 %/.test(fin) ? `valores vistos: ${[...new Set(pctSeen)].join(' → ')} %; final «${fin}»` : (() => { throw new Error(JSON.stringify(pctSeen) + ' ' + fin); })();
});
await t('muestra los grupos publicados como X / Y', async () => {
  const u = [...new Set(statsSeen)];
  return u.some(x => /^0\/1grupos publicados$/.test(x.replace(/ /g,'').replace('grupospublicados','grupos publicados'))) ? u.join(' → ') : (() => { throw new Error(JSON.stringify(u)); })();
});
await t('al terminar, cierra la ventana de Facebook', async () => { await sleep(800); const n = await fbWindows(); return n === 0 ? 'ventana cerrada' : (() => { throw new Error(n + ' ventanas abiertas'); })(); });
await ev(`closeRun(true)`);

console.log('5. Interrupción y reanudación');
const appReady = async () => { for (let i = 0; i < 60; i++) { await sleep(250); try { if (await ev(`typeof S==='object'&&typeof Ext==='object'&&Ext.ready`)) break; } catch {} } await sleep(800);
  await ev(`(()=>{const real=Date.now.bind(Date);window.__off=window.__off||0;Date.now=()=>real()+window.__off})()`); };
listeners.push(m => { if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', {accept: true}, m.sessionId); });
await fastForward();
await ev(`S.sel=new Set(['g5','g6']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
for (let i = 0; i < 80 && !(await ev(`S.history[0].items[0].status==='done'`)); i++) await sleep(400);
const off = await ev(`window.__off`);
await ev(`S.history[0].items[1].inflight=Date.now();persist.history()`);
await send('Page.navigate', {url: APP_URL}, app); await appReady(); await ev(`window.__off=${off}`);
await t('tras cerrar o recargar a mitad, Publicar ofrece continuar con el progreso', async () => {
  const r = await ev(`JSON.stringify({vis:!document.getElementById('resumeBanner').hidden,txt:document.getElementById('resumeBanner').textContent})`); const o = JSON.parse(r);
  return o.vis && /1 de 2 grupos completados \(50 %\)/.test(o.txt) && /Continuar publicación automática/.test(o.txt) ? '1 de 2 grupos completados (50 %)' : (() => { throw new Error(r); })();
});
await fastForward();
await ev(`document.getElementById('resumeGo').click()`); await sleep(500);
await t('pregunta si el grupo que se estaba enviando llegó a publicarse (evita duplicados)', async () => {
  const r = await ev(`JSON.stringify({open:document.getElementById('confirmDlg').open,t:document.getElementById('cfTitle').textContent,no:document.getElementById('cfNo').textContent})`); const o = JSON.parse(r);
  if (!o.open || !/llegó a publicar/.test(o.t)) throw new Error(r);
  await ev(`document.getElementById('cfNo').click()`); return o.no;
});
await waitAuto(240000);
await t('continúa automáticamente y completa los grupos que faltaban', async () => (await ev(`S.history[0].items.every(i=>i.status==='done')`)) && posted.filter(p => /^200000000[56]$/.test(p.group)).length === 2);
await ev(`closeRun(true)`); await sleep(300);
await t('al completarse, desaparece el aviso de publicación a medias', async () => (await ev(`load('fbp.run',null)===null&&document.getElementById('resumeBanner').hidden`)) === true);

console.log('5b. Reinicio de la extensión durante la pausa (Chrome apaga el service worker)');
await fastForward();
await ev(`S.sel=new Set(['g9','g10']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
for (let i = 0; i < 80 && !(await ev(`S.history[0].items[0].status==='done'`)); i++) await sleep(400);
const winsBefore = await fbWindows();
await swEval(`self.__fbpMark=1`);
const oldSw = swTarget; await send('ServiceWorker.enable', {}, app); await send('ServiceWorker.stopAllWorkers', {}, app); await sleep(1500);
await waitAuto(240000); await sleep(1000);
await t('tras reiniciarse la extensión sigue publicando en la misma ventana', async () => {
  const st = await ev(`JSON.stringify(S.history[0].items.map(i=>i.status))`);
  const restarted = (await swEval(`typeof self.__fbpMark`)) === 'undefined';
  if (!restarted) throw new Error('el service worker no llegó a reiniciarse: la prueba no sería válida');
  return st === '["done","done"]' && winsBefore === 1 ? `ventanas durante la publicación: ${winsBefore}; service worker reiniciado: sí` : (() => { throw new Error(st + ' wins=' + winsBefore); })();
});
await t('al terminar cierra todas las ventanas de Facebook, aunque la extensión se haya reiniciado', async () => { const n = await fbWindows(); return n === 0 ? 'ninguna ventana abierta' : (() => { throw new Error(n + ' ventanas abiertas'); })(); });
await t('el aviso transitorio «Publicando» no se trata como mensaje de Facebook', async () => (await ev(`S.history[0].items.every(i=>!i.fbMsg)&&!(S.run&&S.run.msgs&&S.run.msgs.length)`)) === true);
await ev(`closeRun(true)`);

console.log('5c. Enlace sin mostrarse en el texto');
await fastForward();
await ev(`S.media.slice().forEach(m=>removeMedia(m.id));S.settings.appendUrl=false;persist.settings();S.sel=new Set(['g11']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
await waitAuto(240000);
const p11 = posted.find(p => p.group === '2000000011');
await t('publica la tarjeta de la publicación sin la URL en el texto', async () => {
  if (!p11) throw new Error('no se publicó');
  return p11.text.trim() === '¡Hola, comunidad de Grupo once!' && p11.preview && p11.preview.startsWith(POST_URL) ? `texto «${p11.text.trim()}» + tarjeta de ${p11.preview}` : (() => { throw new Error(JSON.stringify(p11)); })();
});
await t('con imágenes adjuntas, el enlace se mantiene en el texto para no perderlo', async () => { const p1 = posted.find(p => p.group === MAIN); return p1.text.includes(POST_URL) && p1.files.length === 1; });
await ev(`closeRun(true)`);

console.log('5d. Trabajar mientras publica');
await t('las pausas usan un temporizador en segundo plano (Web Worker) permitido por la CSP', async () => (await ev(`(async()=>{const t=performance.now();await wsleep(60);return performance.now()-t>=50})()`)) === true);
await fastForward();
await ev(`S.settings.autoWin='nofocus';persist.settings();S.sel=new Set(['g12']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
let winInfo = null, badges = new Set();
for (let i = 0; i < 60; i++) {
  const w = await swEval(`chrome.windows.getAll({populate:true}).then(ws=>JSON.stringify(ws.filter(w=>w.tabs.some(t=>(t.url||t.pendingUrl||'').includes('facebook.com/groups'))).map(w=>({f:w.focused,w:w.width,s:w.state}))))`);
  if (w && w !== '[]') winInfo = winInfo || w;
  const b = await swEval(`chrome.action.getBadgeText({})`); if (b) badges.add(b);
  if (await ev(`!S.run||!S.run.autoRunning`)) break; await sleep(500);
}
await t('modo recomendado: ventana pequeña que no quita el foco', async () => { const w = JSON.parse(winInfo || '[]')[0]; return w && w.f === false && w.w <= 600 ? `ventana sin foco (${w.w}px de ancho)` : (() => { throw new Error(winInfo); })(); });
await t('muestra el porcentaje en el icono de la extensión', async () => [...badges].some(b => /%$/.test(b)) ? [...badges].join(' → ') : (() => { throw new Error(JSON.stringify([...badges])); })());
await t('publica también así', async () => posted.some(p => p.group === '2000000012'));
await ev(`closeRun(true)`);
await fastForward();
await ev(`S.settings.autoWin='tab';persist.settings();S.sel=new Set(['g13']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
let tabInfo = null;
for (let i = 0; i < 60; i++) {
  const r = await swEval(`chrome.tabs.query({}).then(ts=>{const fb=ts.find(t=>(t.url||t.pendingUrl||'').includes('facebook.com/groups'));const app=ts.find(t=>(t.url||'').includes('facebook-publisher.html'));return fb&&app?JSON.stringify({same:fb.windowId===app.windowId,fbActive:fb.active,appActive:app.active}):''})`);
  if (r) tabInfo = tabInfo || r;
  if (await ev(`!S.run||!S.run.autoRunning`)) break; await sleep(500);
}
await t('modo pestaña: Facebook en una pestaña oculta junto a la app, que sigue visible', async () => { const o = JSON.parse(tabInfo || '{}'); return o.same && o.fbActive === false && o.appActive === true && posted.some(p => p.group === '2000000013') ? 'pestaña en segundo plano; la app sigue en primer plano' : (() => { throw new Error(tabInfo); })(); });
await t('al terminar se cierra la pestaña de Facebook y se limpia el icono', async () => { await sleep(800); const n = await swEval(`chrome.tabs.query({}).then(ts=>ts.filter(t=>(t.url||'').includes('facebook.com/groups')).length)`); const b = await swEval(`chrome.action.getBadgeText({})`); return n === 0 && b === '' ? 'sin pestañas abiertas' : (() => { throw new Error(n + ' badge=' + b); })(); });
await ev(`closeRun(true);S.settings.autoWin='nofocus';persist.settings()`);

console.log('5e. Reintentos automáticos');
const offline = on => send('Network.emulateNetworkConditions', {offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1}, app);
await send('Network.enable', {}, app);
await fastForward();
await ev(`S.settings.retries=2;S.settings.retryEvery=5;persist.settings();S.sel=new Set(['g14']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await offline(true); await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
let sawRetry = '';
for (let i = 0; i < 40 && !sawRetry; i++) { sawRetry = await ev(`S.run&&S.run.retry?document.getElementById('runMain').textContent.match(/Reintento \\d+ de \\d+/)?.[0]||'retry':''`); await sleep(300); }
await offline(false);
await waitAuto(120000);
await t('si se corta la conexión, espera y reintenta; al volver, continúa sola', async () => sawRetry && posted.some(p => p.group === '2000000014') && (await ev(`S.history[0].items[0].status`)) === 'done' ? `${sawRetry} → publicado al volver la conexión` : (() => { throw new Error(sawRetry); })());
await ev(`closeRun(true)`);
await fastForward();
await ev(`S.sel=new Set(['g15']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await offline(true); await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
for (let i = 0; i < 60 && !(await ev(`!!(S.run&&S.run.stop&&!S.run.autoRunning)`)); i++) await sleep(500);
await t('si no se resuelve, agota los reintentos y se detiene por completo', async () => { const m = await ev(`S.run&&S.run.stopMsg||''`); return /Se agotaron los 2 reintentos/.test(m) && !posted.some(p => p.group === '2000000015') ? m.slice(0, 90) + '…' : (() => { throw new Error(m); })(); });
await offline(false);
await ev(`(()=>{const h=S.history[0];h.items.forEach(i=>{if(i.status==='pending'){i.status='skipped';i.error='Descartado'}});persist.history();closeRun(true);S.settings.retries=10;S.settings.retryEvery=20;persist.settings();try{localStorage.removeItem('fbp.run')}catch(e){};renderResume()})()`);

console.log('6. Mensajes de Facebook');
await t('las notificaciones del sistema están desactivadas por defecto y no se envían', async () => (await ev(`cleanSettings({}).sysNotify`)) === false && (await dryCount()) === 0);
await ev(`S.settings.sysNotify=true;persist.settings()`);
await fastForward();
await ev(`S.sel=new Set(['g7','g8']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
await waitAuto(240000);
await t('captura el texto exacto del mensaje que muestra Facebook', async () => {
  const m = await ev(`S.history[0].items[0].fbMsg||''`);
  return /puede tardar unos minutos en aparecer/.test(m) && (await ev(`S.history[0].items[0].status`)) === 'done' ? `«${m}»` : (() => { throw new Error(m); })();
});
await t('lo muestra en «Mensajes de Facebook» durante la publicación', async () => /Mensajes de Facebook \(2\)/.test(await ev(`document.getElementById('runMain').textContent`)));
await t('envía una notificación del sistema con el grupo y el mensaje', async () => {
  if (!swSession) throw new Error('sin acceso al service worker');
  const n = await dryCount();
  return +n >= 1 ? `${n} notificación(es) creadas` : (() => { throw new Error('notificaciones: ' + n); })();
});
await t('no se detiene por un fallo sin riesgo: termina y resume «con incidencias»', async () => {
  const r = await ev(`JSON.stringify({t:document.querySelector('#runMain h2')?.textContent,txt:document.getElementById('runMain').textContent,retry:!!document.getElementById('rRetry')})`); const o = JSON.parse(r);
  return /terminada con incidencias/.test(o.t) && /Grupo solo administradores/.test(o.txt) && /El grupo no permite publicar/.test(o.txt) && o.retry ? 'lista el grupo fallido con su motivo y ofrece reintentar' : (() => { throw new Error(r); })();
});
await t('al terminar con fallos envía una notificación con el resumen', async () => (await dryCount()) >= 3);
await ev(`closeRun(true)`); await sleep(300);
await t('tras cerrar, Publicar mantiene el aviso de incidencias con «Reintentar»', async () => {
  const r = await ev(`JSON.stringify({vis:!document.getElementById('resumeBanner').hidden,txt:document.getElementById('resumeBanner').textContent})`); const o = JSON.parse(r);
  if (!o.vis || !/terminada con incidencias/.test(o.txt) || !/Grupo solo administradores \(el grupo no permite publicar\)/.test(o.txt)) throw new Error(r);
  await ev(`document.getElementById('incOk').click()`); await sleep(200);
  return (await ev(`document.getElementById('resumeBanner').hidden`)) ? 'visible hasta pulsar «Cerrar aviso»' : (() => { throw new Error('no se cerró'); })();
});
await t('una restricción del grupo («solo administradores») omite ese grupo sin bloquear la cuenta', async () => {
  const r = await ev(`JSON.stringify({s:S.history[0].items[1].status,e:S.history[0].items[1].error,lock:!!(S.lock&&S.lock>Date.now())})`); const o = JSON.parse(r);
  return o.s === 'skipped' && /Solo los administradores/.test(o.e) && !o.lock ? o.e : (() => { throw new Error(r); })();
});
await t('el mensaje queda en el Historial', async () => { await ev(`location.hash='historial'`); await sleep(400); return /Facebook: «Tu publicación se compartió/.test(await ev(`document.getElementById('histBox').textContent`)); });
await ev(`location.hash='publicar'`);

await ev(`S.sel=new Set(['g2','g3','g4']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await ev(`document.getElementById('checkGo').click()`);
await waitAuto(240000);
const items = await ev(`JSON.stringify(S.history[0].items.map(i=>({n:i.name,s:i.status,r:i.review||null,e:i.error||null})))`).then(JSON.parse);
await t('detecta «pendiente de aprobación»', async () => items[0].s === 'done' && items[0].r === 'awaiting');
await t('omite el grupo donde no es miembro y sigue', async () => items[1].s === 'skipped' && /miembro/.test(items[1].e || '') ? items[1].e : false);
await t('el mensaje de «pendiente» también se registra', async () => /pendiente/.test(await ev(`S.history[0].items[0].fbMsg||''`)));
await t('un aviso de bloqueo abre una ventana con el mensaje de Facebook', async () => {
  const r = await ev(`JSON.stringify({open:document.getElementById('confirmDlg').open,t:document.getElementById('cfTitle').textContent,x:document.getElementById('cfText').textContent})`); const o = JSON.parse(r);
  if (!o.open || !/Facebook mostró un aviso en «Grupo con aviso»/.test(o.t) || !/demasiado rápido/.test(o.x)) throw new Error(r);
  await ev(`document.getElementById('cfYes').click()`); return o.t.replace(/^report/, '');
});
await t('ante un aviso de Facebook se detiene y bloquea 24 h', async () => items[2].s === 'pending' && (await ev(`S.lock>Date.now()`)) && /demasiado rápido/.test(await ev(`S.run.stopMsg`)));
await t('si se detiene por un aviso, deja abierta la ventana para revisarla', async () => (await fbWindows()) === 1);
await ev(`closeRun(true)`);
await ev(`S.sel=new Set(['g4']);renderDest();renderSummary();openPreflight()`);
for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
await t('con bloqueo activo, la comprobación muestra el motivo exacto y la opción «Publicar de todas maneras»', async () => {
  const r = await ev(`JSON.stringify({dis:document.getElementById('checkGo').disabled,ov:!document.getElementById('checkOverride').hidden,list:document.getElementById('checkList').textContent,btn:(document.getElementById('checkForce')||{}).textContent})`); const o = JSON.parse(r);
  return o.dis && o.ov && /Motivo: «Estás publicando demasiado rápido/.test(o.list) && o.btn === 'Publicar de todas maneras' ? 'botón visible con el motivo' : (() => { throw new Error(r); })();
});
await t('«Publicar de todas maneras» pide confirmación, quita el bloqueo y permite empezar', async () => {
  await ev(`document.getElementById('checkForce').click()`); await sleep(300);
  if (!(await ev(`document.getElementById('confirmDlg').open&&/de todas maneras/.test(document.getElementById('cfTitle').textContent)`))) throw new Error('sin confirmación');
  await ev(`document.getElementById('cfYes').click()`);
  for (let i = 0; i < 30 && !(await ev(`document.getElementById('checkDlg').open`)); i++) await sleep(300);
  const r = await ev(`JSON.stringify({lock:S.lock,go:document.getElementById('checkGo').disabled,ov:document.getElementById('checkOverride').hidden})`); const o = JSON.parse(r);
  await ev(`document.getElementById('checkDlg').close()`);
  return !o.lock && !o.go && o.ov ? 'bloqueo quitado; «Empezar» habilitado' : (() => { throw new Error(r); })();
});
await t('respeta la pausa entre grupos (no publica dos seguidos sin esperar)', async () => (await ev(`(()=>{const t=S.history.flatMap(h=>h.items).filter(i=>i.status==='done').map(i=>i.at).sort((a,b)=>a-b);for(let i=1;i<t.length;i++)if(t[i]-t[i-1]<S.settings.pause*1000)return false;return true})()`)) === true);
await t('solo se publicó en los grupos correctos', async () => posted.length === 11 && posted.map(p => p.group).join() === `${MAIN},2000000005,2000000006,2000000009,2000000010,2000000011,2000000012,2000000013,2000000014,2000000007,2000000002` ? posted.map(p => p.group).join(', ') : false);
console.log('8. Autoactualización de la extensión');
await t('con la versión publicada igual a la instalada, no hay actualización', async () => { const r = await ev(`Ext.call('checkUpdate').then(JSON.stringify)`); const o = JSON.parse(r); return o.ok && !o.available ? `instalada ${o.current}, publicada ${o.latest}` : (() => { throw new Error(r); })(); });
UPD.serveNew = true;
await t('detecta una versión nueva publicada', async () => { const r = await ev(`Ext.call('checkUpdate').then(JSON.stringify)`); const o = JSON.parse(r); return o.ok && o.available && o.latest === '9.9.9' ? `${o.current} → ${o.latest}` : (() => { throw new Error(r); })(); });
await ev(`sessionStorage.removeItem('fbp.updTried');extCheckUpdate(false)`);
let updTarget = null;
for (let i = 0; i < 30 && !updTarget; i++) { await sleep(300); updTarget = (await send('Target.getTargets')).result.targetInfos.find(t => t.type === 'page' && t.url.includes('/update.html')); }
await t('la app abre el actualizador automáticamente', async () => updTarget ? updTarget.url.replace(/^chrome-extension:\/\/[a-p]+/, 'chrome-extension://…') : (() => { throw new Error('sin pestaña de actualización'); })());
const {result: {sessionId: upd}} = await send('Target.attachToTarget', {targetId: updTarget.targetId, flatten: true});
await send('Runtime.enable', {}, upd);
const uev = async expr => { const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}, upd); if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description || ''); return r.result?.result?.value; };
await sleep(800);
await t('la primera vez pide elegir la carpeta de la extensión', async () => (await uev(`!document.getElementById('pick').hidden&&/Elegir carpeta/.test(document.body.textContent)`)) === true);
await t('rechaza una carpeta que no es la de la extensión', async () => (await uev(`(async()=>{const d=await navigator.storage.getDirectory();const o=await d.getDirectoryHandle('otra',{create:true});return __fbpUpdate.verifyFolder(o)})()`)) === false);
await uev(`(async()=>{const d=await navigator.storage.getDirectory();const e=await d.getDirectoryHandle('ext',{create:true});const w=await (await e.getFileHandle('manifest.json',{create:true})).createWritable();await w.write(JSON.stringify(chrome.runtime.getManifest()));await w.close()})()`);
UPD.tamper = true;
await t('si un archivo está alterado, no instala nada', async () => {
  const r = await uev(`(async()=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('ext');try{await __fbpUpdate.doUpdate(d,{noReload:true});return 'instalado'}catch(e){const m=JSON.parse(await (await (await d.getFileHandle('manifest.json')).getFile()).text());return e.message+' | versión en carpeta: '+m.version}})()`);
  return /integridad/.test(r) && !/9\.9\.9/.test(r) ? r : (() => { throw new Error(r); })();
});
UPD.tamper = false;
await t('descarga, verifica e instala la versión nueva en la carpeta de la extensión', async () => {
  const r = await uev(`(async()=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('ext');const res=await __fbpUpdate.doUpdate(d,{noReload:true});
    const m=JSON.parse(await (await (await d.getFileHandle('manifest.json')).getFile()).text());const fb=await (await (await d.getFileHandle('fb.js')).getFile()).arrayBuffer();
    return JSON.stringify({res,ver:m.version,fbHash:await __fbpUpdate.sha256(fb)})})()`);
  const o = JSON.parse(r), list = JSON.parse(fs.readFileSync(path.join(NEWEXT, 'files.json'), 'utf8'));
  return o.res.updated && o.ver === '9.9.9' && o.fbHash === list.files.find(f => f.name === 'fb.js').sha256 ? `instalada ${o.ver}; archivos verificados` : (() => { throw new Error(r); })();
});
UPD.serveNew = false;
await send('Target.closeTarget', {targetId: updTarget.targetId});
/* Último tramo: los archivos nuevos ya están en la carpeta de la extensión → se reinicia y se activa */
for (const n of fs.readdirSync(NEWEXT)) fs.copyFileSync(path.join(NEWEXT, n), path.join(EXTDIR, n));
await ev(`window.__beforeReload=1`);
await swEval(`chrome.storage.local.set({updatedTo:'9.9.9'}).then(()=>{setTimeout(()=>chrome.runtime.reload(),100);return 1})`);
let after = null;
for (let i = 0; i < 60; i++) { await sleep(500); try { after = await ev(`JSON.stringify({fresh:!window.__beforeReload,ver:typeof Ext==='object'&&Ext.ready?Ext.version:null,snack:document.querySelector('#snack .msg')?.textContent||''})`); const o = JSON.parse(after); if (o.fresh && o.ver) { await sleep(1500); after = await ev(`JSON.stringify({fresh:!window.__beforeReload,ver:Ext.version,snack:document.querySelector('#snack .msg')?.textContent||''})`); break; } } catch {} }
await t('tras instalarse, la extensión se reinicia, la app se recarga sola y avisa de la versión nueva', async () => { const o = JSON.parse(after || '{}'); return o.fresh && o.ver === '9.9.9' && /actualizada a la versión 9\.9\.9/.test(o.snack) ? `«${o.snack}»` : (() => { throw new Error(after); })(); });

await t('sin errores de JavaScript en la app', async () => errors.length === 0 || (() => { throw new Error(errors.slice(0, 3).join(' | ')); })());

console.log(`\n${passed} correctas, ${failed} fallidas\n`);
chrome.kill(); try { fs.rmSync(profile, {recursive: true, force: true}); } catch {}
process.exit(failed ? 1 : 0);
