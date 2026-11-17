// Invio dei moduli del sito: il sito e' statico (GitHub Pages), quindi la richiesta
// viene composta come messaggio WhatsApp precompilato verso lo studio.
(function () {
  var NUMERO = '393407317004';
  function testo(form) {
    var righe = [];
    var titolo = form.getAttribute('data-titolo') || 'Richiesta dal sito correale.eu';
    righe.push('*' + titolo + '*');
    var campi = form.querySelectorAll('[data-etichetta]');
    for (var i = 0; i < campi.length; i++) {
      var c = campi[i], v = '';
      if (c.type === 'checkbox') { if (!c.checked) continue; v = c.value; }
      else if (c.getAttribute('data-gruppo') !== null) {
        var scelti = c.querySelectorAll('input:checked'), arr = [];
        for (var j = 0; j < scelti.length; j++) arr.push(scelti[j].value);
        v = arr.join(', ');
      } else { v = (c.value || '').trim(); }
      if (v) righe.push(c.getAttribute('data-etichetta') + ': ' + v);
    }
    return righe.join('\n');
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.hasAttribute('data-whatsapp')) return;
    e.preventDefault();
    if (form.reportValidity && !form.reportValidity()) return;
    var url = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(testo(form));
    var w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (err) {} } else { window.location.href = url; }
    var ok = form.querySelector('.esito');
    if (ok) ok.hidden = false;
  });
})();
