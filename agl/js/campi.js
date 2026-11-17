(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LET = /[^A-Za-zÀ-ÖØ-öø-ÿ'’\s.\-]/g;

  /* ---- solo lettere nei campi nome / luogo ---- */
  function lettersOnly(id, msg) {
    var el = $(id); if (!el) return;
    var note = document.createElement('div');
    note.className = 'err'; note.setAttribute('role', 'alert');
    el.parentNode.appendChild(note);
    var t;
    el.addEventListener('input', function () {
      if (LET.test(el.value)) {
        var pos = el.selectionStart - 1;
        el.value = el.value.replace(LET, '');
        try { el.setSelectionRange(pos, pos); } catch (e) {}
        note.textContent = msg; note.classList.add('on');
        clearTimeout(t); t = setTimeout(function () { note.classList.remove('on'); }, 4000);
      }
      LET.lastIndex = 0;
    });
  }
  lettersOnly('nome', 'Qui va scritto solo il nome e cognome, senza numeri.');
  lettersOnly('natoA', 'Qui va scritta la città di nascita, non la data (la data va nel campo accanto).');
  lettersOnly('residenteIn', 'Qui va scritto il comune di residenza, senza numeri.');

  /* ---- suggerimenti comuni ---- */
  var list = null, loading = null;
  function norm(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’]/g, "'"); }
  function load() {
    if (list) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res) {
      var s = document.createElement('script'); s.src = '/agl/js/comuni.js';
      s.onload = function () {
        list = window.COMUNI_IT.map(function (r) { var p = r.split('|'); return { n: p[0], p: p[1], k: norm(p[0]) }; });
        res();
      };
      s.onerror = function () { loading = null; res(); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function attach(el, opt) {
    el.parentNode.style.position = 'relative';
    var box = document.createElement('div');
    box.setAttribute('role', 'listbox');
    box.style.cssText = 'display:none;position:absolute;left:0;right:0;z-index:30;background:#fff;border:1px solid #c9ccd3;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.15);max-height:240px;overflow:auto;top:100%;margin-top:2px';
    el.parentNode.appendChild(box);
    var items = [], act = -1, tokStart = 0, tokEnd = 0;

    function close() { box.style.display = 'none'; items = []; act = -1; }
    function paint() {
      [].forEach.call(box.children, function (c, i) { c.style.background = i === act ? '#e8ecf4' : '#fff'; });
    }
    function token() {
      var v = el.value, pos = el.selectionStart == null ? v.length : el.selectionStart;
      var s = 0;
      if (opt.multi) { var m = v.slice(0, pos).search(/[,;\n][^,;\n]*$/); s = m < 0 ? 0 : m + 1; }
      var e = pos;
      tokStart = s; tokEnd = e;
      return v.slice(s, e).replace(/^\s+/, '');
    }
    function pick(i) {
      var it = items[i]; if (!it) return;
      var v = el.value, lead = v.slice(tokStart, tokEnd).match(/^\s*/)[0];
      var text = opt.multi ? it.n + ' (' + it.p + ')' : it.n;
      var after = v.slice(tokEnd);
      var ins = lead + text + (opt.multi ? ', ' : '');
      el.value = v.slice(0, tokStart) + ins + after.replace(/^\s+/, '');
      var np = tokStart + ins.length;
      try { el.setSelectionRange(np, np); } catch (e) {}
      if (opt.prov && $(opt.prov)) $(opt.prov).value = it.p;
      close(); el.focus();
    }
    function show() {
      var q = token();
      if (q.length < 2) return close();
      load().then(function () {
        if (!list || token() !== q) return;
        var k = norm(q);
        items = list.filter(function (c) { return c.k.indexOf(k) === 0; }).slice(0, 8);
        if (!items.length) return close();
        box.innerHTML = '';
        items.forEach(function (it, i) {
          var d = document.createElement('div');
          d.setAttribute('role', 'option');
          d.style.cssText = 'padding:9px 12px;cursor:pointer;font-size:.95rem;display:flex;justify-content:space-between;gap:8px';
          d.innerHTML = '<span></span><span style="color:#777"></span>';
          d.firstChild.textContent = it.n; d.lastChild.textContent = it.p;
          d.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(i); });
          box.appendChild(d);
        });
        act = -1; paint(); box.style.display = 'block';
      });
    }
    el.addEventListener('input', show);
    el.addEventListener('blur', function () { setTimeout(close, 120); });
    el.addEventListener('keydown', function (e) {
      if (box.style.display === 'none' || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); act = act <= 0 ? items.length - 1 : act - 1; paint(); }
      else if ((e.key === 'Enter' || e.key === 'Tab') && act >= 0) { e.preventDefault(); pick(act); }
      else if (e.key === 'Escape') { close(); }
    });
  }
  attach($('geo'), { multi: true });
  attach($('natoA'), {});
  attach($('residenteIn'), { prov: 'prov' });
})();
