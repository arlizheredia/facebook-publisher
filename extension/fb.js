/* Facebook Publisher · publicación en un grupo (se ejecuta en facebook.com con la sesión del usuario).
 * Pasos: abrir «Escribe algo…», pegar el texto, adjuntar archivos, pulsar «Publicar» y comprobar el resultado.
 * Si Facebook muestra un aviso de bloqueo o restricción, se detiene y lo comunica para que la app pare. */
(() => {
  if (window.__fbpAuto) return;
  window.__fbpAuto = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const label = el => ((el.getAttribute && el.getAttribute('aria-label')) || el.innerText || '').replace(/\s+/g, ' ').trim();
  const fullText = el => ((el.innerText || '') + ' ' + ((el.getAttribute && el.getAttribute('aria-label')) || '')).replace(/\s+/g, ' ').trim();
  async function waitFor(fn, ms = 15000, step = 300) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(step); }
    return null;
  }
  function click(el) {
    el.scrollIntoView({block: 'center'});
    const o = {bubbles: true, cancelable: true, view: window};
    el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }
  const progress = step => { try { chrome.runtime.sendMessage({from: 'fb', type: 'progress', step}); } catch {} };

  const RX = {
    composer: /(escribe algo|write something|crea una publicaci[oó]n|create a (public )?post|qu[eé] est[aá]s pensando|what'?s on your mind)/i,
    join: /^(unirte al grupo|join group|unirse al grupo)$/i,
    post: /^(publicar|post)$/i,
    photo: /(foto\/v[ií]deo|photo\/video)/i,
    pending: /(pendiente|pending|se est[aá] revisando|being reviewed|aprob(ar|aci[oó]n)|approv(e|al))/i,
    block: /(demasiado r[aá]pido|going too fast|too fast|bloqueado temporalmente|bloqueo temporal|temporarily blocked|you'?re temporarily|no puedes publicar|you can'?t post|no puedes usar esta funci[oó]n|can'?t use this feature|cuenta (est[aá] )?restringida|account (is )?restricted|confirma tu identidad|confirm your identity|uso indebido de esta funci[oó]n|misusing this feature|va en contra de nuestras normas|goes against our community standards)/i
  };
  const dialogs = () => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(vis);
  const textboxIn = d => [...d.querySelectorAll('[contenteditable=true][role=textbox],[contenteditable=true]')].find(vis);
  const composerDialog = () => dialogs().find(d => textboxIn(d));
  const postButton = d => [...d.querySelectorAll('[role=button],button')].filter(vis).find(b => RX.post.test(label(b)));
  function alertText(exclude) {
    for (const n of [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert]')].filter(vis)) {
      if (exclude && exclude.has(n)) continue;
      const t = fullText(n);
      if (RX.block.test(t)) return t.slice(0, 240);
    }
    return null;
  }
  function b64ToFile(f) {
    const bin = atob(f.data.replace(/^data:[^,]*,/, ''));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], f.name, {type: f.type});
  }
  function pasteInto(el, dt) {
    el.focus();
    return el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
  }
  const attachedCount = d => d.querySelectorAll('img[src^="blob:"],video[src^="blob:"],img[src^="data:"]').length;

  async function post(job) {
    if (/\/login|checkpoint/.test(location.pathname)) return {ok: false, step: 'login', blocked: /checkpoint/.test(location.pathname), error: 'Inicia sesión en Facebook en este navegador y vuelve a intentarlo'};
    progress('Esperando a que cargue el grupo…');
    await waitFor(() => document.querySelector('[role=main]'), 20000);
    await sleep(1500);
    const pre = alertText();
    if (pre) return {ok: false, blocked: true, step: 'load', error: pre};

    progress('Abriendo el cuadro de publicación…');
    let d = composerDialog();
    if (!d) {
      const btn = await waitFor(() => [...document.querySelectorAll('[role=button],[role=main] span')].filter(vis).find(b => RX.composer.test(fullText(b)) && fullText(b).length < 80), 15000);
      if (!btn) {
        const join = [...document.querySelectorAll('[role=button]')].filter(vis).some(b => RX.join.test(label(b)));
        return {ok: false, step: 'composer', error: join ? 'No eres miembro de este grupo' : 'No se encontró el cuadro «Escribe algo…» (puede que el grupo no permita publicar)'};
      }
      click(btn.closest('[role=button]') || btn);
      d = await waitFor(composerDialog, 15000);
    }
    if (!d) return {ok: false, step: 'dialog', error: 'No se abrió el cuadro de publicación'};
    const tb = textboxIn(d);
    await sleep(500);

    if (job.text) {
      progress('Escribiendo el texto…');
      const dt = new DataTransfer(); dt.setData('text/plain', job.text);
      pasteInto(tb, dt);
      await sleep(700);
      if (!tb.innerText.trim()) { tb.focus(); document.execCommand('insertText', false, job.text); await sleep(500); }
      if (!tb.innerText.trim()) return {ok: false, step: 'text', error: 'No se pudo escribir el texto'};
    }

    if (job.files.length) {
      progress(`Adjuntando ${job.files.length} archivo(s)…`);
      const files = job.files.map(b64ToFile);
      const before = attachedCount(d);
      const imgs = files.filter(f => f.type.startsWith('image/'));
      if (imgs.length && !files.some(f => f.type.startsWith('video/'))) {
        const dt = new DataTransfer(); imgs.forEach(f => dt.items.add(f));
        pasteInto(tb, dt);
        await waitFor(() => attachedCount(d) >= before + imgs.length, 8000);
      }
      if (attachedCount(d) < before + files.length) {
        let input = d.querySelector('input[type=file]');
        if (!input) {
          const pb = [...d.querySelectorAll('[role=button]')].filter(vis).find(b => RX.photo.test(label(b)));
          if (pb) { click(pb); input = await waitFor(() => d.querySelector('input[type=file]'), 5000); }
        }
        if (input) {
          const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
          input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
          await waitFor(() => attachedCount(d) >= before + files.length, 20000);
        }
      }
      if (attachedCount(d) < before + files.length) return {ok: false, step: 'files', error: 'No se pudieron adjuntar los archivos'};
    } else if (/https?:\/\//.test(job.text)) {
      progress('Esperando la vista previa del enlace…');
      await sleep(4000);
    }

    progress('Esperando a que «Publicar» esté disponible…');
    const btn = await waitFor(() => { const b = postButton(d); return b && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 120000, 500);
    if (!btn) return {ok: false, step: 'button', error: 'El botón «Publicar» no se activó'};

    if (job.test) {
      progress('Modo prueba: revisa la ventana de Facebook. No se ha publicado nada.');
      return {ok: true, test: true};
    }

    progress('Publicando…');
    const existing = new Set(dialogs());
    click(btn);
    const closed = await waitFor(() => !vis(d), 120000, 500);
    let review = null, blockMsg = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      blockMsg = alertText(existing);
      if (blockMsg) break;
      for (const n of [...dialogs(), ...document.querySelectorAll('[role=alert],[role=status]')]) {
        if (!existing.has(n) && vis(n) && RX.pending.test(fullText(n))) review = 'awaiting';
      }
      await sleep(400);
    }
    if (blockMsg) return {ok: false, blocked: true, step: 'publish', error: blockMsg};
    if (!closed) return {ok: false, step: 'publish', error: 'El cuadro de publicación no se cerró: revisa la ventana de Facebook'};
    return {ok: true, review};
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (sender.id !== chrome.runtime.id || !msg || msg.cmd !== 'post') return;
    if (window.__fbpBusy) { send({ok: false, step: 'ext', error: 'Publicación en curso'}); return; }
    window.__fbpBusy = true;
    post(msg.job).then(send, e => send({ok: false, step: 'script', error: String((e && e.message) || e)})).finally(() => { window.__fbpBusy = false; });
    return true;
  });
})();
