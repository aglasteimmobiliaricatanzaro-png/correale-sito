/* Lead di fiera: i dati vengono prima messi in coda sul dispositivo e tolti solo quando il server conferma. */
(function () {
  'use strict';
  var API = 'https://iscrizioni-correale.agl-correale.workers.dev/invio';
  var KEY = 'lead-expo-coda';
  var $ = function (id) { return document.getElementById(id); };
  var busy = false;

  function leggi() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function scrivi(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* memoria piena o bloccata */ } }
  function cap(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return 'lead-' + crypto.randomUUID();
    return 'lead-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function err(m) { var e = $('el'); e.textContent = m || ''; e.classList.toggle('on', !!m); }

  function valida(d) {
    if (d.nome.length < 2) return 'Scrivi il nome.';
    if (d.cognome.length < 2) return 'Scrivi il cognome.';
    if (d.cell.replace(/\D/g, '').length < 8) return 'Controlla il numero di cellulare.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return "Controlla l'indirizzo email.";
    if (!d.privacy) return 'Per continuare serve il consenso al trattamento dei dati.';
    return '';
  }

  function aggiornaAvviso() {
    var n = leggi().length, p = $('pend');
    p.classList.toggle('on', n > 0);
    $('pendTxt').textContent = n === 1 ? '1 contatto salvato su questo dispositivo, in attesa di invio (manca la connessione).'
      : n + ' contatti salvati su questo dispositivo, in attesa di invio (manca la connessione).';
  }

  async function manda(rec) {
    var fd = new FormData();
    fd.append('form-name', 'lead-expo'); fd.append('bot-field', '');
    fd.append('client_id', rec.id);
    Object.keys(rec.campi).forEach(function (k) { fd.append(k, rec.campi[k]); });
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 12000);
    try {
      var r = await fetch(API, { method: 'POST', body: fd, headers: { Accept: 'application/json' }, signal: ctl.signal });
      if (r.status === 400) return 'rifiutato';   // dati non validi: inutile riprovare
      if (!r.ok) return 'errore';
      var j = await r.json(); return j && j.ok ? 'ok' : 'errore';
    } catch (e) { return 'errore'; } finally { clearTimeout(t); }
  }

  async function svuotaCoda() {
    if (busy) return; busy = true;
    try {
      var coda = leggi(), resta = [];
      for (var i = 0; i < coda.length; i++) {
        var esito = await manda(coda[i]);
        if (esito === 'errore') resta.push(coda[i]);          // riproverà
        else if (esito === 'rifiutato') resta.push(coda[i]);  // lo teniamo, non lo perdiamo
      }
      scrivi(resta); aggiornaAvviso();
    } finally { busy = false; }
  }

  function waLink(d) {
    var n = d.cell.replace(/\D/g, '').replace(/^00/, '');
    if (!/^39/.test(n) || n.length < 11) n = '39' + n.replace(/^0+/, '');
    var txt = 'Buongiorno ' + d.nome + ', grazie per essere passato allo stand AGL Aste Immobiliari Catanzaro a EdilEXPO. '
      + 'Qui trovi la presentazione del servizio: https://correale.eu/presentazione-aste.html . Per qualsiasi domanda siamo a disposizione.';
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(txt);
  }

  function mostraOk(d, inviato) {
    $('cardForm').classList.add('hide'); $('cardOk').classList.remove('hide');
    $('okTxt').innerHTML = inviato
      ? '<b>Grazie ' + esc(d.nome) + '!</b> Abbiamo registrato i tuoi dati.'
      : '<b>Dati salvati.</b> Li invieremo appena torna la connessione: non vanno persi.';
    var a = $('okAct'); a.innerHTML = '';
    {
      var w = document.createElement('a'); w.className = 'btn btn-wa'; w.target = '_blank'; w.rel = 'noopener';
      w.href = waLink(d); w.textContent = 'Invia il messaggio WhatsApp al cliente'; a.appendChild(w);
    }
    var c = document.createElement('a'); c.className = 'btn btn-agl'; c.href = '/iscrizione-aste.html';
    c.textContent = 'Fai firmare il contratto'; a.appendChild(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $('fl').addEventListener('submit', async function (e) {
    e.preventDefault(); if (busy) return;
    var tip = [].map.call(document.querySelectorAll('input[name=tip]:checked'), function (x) { return x.value; }).join(', ');
    var d = {
      nome: cap($('nome').value), cognome: cap($('cognome').value), cell: cap($('cell').value), email: cap($('email').value).toLowerCase(),
      citta: cap($('citta').value), budget: cap($('budget').value), tipologia: tip, note: cap($('note').value),
      privacy: $('privacy').checked, msg: $('msg').checked
    };
    var m = valida(d); err(m); if (m) return;
    if ($('bot').value) return;  // trappola anti-spam
    var rec = {
      id: uuid(),
      campi: {
        nome: d.nome, cognome: d.cognome, cell: d.cell, email: d.email, citta: d.citta, budget: d.budget, tipologia: d.tipologia, note: d.note,
        privacy: 'si', consenso_messaggi: d.msg ? 'si' : 'no', origine: 'fiera EdilEXPO', inserito: new Date().toISOString()
      }
    };
    // 1) prima di tutto salvo sul dispositivo
    var coda = leggi(); coda.push(rec); scrivi(coda);
    var btn = $('inv'); btn.disabled = true; btn.textContent = 'Invio…';
    // 2) poi provo a inviare
    busy = true; var esito = await manda(rec); busy = false;
    if (esito === 'ok') { scrivi(leggi().filter(function (x) { return x.id !== rec.id; })); }
    btn.disabled = false; btn.textContent = 'Invia'; aggiornaAvviso();
    if (esito === 'rifiutato') { err('Il server non ha accettato i dati: controlla i campi. Il contatto resta salvato sul dispositivo.'); return; }
    mostraOk(d, esito === 'ok');
    $('fl').reset();
  });

  $('nuovo').onclick = function () { $('cardOk').classList.add('hide'); $('cardForm').classList.remove('hide'); err(''); $('nome').focus(); };
  $('pendBtn').onclick = svuotaCoda;
  window.addEventListener('online', svuotaCoda);
  setInterval(function () { if (leggi().length) svuotaCoda(); }, 20000);
  aggiornaAvviso(); if (leggi().length) svuotaCoda();
})();
