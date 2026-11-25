/* MASROOF — compact dropdown for <select> on touch screens.
   Native pickers fill the whole phone screen; this replaces them with a small popover
   (about half the screen width/height, smaller text) that is dismissed by tapping anywhere outside. */
(function () {
  var pop = null, back = null, current = null;
  function touchLayout() {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || window.innerWidth <= 720;
  }
  function close() {
    if (pop) pop.remove(); if (back) back.remove();
    pop = back = current = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  function choose(sel, value) {
    close();
    if (sel.value === value) return;
    var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(sel, value); else sel.value = value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function open(sel) {
    close(); current = sel;
    var rect = sel.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var rtl = getComputedStyle(sel).direction === 'rtl';
    back = document.createElement('div'); back.className = 'sp-back';
    back.addEventListener('pointerdown', function (e) { e.preventDefault(); close(); });
    back.addEventListener('click', function (e) { e.preventDefault(); close(); });
    pop = document.createElement('div'); pop.className = 'sp-pop'; pop.setAttribute('role', 'listbox');
    pop.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    var selectedEl = null;
    Array.prototype.forEach.call(sel.children, function (node) {
      function add(o, nested) {
        if (o.hidden) return;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sp-opt' + (nested ? ' nested' : '') + (o.selected ? ' sel' : '');
        b.setAttribute('role', 'option'); b.textContent = o.textContent; b.disabled = !!o.disabled;
        if (o.selected) selectedEl = b;
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); choose(sel, o.value); });
        pop.appendChild(b);
      }
      if (node.tagName === 'OPTGROUP') {
        var h = document.createElement('div'); h.className = 'sp-group'; h.textContent = node.label; pop.appendChild(h);
        Array.prototype.forEach.call(node.children, function (o) { add(o, true); });
      } else if (node.tagName === 'OPTION') add(node, false);
    });
    document.body.appendChild(back); document.body.appendChild(pop);
    var width = Math.min(Math.max(vw * 0.5, 170), vw - 16);
    var below = vh - rect.bottom - 8, above = rect.top - 8, maxH = vh * 0.5;
    var placeBelow = below >= Math.min(maxH, 200) || below >= above;
    var h = Math.min(maxH, placeBelow ? below : above);
    pop.style.width = width + 'px'; pop.style.maxHeight = Math.max(120, h) + 'px';
    var left = rtl ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    pop.style.left = left + 'px';
    if (placeBelow) pop.style.top = (rect.bottom + 4) + 'px';
    else pop.style.bottom = (vh - rect.top + 4) + 'px';
    if (selectedEl) selectedEl.scrollIntoView({ block: 'center' });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
  }
  function target(e) {
    var s = e.target && e.target.closest ? e.target.closest('select') : null;
    return s && !s.disabled && touchLayout() ? s : null;
  }
  ['pointerdown', 'mousedown'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var s = target(e); if (!s) return;
      e.preventDefault();
      if (t === 'pointerdown') open(s);
    }, true);
  });
  document.addEventListener('click', function (e) { var s = target(e); if (s) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.tagName === 'SELECT' && touchLayout() && !pop) { e.preventDefault(); open(e.target); }
  }, true);
})();
