/* Iscrizione AGL: compilazione, anteprima, firma (disegnata o scritta), invio e pagamento. */
(function () {
  'use strict';
  var IMPORTO = '409,84';
  var $ = function (id) { return document.getElementById(id); };
  var steps = [$('step1'), $('step2'), $('step3'), $('step4')];
  var prog = $('progress').children;
  var S = { data: null, method: 'draw', hasInk: false, previewUrl: null, finalUrl: null, busy: false };
  var assets = {};

  function show(n) {
    steps.forEach(function (s, i) { s.classList.toggle('hide', i !== n); });
    [].forEach.call(prog, function (li, i) { li.className = i === n ? 'on' : (i < n ? 'done' : ''); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('eg').classList.remove('on');
  }
  function err(id, msg) { var e = $(id); e.textContent = msg || ''; e.classList.toggle('on', !!msg); }

  async function loadAsset(name, url) {
    if (assets[name]) return assets[name];
    var r = await fetch(url); if (!r.ok) throw new Error('Impossibile caricare ' + url);
    assets[name] = new Uint8Array(await r.arrayBuffer()); return assets[name];
  }
  async function loadAll() {
    await Promise.all([
      loadAsset('bg', '/agl/img/contratto-bg.jpg'),
      loadAsset('stamp', '/agl/img/timbro.png'),
      loadAsset('sigC', '/agl/img/firma-consulente.png')
    ]);
  }

  /* ---------- passo 1: dati ---------- */
  function cap(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
  function fmtDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function todayIt() {
    var p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
    var g = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
    return g('day') + '/' + g('month') + '/' + g('year');
  }
  function collect() {
    var tip = [].map.call(document.querySelectorAll('input[name=tip]:checked'), function (x) { return x.value; });
    var mu = document.querySelector('input[name=mutuo]:checked');
    return {
      nome: cap($('nome').value), natoA: cap($('natoA').value), natoIl: fmtDate($('natoIl').value),
      residenteIn: cap($('residenteIn').value), prov: cap($('prov').value).toUpperCase(),
      via: cap($('via').value), civico: cap($('civico').value),
      cf: cap($('cf').value).toUpperCase().replace(/\s/g, ''), cell: cap($('cell').value), email: cap($('email').value).toLowerCase(),
      tipologia: tip, note: cap($('note').value), geo: cap($('geo').value),
      budget: cap($('budget').value), liquidita: cap($('liq').value), mutuo: mu ? mu.value : null,
      importo: IMPORTO, luogo: 'Catanzaro', data: todayIt(), consensi: {}, clausole: false
    };
  }
  function validate1(d) {
    if (!d.nome || d.nome.split(' ').length < 2) return 'Scrivi nome e cognome.';
    if (!d.natoA) return 'Indica dove sei nato/a.';
    if (/\d/.test(d.natoA)) return 'In "Nato/a a" va scritta la città, non la data.';
    if (/\d/.test(d.nome) || /\d/.test(d.residenteIn)) return 'Nome e comune di residenza non possono contenere numeri.';
    if (!d.natoIl) return 'Indica la data di nascita.';
    if (!d.residenteIn) return 'Indica il comune di residenza.';
    if (!/^[A-Za-z]{2}$/.test(d.prov)) return 'La provincia va scritta con due lettere (es. CZ).';
    if (!d.via) return 'Indica la via.';
    if (!d.civico) return 'Indica il numero civico.';
    if (!/^[A-Z0-9]{16}$/.test(d.cf)) return 'Il codice fiscale deve avere 16 caratteri.';
    if (d.cell.replace(/\D/g, '').length < 8) return 'Controlla il numero di cellulare.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return 'Controlla l\'indirizzo email.';
    return '';
  }

  var cfEl = $('cf'); cfEl.addEventListener('input', function () { cfEl.value = cfEl.value.toUpperCase(); });
  $('prov').addEventListener('input', function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  /* ---------- anteprima ---------- */
  async function makePreview() {
    await loadAll();
    var bytes = await window.AGLContract.build({
      PDFLib: window.PDFLib, bg: assets.bg, stamp: assets.stamp, sigConsulente: null, sig: null, data: S.data,
      audit: { ts: 'anteprima (non firmato)', metodo: 'anteprima' }
    });
    if (S.previewUrl) URL.revokeObjectURL(S.previewUrl);
    S.previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    $('openPrev').href = S.previewUrl;
    $('frame').src = S.previewUrl + '#toolbar=1&view=FitH';
  }
  function summary(d) {
    var rows = [['Nome', d.nome], ['Nato/a', d.natoA + ' il ' + d.natoIl], ['Residente', d.residenteIn + ' (' + d.prov + '), ' + d.via + ' ' + d.civico],
      ['Codice fiscale', d.cf], ['Cellulare', d.cell], ['Email', d.email], ['Corrispettivo', '€ ' + d.importo + ' + IVA (€ 500,00 IVA inclusa)']];
    var dl = $('sum'); dl.innerHTML = '';
    rows.forEach(function (r) { var a = document.createElement('dt'); a.textContent = r[0]; var b = document.createElement('dd'); b.textContent = r[1]; dl.appendChild(a); dl.appendChild(b); });
  }

  $('f1').addEventListener('submit', async function (e) {
    e.preventDefault();
    var d = collect(), m = validate1(d); err('e1', m); if (m) return;
    S.data = d; summary(d);
    try { show(1); await makePreview(); } catch (x) { err('eg', 'Non riesco a preparare l\'anteprima del contratto. Riprova tra poco.'); console.error(x); }
  });
  $('back2').onclick = function () { show(0); };
  $('go3').onclick = function () { show(2); setTimeout(resizePad, 50); };
  $('back3').onclick = function () { show(1); };

  /* ---------- firma ---------- */
  var cv = $('pad'), ctx = cv.getContext('2d'), dpr = 1, drawing = false, last = null;
  var INK = '#0b1840';
  function resizePad() {
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var w = cv.clientWidth || 600, h = cv.clientHeight || 190;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    S.hasInk = false; $('ph').classList.remove('hide');
    if (S.method === 'type') drawTyped();
  }
  function pos(ev) { var r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (ev) {
    if (S.method !== 'draw') return; ev.preventDefault(); cv.setPointerCapture(ev.pointerId);
    drawing = true; last = pos(ev); ctx.strokeStyle = INK; ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.3, 0, 6.283); ctx.fill(); markInk();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drawing) return; ev.preventDefault(); var p = pos(ev);
    ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
  });
  function endDraw() { drawing = false; }
  cv.addEventListener('pointerup', endDraw); cv.addEventListener('pointercancel', endDraw); cv.addEventListener('pointerleave', endDraw);
  function markInk() { S.hasInk = true; $('ph').classList.add('hide'); }
  function clearPad() { ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr); S.hasInk = false; $('ph').classList.toggle('hide', false); }
  $('clr').onclick = function () { clearPad(); if (S.method === 'type') { $('typeName').value = ''; } };

  async function drawTyped() {
    var txt = cap($('typeName').value);
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    if (!txt) { S.hasInk = false; $('ph').classList.remove('hide'); return; }
    try { await document.fonts.load('600 64px "Dancing Script"', txt); } catch (e) { /* uso il font di riserva */ }
    var w = cv.clientWidth, h = cv.clientHeight, size = 84;
    ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
    do { ctx.font = '600 ' + size + 'px "Dancing Script", "Segoe Script", "Brush Script MT", cursive'; size -= 2; } while (ctx.measureText(txt).width > w - 40 && size > 20);
    var tw = ctx.measureText(txt).width;
    ctx.clearRect(0, 0, w, h); ctx.fillText(txt, (w - tw) / 2, h - 56);
    S.hasInk = true; $('ph').classList.add('hide');
  }
  $('typeName').addEventListener('input', drawTyped);
  function setMethod(m) {
    S.method = m; $('tabDraw').classList.toggle('on', m === 'draw'); $('tabType').classList.toggle('on', m === 'type');
    $('typeBox').classList.toggle('hide', m !== 'type');
    $('ph').textContent = m === 'draw' ? 'Firma qui con il dito o con il mouse' : 'La tua firma comparirà qui';
    resizePad();
    if (m === 'type') { if (!$('typeName').value && S.data) $('typeName').value = S.data.nome; drawTyped(); }
  }
  $('tabDraw').onclick = function () { setMethod('draw'); }; $('tabType').onclick = function () { setMethod('type'); };
  window.addEventListener('resize', function () { if (!steps[2].classList.contains('hide') && S.method === 'draw' && !S.hasInk) resizePad(); });

  function signaturePng() {  // ritaglia la firma e la esporta come PNG trasparente
    var w = cv.width, h = cv.height, img = ctx.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (img[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    var pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    var c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext('2d').drawImage(cv, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, 'image/png'); });
  }

  /* ---------- invio ---------- */
  function nowIt() { return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'medium' }) + ' (ora italiana)'; }
  async function getServerInfo() {
    try {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 4000);
      var r = await fetch('https://iscrizioni-correale.agl-correale.workers.dev/ip', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      if (!r.ok) return {}; var j = await r.json(); return j || {};
    } catch (e) { return {}; }
  }
  function uaShort() { return (navigator.userAgent || '').slice(0, 140); }

  $('sign').onclick = async function () {
    if (S.busy) return; err('e3', '');
    var c = {
      marketing: (document.querySelector('input[name=c_marketing]:checked') || {}).value,
      partner: (document.querySelector('input[name=c_partner]:checked') || {}).value,
      terzi: (document.querySelector('input[name=c_terzi]:checked') || {}).value
    };
    if (!c.marketing || !c.partner || !c.terzi) return err('e3', 'Scegli per ognuno dei tre consensi se presti o non presti il consenso.');
    if (!$('ck_letto').checked) return err('e3', 'Per firmare devi dichiarare di aver letto il contratto.');
    if (!$('ck_vess').checked) return err('e3', 'Per firmare devi approvare le clausole degli artt. 1341-1342 del Codice Civile.');
    if (!S.hasInk) return err('e3', S.method === 'draw' ? 'Disegna la tua firma nello spazio qui sopra.' : 'Scrivi il tuo nome per generare la firma.');
    S.busy = true; var btn = $('sign'); btn.disabled = true; btn.textContent = 'Sto firmando…';
    try {
      await loadAll();
      var sig = await signaturePng(); if (!sig) throw new Error('firma vuota');
      var info = await getServerInfo();
      var d = S.data; d.consensi = c; d.clausole = true; d.data = todayIt();
      var metodo = S.method === 'draw' ? 'firma disegnata a mano sullo schermo' : 'firma scritta (nome in carattere corsivo)';
      var ts = info.ts ? info.ts : nowIt(), ip = info.ip || 'non rilevato';
      var enc = new TextEncoder().encode(JSON.stringify({ d: d, ts: ts, ip: ip, metodo: metodo }));
      var all = new Uint8Array(enc.length + sig.length); all.set(enc, 0); all.set(sig, enc.length);
      var hash = await window.AGLContract.sha256Hex(all);
      var bytes = await window.AGLContract.build({
        PDFLib: window.PDFLib, bg: assets.bg, stamp: assets.stamp, sigConsulente: assets.sigC, sig: sig, data: d,
        audit: { ts: ts, ip: ip, metodo: metodo, ua: uaShort(), hash: hash }
      });
      var safe = (d.nome || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var fname = 'Contratto-AGL-' + safe + '-' + d.data.split('/').reverse().join('') + '.pdf';
      var file = new File([bytes], fname, { type: 'application/pdf' });
      var fd = new FormData();
      fd.append('form-name', 'iscrizione-aste-firma'); fd.append('bot-field', '');
      fd.append('nome', d.nome); fd.append('email', d.email); fd.append('cell', d.cell); fd.append('cf', d.cf);
      fd.append('importo', d.importo + ' + IVA'); fd.append('metodo_firma', metodo); fd.append('data_ora', ts); fd.append('ip', ip);
      fd.append('impronta', hash);
      fd.append('consensi', 'marketing: ' + c.marketing + ' | partner: ' + c.partner + ' | terzi: ' + c.terzi);
      fd.append('contratto', file, fname);
      var r = await fetch('https://iscrizioni-correale.agl-correale.workers.dev/invio', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('invio ' + r.status);
      if (S.finalUrl) URL.revokeObjectURL(S.finalUrl);
      S.finalUrl = URL.createObjectURL(file);
      var a = $('dl'); a.href = S.finalUrl; a.download = fname;
      show(3);
    } catch (x) {
      console.error(x);
      err('e3', 'Non sono riuscito a registrare la firma. Controlla la connessione e riprova; se il problema continua scrivici su WhatsApp al 340 731 7004.');
    } finally { S.busy = false; btn.disabled = false; btn.textContent = 'Firma e conferma'; }
  };

  loadAll().catch(function () { /* riprova al momento dell'uso */ });
  window.addEventListener('load', resizePad);
})();
