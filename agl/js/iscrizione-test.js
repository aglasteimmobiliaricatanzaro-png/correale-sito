/* Iscrizione AGL: compilazione, anteprima, firma (disegnata o scritta), invio e pagamento. */
(function () {
  'use strict';
  var NETTO = '409,84', NETTO_PROMO = '327,05', TOT = 500, TOT_PROMO = 399, WORKER = 'https://iscrizioni-correale.agl-correale.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var steps = [$('step1'), $('step2'), $('step3'), $('step4')];
  var prog = $('progress').children;
  var S = { data: null, promo: false, coupon: '', pending: null, sentId: null, method: 'draw', hasInk: false, previewUrl: null, finalUrl: null, busy: false };
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
      acconto: S.acc || 0, importo: S.free ? '0,00' : S.promo ? NETTO_PROMO : NETTO, luogo: 'Catanzaro', data: todayIt(), consensi: {}, clausole: false
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
      ['Codice fiscale', d.cf], ['Cellulare', d.cell], ['Email', d.email], ['Corrispettivo', S.free ? '€ 0,00' : '€ ' + d.importo + ' + IVA (€ ' + (S.promo ? '399,00' : '500,00') + ' IVA inclusa)' + (S.promo ? ' · promo ' + S.coupon : '')]];
    var dl = $('sum'); dl.innerHTML = '';
    rows.forEach(function (r) { var a = document.createElement('dt'); a.textContent = r[0]; var b = document.createElement('dd'); b.textContent = r[1]; dl.appendChild(a); dl.appendChild(b); });
  }

  $('f1').addEventListener('submit', async function (e) {
    e.preventDefault();
    var d = collect(), m = validate1(d); err('e1', m); if (m) return;
    await applicaCoupon();
    d = collect(); S.data = d; summary(d); aggiornaImporto();
    try { show(1); await makePreview(); } catch (x) { err('eg', 'Non riesco a preparare l\'anteprima del contratto. Riprova tra poco.'); console.error(x); }
  });
  /* ---------- coupon ---------- */
  async function applicaCoupon() {
    var c = cap($('coupon').value).toUpperCase(), msg = $('cpMsg'); S.promo = false; S.coupon = '';
    if (!c) { msg.textContent = ''; return; }
    var ok = null;
    try {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 4000);
      var r = await fetch(WORKER + '/coupon?c=' + encodeURIComponent(c), { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      if (r.ok) { var jj = await r.json(); ok = !!jj.valido; S.free = !!(ok && Number(jj.totale) === 0); S.acc = ok ? Number(jj.acconto || 0) : 0; }
    } catch (e) { /* senza linea: decide il server all'invio */ }
    if (ok === null) { ok = (c === 'EXPO2026' || c === 'EXPO99'); S.free = false; S.acc = (ok && c === 'EXPO99') ? 99 : 0; }
    S.coupon = c; S.promo = ok; if (!ok) { S.free = false; S.acc = 0; }
    msg.textContent = ok ? (S.free ? 'Codice valido.' : (S.acc ? 'Codice valido: corrispettivo scontato a 399 € (IVA inclusa); alla sottoscrizione paghi di persona solo ' + S.acc + ' €, il saldo dopo la Scheda di Fattibilità.' : 'Codice valido: corrispettivo scontato a 399 € (IVA inclusa), da pagare di persona.')) : 'Codice non valido: si applica il prezzo di listino.';
    msg.style.color = ok ? '#1e5a31' : '#b3261e';
  }
  function aggiornaImporto() {
    var el = $('amt');
    el.innerHTML = S.free ? '<b>Corrispettivo di sviluppo:</b> € 0,00' : S.promo ? '<b>Corrispettivo di sviluppo (promo ' + S.coupon + '):</b> € ' + NETTO_PROMO + ' + IVA (€ 399,00 IVA inclusa). Il contratto indica l\'importo al netto dell\'IVA.'
      : '<b>Corrispettivo di sviluppo:</b> € ' + NETTO + ' + IVA (€ 500,00 IVA inclusa). Il contratto indica l\'importo al netto dell\'IVA.';
  }
  var cpT; $('coupon').addEventListener('input', function () { clearTimeout(cpT); cpT = setTimeout(async function () { await applicaCoupon(); aggiornaImporto(); }, 500); });
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

  /* ---------- coda sul dispositivo (IndexedDB) e reinvio ---------- */
  var mem = [];
  function uuid() {
    if (window.crypto && crypto.randomUUID) return 'ctr-' + crypto.randomUUID();
    return 'ctr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function idb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var q = indexedDB.open('contratti-agl', 1);
      q.onupgradeneeded = function () { q.result.createObjectStore('coda', { keyPath: 'id' }); };
      q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
    });
  }
  async function idbPut(rec) {
    mem = mem.filter(function (x) { return x.id !== rec.id; }); mem.push(rec);
    try { var db = await idb(); await new Promise(function (res, rej) { var t = db.transaction('coda', 'readwrite'); t.objectStore('coda').put(rec); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); } catch (e) { /* resta almeno in memoria */ }
  }
  async function idbAll() {
    try { var db = await idb(); var l = await new Promise(function (res, rej) { var r = db.transaction('coda').objectStore('coda').getAll(); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
      var ids = {}; l.forEach(function (x) { ids[x.id] = 1; }); mem.forEach(function (x) { if (!ids[x.id]) l.push(x); }); return l; } catch (e) { return mem.slice(); }
  }
  async function idbDel(id) {
    mem = mem.filter(function (x) { return x.id !== id; });
    try { var db = await idb(); await new Promise(function (res, rej) { var t = db.transaction('coda', 'readwrite'); t.objectStore('coda').delete(id); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); } catch (e) { /* niente */ }
  }
  async function spedisci(rec) {
    var fd = new FormData();
    rec.campi.forEach(function (kv) { fd.append(kv[0], kv[1]); });
    if (rec.scelta) fd.append('pagamento', rec.scelta);
    fd.append('contratto', new File([rec.pdf], rec.fname, { type: 'application/pdf' }), rec.fname);
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 25000);
    try {
      var r = await fetch(WORKER + '/invio', { method: 'POST', body: fd, headers: { Accept: 'application/json' }, signal: ctl.signal });
      if (!r.ok) return null; var j = await r.json(); return j && j.ok ? j.id : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  var inviando = false;
  async function inviaCoda() {
    if (inviando) return; inviando = true;
    try {
      var l = await idbAll();
      for (var i = 0; i < l.length; i++) {
        var id = await spedisci(l[i]);
        if (id) { await idbDel(l[i].id); if (S.pending && S.pending.id === l[i].id) { S.sentId = id; S.pending = null; statoInvio(); } }
      }
    } finally { inviando = false; }
  }
  function statoInvio() {
    var b = $('pendbox'); if (!b) return;
    if (S.pending) { b.classList.remove('hide'); b.innerHTML = '<b>Contratto salvato su questo dispositivo, invio in corso.</b> Se manca la connessione lo invieremo da soli appena torna: tieni aperta questa pagina e scarica la copia del contratto qui sopra.'; }
    else if (S.sentId) { b.classList.remove('hide'); b.style.cssText = 'background:#e9f3ec;border-color:#b9d9c3;color:#1e5a31'; b.innerHTML = '<b>Contratto registrato.</b> Lo abbiamo ricevuto e archiviato.'; }
    else b.classList.add('hide');
  }
  async function scegliPagamento(scelta) {
    if (S.pending) { S.pending.scelta = scelta; await idbPut(S.pending); inviaCoda(); return; }
    if (S.sentId) { try { await fetch(WORKER + '/scelta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: S.sentId, scelta: scelta }) }); } catch (e) { /* non bloccante */ } }
  }
  function card(tag, cls, html, onClick, href) {
    var el = document.createElement(tag); el.className = cls; el.innerHTML = html;
    if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }
    if (onClick) el.addEventListener('click', onClick); return el;
  }
  function addWa() {
    var row = $('dl').parentNode, d = S.data || {};
    if (!d.cell || $('waCli')) return;
    var n = String(d.cell).replace(/\D/g, '').replace(/^00/, '');
    if (!/^39/.test(n) || n.length < 11) n = '39' + n.replace(/^0+/, '');
    var t = 'Buongiorno ' + (d.nome || '') + ', grazie per aver firmato il contratto con AGL Aste Immobiliari Catanzaro. Per qualsiasi domanda siamo a disposizione.';
    var a = document.createElement('a'); a.id = 'waCli'; a.className = 'btn btn-agl-line'; a.target = '_blank'; a.rel = 'noopener';
    a.style.marginLeft = '8px'; a.href = 'https://wa.me/' + n + '?text=' + encodeURIComponent(t); a.textContent = 'Invia WhatsApp al cliente';
    row.appendChild(a);
  }
  function renderPay() {
    var box = $('payBox'); box.innerHTML = '';
    if (S.promo) {
      $('paySub').textContent = (S.free ? 'Corrispettivo: € 0,00. Nessun pagamento dovuto.' : (S.acc ? 'Promozione ' + S.coupon + ': corrispettivo di 399 € (IVA inclusa). Alla sottoscrizione paghi di persona ' + S.acc + ' €; il saldo di ' + (399 - S.acc) + ' € è dovuto dopo la Scheda di Fattibilità.' : 'Promozione ' + S.coupon + ': il corrispettivo è di 399 € (IVA inclusa), da pagare di persona.'));
      box.appendChild(card('div', 'card2 sel full', '<span>' + (S.free ? 'Corrispettivo' : (S.acc ? 'Promozione ' + S.coupon + ' · acconto di persona' : 'Promozione ' + S.coupon + ' · pagamento di persona')) + '</span><b>' + (S.free ? '0,00 €' : S.acc ? S.acc + ' €' : '399 €') + '</b><span>' + (S.free ? '' : (S.acc ? 'Acconto alla sottoscrizione. Saldo di ' + (399 - S.acc) + ' € dopo la Scheda di Fattibilità.' : 'Importo totale, IVA inclusa. Il pagamento si effettua di persona.')) + '</span>'));
      $('payNote').textContent = (S.free ? 'Nessun pagamento dovuto.' : (S.acc ? 'Il pagamento avviene di persona, non online.' : 'Con la promozione non è previsto il pagamento in due rate né online.'));
      S.pending ? (S.pending.scelta = 'stand') : scegliPagamento('stand');
    } else {
      $('paySub').textContent = 'Scegli come pagare il corrispettivo di sviluppo (IVA inclusa). Online il pagamento avviene sul sito sicuro SumUp; puoi anche pagare di persona.';
      box.appendChild(card('a', 'card2', '<span>In 2 rate</span><b>Paga 250 €</b><span>Prima rata. I restanti 250 € dopo la Scheda di Fattibilità (totale 500 €).</span>', function () { scegliPagamento('rate'); }, 'https://pay.sumup.com/b2c/Q55VOKE9'));
      box.appendChild(card('a', 'card2', '<span>In un\'unica soluzione</span><b>Paga 500 €</b><span>Importo totale, IVA inclusa.</span>', function () { scegliPagamento('unico'); }, 'https://pay.sumup.com/b2c/QQAHI381'));
      box.appendChild(card('button', 'card2 full', '<span>Preferisco pagare di persona</span><b>500 €</b><span>Paghi in sede o allo stand. Importo totale, IVA inclusa.</span>', function (e) {
        scegliPagamento('stand'); $('payNote').textContent = 'Perfetto: abbiamo segnato che pagherai di persona 500 € (IVA inclusa). Ti aspettiamo.';
        [].forEach.call(box.children, function (x) { x.classList.remove('sel'); }); e.currentTarget.classList.add('sel');
      }));
      box.lastChild.type = 'button';
      $('payNote').textContent = '';
    }
  }
  window.addEventListener('online', inviaCoda);
  setInterval(inviaCoda, 20000);
  setTimeout(inviaCoda, 1500);

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
      var campi = [
        ['form-name', 'iscrizione-aste-firma'], ['bot-field', ''], ['client_id', uuid()],
        ['nome', d.nome], ['email', d.email], ['cell', d.cell], ['cf', d.cf],
        ['importo', S.free ? '0,00' : d.importo + ' + IVA'], ['coupon', S.coupon], ['metodo_firma', metodo], ['data_ora', ts], ['ip', ip],
        ['impronta', hash],
        ['consensi', 'marketing: ' + c.marketing + ' | partner: ' + c.partner + ' | terzi: ' + c.terzi]
      ];
      if (S.finalUrl) URL.revokeObjectURL(S.finalUrl);
      S.finalUrl = URL.createObjectURL(file);
      var a = $('dl'); a.href = S.finalUrl; a.download = fname;
      // 1) il contratto firmato resta prima di tutto sul dispositivo
      var rec = { id: campi[2][1], campi: campi, fname: fname, pdf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), scelta: '' };
      await idbPut(rec);
      S.pending = rec; S.sentId = null;
      renderPay(); addWa(); show(3); statoInvio();
      // 2) poi lo mando al server (se manca la linea ci riprova da solo)
      inviaCoda();
    } catch (x) {
      console.error(x);
      err('e3', 'Non sono riuscito a preparare il contratto firmato. Riprova; se il problema continua scrivici su WhatsApp al 340 731 7004.');
    } finally { S.busy = false; btn.disabled = false; btn.textContent = 'Firma e conferma'; }
  };

  loadAll().catch(function () { /* riprova al momento dell'uso */ });
  window.addEventListener('load', resizePad);
})();
