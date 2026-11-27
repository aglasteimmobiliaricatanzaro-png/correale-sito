/* Compilazione del Contratto di consulenza AGL: scrive i dati e le firme sull'immagine del contratto
   e produce un PDF (pagina 1 = contratto, pagina 2 = certificato di firma). Funziona nel browser e in Node. */
(function (root) {
  var PH = 595.276, PW = 841.89;

  function clean(font, s) {
    s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
    var set = font.getCharacterSet(), out = '';
    for (var ch of s) { out += set.indexOf(ch.codePointAt(0)) >= 0 ? ch : '?'; }
    return out;
  }
  function fit(font, text, size, maxW) {
    while (size > 4.5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.25;
    return size;
  }
  function wrap(font, text, size, maxW) {
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  async function sha256Hex(bytes) {
    var subtle = (root.crypto && root.crypto.subtle) || require('crypto').webcrypto.subtle;
    var h = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return Array.prototype.map.call(h, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  /* opts: {PDFLib, bg (bytes jpg), sig (bytes png cliente), sigConsulente (bytes png), stamp (bytes png),
            data, audit:{ts, ip, ua, metodo, ...}} */
  async function build(opts) {
    var L = opts.PDFLib, d = opts.data, au = opts.audit || {};
    var pdf = await L.PDFDocument.create();
    pdf.setTitle('Contratto di consulenza commerciale AGL - ' + (d.nome || ''));
    pdf.setProducer('correale.eu'); pdf.setCreator('Correale Consulting');
    var page = pdf.addPage([PW, PH]);
    var F = await pdf.embedFont(L.StandardFonts.Helvetica), FB = await pdf.embedFont(L.StandardFonts.HelveticaBold);
    var bg = await pdf.embedJpg(opts.bg);
    page.drawImage(bg, { x: 0, y: 0, width: PW, height: PH });
    var ink = L.rgb(0.05, 0.10, 0.35);

    function txt(s, x, y, maxW, size, font) {
      font = font || F; s = clean(font, s); if (!s) return;
      size = fit(font, s, size || 8, maxW);
      page.drawText(s, { x: x, y: y, size: size, font: font, color: ink });
    }
    function cross(x0, y0, x1, y1) {
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.min(x1 - x0, y1 - y0) / 2 - 0.4;
      page.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, thickness: 1, color: ink });
      page.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, thickness: 1, color: ink });
    }
    async function img(bytes, x, y, w, h, bottom) {
      var im = await pdf.embedPng(bytes), s = Math.min(w / im.width, h / im.height);
      var iw = im.width * s, ih = im.height * s;
      page.drawImage(im, { x: x + (w - iw) / 2, y: bottom ? y : y + (h - ih) / 2, width: iw, height: ih });
    }

    /* Consulente: riquadro timbro */
    txt('Correale Consulting', 22, 501, 92, 7.5, FB);
    txt('P.IVA 04085810796', 22, 493, 92, 6.5);
    txt('88100 Catanzaro (CZ)', 22, 486, 92, 6.5);
    if (opts.stamp) await img(opts.stamp, 118, 469, 90, 42);

    /* dati del Cliente */
    txt(d.nome, 75, 429.6, 134, 8);
    txt(d.natoA, 52, 418.6, 98, 8); txt(d.natoIl, 165, 418.6, 45, 8);
    txt(d.residenteIn, 58, 405.6, 110, 8); txt(d.prov, 190, 406, 20, 8);
    txt(d.via, 30, 393.6, 140, 8); txt(d.civico, 190, 394, 20, 8);
    txt(d.cf, 46, 380.6, 162, 8); txt(d.cell, 33, 368.4, 176, 8); txt(d.email, 36, 355.4, 172, 8);

    var T = d.tipologia || [];
    if (T.indexOf('residenziale') >= 0) cross(17, 293, 23, 299);
    if (T.indexOf('industriale') >= 0) cross(65, 293, 71, 299);
    if (T.indexOf('commerciale') >= 0) cross(108, 293, 114, 299);
    if (T.indexOf('terreno') >= 0) cross(158, 293, 164, 299);
    txt(d.note, 33, 285.4, 178, 7.5);

    var geoFont = F, geoSize = 7, geoText = clean(geoFont, d.geo || ''), lines = wrap(geoFont, geoText, geoSize, 190);
    if (lines.length > 3) { geoSize = 6; lines = wrap(geoFont, geoText, geoSize, 190); }
    lines.slice(0, 3).forEach(function (l, i) { page.drawText(l, { x: 21, y: 267.8 - i * 6.25, size: geoSize, font: geoFont, color: ink }); });

    txt(d.budget, 80, 229.4, 116, 8); txt(d.liquidita, 48, 220.6, 148, 8);
    /* il modello non ha le caselle SI/NO: le disegniamo noi, cosi' la croce e' chiara */
    function box(x0, y0, x1, y1) { page.drawRectangle({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, borderColor: ink, borderWidth: 0.7 }); }
    txt('SI', 171.5, 197, 8, 7, FB); box(179.5, 195.5, 186.5, 202.5);
    txt('NO', 189.5, 197, 9, 7, FB); box(200, 195.5, 207, 202.5);
    if (d.mutuo === 'si') cross(179.5, 195.5, 186.5, 202.5);
    if (d.mutuo === 'no') cross(200, 195.5, 207, 202.5);
    txt(d.importo, 44, 167.3, 50, 6.4, FB);
    txt((d.luogo || '') + (d.data ? ', ' + d.data : ''), 55, 138.6, 154, 8);

    /* consensi privacy (presto / non presto) */
    var C = d.consensi || {};
    function consenso(v, yTop) {  // yTop = y dall'alto del centro del riquadro
      var y = PH - yTop, cx = v === 'si' ? 687.6 : 758.7;
      if (v === 'si' || v === 'no') cross(cx - 3.2, y - 3.2, cx + 3.2, y + 3.2);
    }
    consenso(C.marketing, 374.2); consenso(C.partner, 411.6); consenso(C.terzi, 450.1);

    /* firme */
    if (opts.sig) {
      await img(opts.sig, 42, 92.8, 58, 26, true);      // accettazione contratto
      await img(opts.sig, 42, 38.8, 58, 27, true);       // clausole 1341-1342
      await img(opts.sig, 655, 91.8, 95, 26, true);      // consenso privacy
    }
    if (opts.sigConsulente) await img(opts.sigConsulente, 166, 92.8, 44, 26, true);

    /* pagina 2: certificato di firma */
    var p2 = pdf.addPage([595.28, 841.89]);
    var y = 790, x = 50;
    function t2(s, size, font, color) { p2.drawText(clean(font || F, s), { x: x, y: y, size: size || 10, font: font || F, color: color || L.rgb(0.1, 0.1, 0.1) }); y -= (size || 10) + 7; }
    t2('Certificato di firma elettronica', 18, FB, L.rgb(0.12, 0.2, 0.45)); y -= 4;
    t2('Contratto di consulenza commerciale AGL Aste Immobiliari - Correale Consulting', 10.5, FB); y -= 6;
    var rows = [
      ['Firmatario (Cliente)', d.nome], ['Codice fiscale', d.cf], ['Email', d.email], ['Cellulare', d.cell],
      ['Data e ora della firma', au.ts || ''], ['Indirizzo IP', au.ip || 'non disponibile'],
      ['Metodo di firma', au.metodo || ''], ['Dispositivo / browser', au.ua || ''],
      ['Corrispettivo', (d.importo ? 'Euro ' + d.importo + (d.importo === '0,00' ? '' : ' + IVA') : '')],
      ['Consenso marketing', C.marketing === 'si' ? 'presto il consenso' : 'non presto il consenso'],
      ['Cessione dati ai Partner', C.partner === 'si' ? 'presto il consenso' : 'non presto il consenso'],
      ['Marketing di terzi', C.terzi === 'si' ? 'presto il consenso' : 'non presto il consenso'],
      ['Clausole artt. 1341-1342 c.c.', d.clausole ? 'approvate espressamente (3.2, 6.1, 10.3)' : 'non approvate']
    ];
    rows.forEach(function (r) {
      p2.drawText(clean(FB, r[0]), { x: x, y: y, size: 9, font: FB, color: L.rgb(0.2, 0.2, 0.2) });
      var v = clean(F, r[1]), lns = wrap(F, v, 9, 340);
      lns.forEach(function (l, i) { p2.drawText(l, { x: x + 170, y: y - i * 11, size: 9, font: F }); });
      y -= Math.max(1, lns.length) * 11 + 5;
    });
    y -= 8;
    t2('Impronta digitale dei dati firmati (SHA-256):', 9, FB);
    t2(au.hash || '', 8.5, F);
    y -= 10;
    var note = 'Il Cliente ha letto il contratto e l\'informativa privacy, ha inserito personalmente i propri dati e ha apposto la firma elettronica con le modalità indicate sopra, dichiarando di firmare il contratto. La firma è una firma elettronica semplice ai sensi del Regolamento (UE) 910/2014 (eIDAS). Una copia del documento firmato è conservata da Correale Consulting, P.IVA 04085810796, 88100 Catanzaro.';
    wrap(F, clean(F, note), 8.5, 495).forEach(function (l) { t2(l, 8.5, F, L.rgb(0.25, 0.25, 0.25)); });
    if (d.importo !== '0,00') { y -= 8; t2('Precisazione sul corrispettivo:', 9, FB); var nota2 = d.acconto ? ('Il corrispettivo indicato è l\'importo totale dovuto dal Cliente (Euro 399,00 IVA inclusa). Alla sottoscrizione è dovuto un acconto di Euro ' + d.acconto + ',00 IVA inclusa; il saldo di Euro ' + (399 - d.acconto) + ',00 IVA inclusa è dovuto dopo la consegna della Scheda di Fattibilità. L\'indicazione dell\'importo in questo documento non attesta l\'avvenuto pagamento integrale.') : 'Il corrispettivo indicato è l\'importo totale dovuto dal Cliente e può essere corrisposto in più momenti (ad esempio, acconto alla sottoscrizione e saldo dopo la consegna della Scheda di Fattibilità). L\'indicazione dell\'importo in questo documento non attesta l\'avvenuto pagamento: l\'eventuale saldo non ancora versato resta dovuto alle scadenze concordate.'; wrap(F, clean(F, nota2), 8.5, 495).forEach(function (l) { t2(l, 8.5, F, L.rgb(0.25, 0.25, 0.25)); }); }
    return pdf.save();
  }

  var api = { build: build, sha256Hex: sha256Hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AGLContract = api;
})(typeof window !== 'undefined' ? window : globalThis);
