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
  {id: 'g4', slug: '2000000004', name: 'Grupo con aviso', mode: 'block'}
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
  '--no-default-browser-check', `--user-data-dir=${profile}`, '--window-size=1280,900'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
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
<div role="main"><h1>${g.name}</h1>${composer}<div role="feed" id="feed"></div></div>
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
  const addF=fs=>{[...fs].forEach(f=>{files.push(f);const i=document.createElement('img');i.src=URL.createObjectURL(f);att.appendChild(i)});upd()};
  tb.addEventListener('paste',e=>{e.preventDefault();const t=e.clipboardData.getData('text/plain');if(t)tb.innerText+=t;if(e.clipboardData.files.length)addF(e.clipboardData.files);upd()});
  fi.addEventListener('change',()=>addF(fi.files));
  pb.addEventListener('click',async()=>{
    if(pb.getAttribute('aria-disabled')==='true')return;
    if(MODE==='block'){msg('Estás publicando demasiado rápido. Se ha bloqueado temporalmente esta función.');return}
    await fetch('https://www.facebook.com/__fbp_test_posted',{method:'POST',body:JSON.stringify({group:${JSON.stringify(g.slug)},text:tb.innerText,files:files.map(f=>({name:f.name,type:f.type,size:f.size}))})});
    d.remove();
    if(MODE==='pending')msg('Tu publicación está pendiente. Los administradores la revisarán antes de que aparezca en el grupo.');
  });
});
</script></body></html>`;
}
function fulfill(sessionId, ev) {
  const u = ev.request.url; let body = '', type = 'text/html; charset=utf-8', code = 200;
  if (u.startsWith(APP_URL)) body = appHtml;
  else if (u.includes('/__fbp_test_posted')) { posted.push(JSON.parse(ev.request.postData || '{}')); body = 'ok'; type = 'text/plain'; }
  else if (u.startsWith('https://fonts.')) { body = ''; type = 'text/css'; }
  else { const m = u.match(/\/groups\/([^/?#]+)/); const g = m && GROUPS.find(x => x.slug === m[1]); body = g ? mockGroup(g) : '<h1>404</h1>'; code = g ? 200 : 404; }
  send('Fetch.fulfillRequest', {requestId: ev.requestId, responseCode: code, responseHeaders: [{name: 'Content-Type', value: type}], body: Buffer.from(body).toString('base64')}, sessionId);
}
const errors = [];
listeners.push(async m => {
  if (m.method === 'Target.attachedToTarget') {
    const sid = m.params.sessionId;
    if (m.params.targetInfo.type === 'page') await send('Runtime.enable', {}, sid);
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
await send('Fetch.enable', {patterns: [{urlPattern: 'https://www.facebook.com/*'}, {urlPattern: 'https://arlizheredia.github.io/*'}, {urlPattern: 'https://fonts.*'}]});
await send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: true});
await send('Target.setDiscoverTargets', {discover: true});
const ext = await send('Extensions.loadUnpacked', {path: path.join(ROOT, 'extension')});
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
async function waitAuto(maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await fastForward();
    if (await ev(`!S.run||!S.run.autoRunning`)) return;
    await sleep(700);
  }
  throw new Error('la publicación automática no terminó');
}

console.log('1. Extensión');
await t('la app detecta la extensión', async () => (await ev(`Ext.ready`)) ? `v${await ev('Ext.version')}` : false);
await ev(`(()=>{localStorage.setItem('fbp.welcomed','true');S.groups=cleanGroups(${JSON.stringify(GROUPS.map(g => ({id: g.id, name: g.name, url: `https://www.facebook.com/groups/${g.slug}/`, active: true})))});persist.groups();
  S.settings.autoMode=true;S.settings.autoTest=true;persist.settings();
  srcEl.value=${JSON.stringify(POST_URL)};srcEl.dispatchEvent(new Event('input'));txtEl.value='¡Hola, comunidad de {grupo}!';txtEl.dispatchEvent(new Event('input'))})()`);
await ev(`(async()=>{const c=document.createElement('canvas');c.width=60;c.height=60;const x=c.getContext('2d');x.fillStyle='#1877f2';x.fillRect(0,0,60,60);
  const b=await new Promise(r=>c.toBlob(r,'image/png'));addFiles([new File([b],'oferta.png',{type:'image/png'})])})()`);
await sleep(500);
await t('el botón cambia a «Probar publicación automática»', async () => /Probar publicación automática/.test(await ev(`document.getElementById('startBtn').textContent`)));

console.log('2. Modo prueba');
await ev(`S.sel=new Set(['g1']);openPreflight();document.getElementById('checkGo').click()`);
await waitAuto();
await t('prepara la publicación en el grupo sin pulsar «Publicar»', async () => posted.length === 0 && (await ev(`S.run.testDone===true&&S.history[0].items[0].status==='pending'`)));
await ev(`closeRun(true)`);

console.log('3. Publicación automática real (Facebook simulado)');
await ev(`S.settings.autoTest=false;persist.settings();S.sel=new Set(['g1','g2','g3','g4']);renderDest();renderSummary()`);
await t('el botón cambia a «Comenzar publicación automática»', async () => /Comenzar publicación automática/.test(await ev(`document.getElementById('startBtn').textContent`)));
await ev(`openPreflight();document.getElementById('checkGo').click()`);
await waitAuto(240000);
const items = await ev(`JSON.stringify(S.history[0].items.map(i=>({n:i.name,s:i.status,r:i.review||null,e:i.error||null})))`).then(JSON.parse);
const p1 = posted.find(p => p.group === MAIN);
await t('publica en el grupo principal el texto personalizado con la URL', async () => {
  if (!p1) throw new Error('no se publicó');
  if (!p1.text.includes('¡Hola, comunidad de Grupo principal!') || !p1.text.includes(POST_URL)) throw new Error(JSON.stringify(p1.text));
  return JSON.stringify(p1.text);
});
await t('adjunta la imagen', async () => p1 && p1.files.length === 1 && p1.files[0].name === 'oferta.png' ? `${p1.files[0].name} (${p1.files[0].size} B)` : false);
await t('marca «Publicado» en el Historial', async () => items[0].s === 'done' && !items[0].r);
await t('detecta «pendiente de aprobación»', async () => items[1].s === 'done' && items[1].r === 'awaiting');
await t('omite el grupo donde no es miembro y sigue', async () => items[2].s === 'skipped' && /miembro/.test(items[2].e || '') ? items[2].e : false);
await t('ante un aviso de Facebook se detiene y bloquea 24 h', async () => items[3].s === 'pending' && (await ev(`S.lock>Date.now()`)) && /demasiado rápido/.test(await ev(`S.run.stopMsg`)));
await t('respeta la pausa entre grupos (no publica dos seguidos sin esperar)', async () => (await ev(`(()=>{const t=S.history[0].items.filter(i=>i.status==='done').map(i=>i.at).sort();return t.length<2||t[1]-t[0]>=S.settings.pause*1000})()`)) === true);
await t('solo se publicó en los grupos correctos', async () => posted.length === 2 && posted.map(p => p.group).join() === `${MAIN},2000000002` ? posted.map(p => p.group).join(', ') : false);
await t('sin errores de JavaScript en la app', async () => errors.length === 0 || (() => { throw new Error(errors.slice(0, 3).join(' | ')); })());

console.log(`\n${passed} correctas, ${failed} fallidas\n`);
chrome.kill(); try { fs.rmSync(profile, {recursive: true, force: true}); } catch {}
process.exit(failed ? 1 : 0);
