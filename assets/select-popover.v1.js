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
    back.addEventListener('pointerdown', function (e) { if (Date.now() - openedAt < 350) return; e.preventDefault(); close(); });
    back.addEventListener('click', function (e) { if (Date.now() - openedAt < 350) return; e.preventDefault(); close(); });
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
  var openedAt = 0, tracking = null, lastTouchOpen = 0;
  function target(e) {
    var s = e.target && e.target.closest ? e.target.closest('select') : null;
    return s && !s.disabled && touchLayout() ? s : null;
  }
  function guardedOpen(s) { openedAt = Date.now(); open(s); }
  /* Touch: open only on a real tap (finger barely moved, short press). A scroll gesture that merely
     starts on a select never opens it. preventDefault on touchend also cancels the native picker. */
  document.addEventListener('touchstart', function (e) {
    var s = target(e); tracking = null;
    if (!s || e.touches.length !== 1) return;
    tracking = { s: s, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!tracking) return;
    var t = e.touches[0];
    if (Math.abs(t.clientX - tracking.x) > 10 || Math.abs(t.clientY - tracking.y) > 10) tracking = null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    var tr = tracking; tracking = null;
    if (!tr || Date.now() - tr.t > 700) return;
    if (e.cancelable) e.preventDefault();
    lastTouchOpen = Date.now();
    guardedOpen(tr.s);
  }, { capture: true, passive: false });
  document.addEventListener('touchcancel', function () { tracking = null; }, true);
  /* Mouse / pen on a narrow window: block the native picker on mousedown, open on click. */
  document.addEventListener('mousedown', function (e) { if (target(e) && Date.now() - lastTouchOpen > 600) e.preventDefault(); }, true);
  document.addEventListener('click', function (e) {
    var s = target(e); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    if (Date.now() - lastTouchOpen > 600 && !pop) guardedOpen(s);
  }, true);
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.tagName === 'SELECT' && touchLayout() && !pop) { e.preventDefault(); guardedOpen(e.target); }
  }, true);
  /* A floating list must never survive page scrolling. */
  window.addEventListener('scroll', function (e) { if (pop && !(e.target && e.target.nodeType === 1 && pop.contains(e.target))) close(); }, true);
  window.__spOpenedAt = function () { return openedAt; };
})();
