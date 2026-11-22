/* MASROOF — Recurring-expense schedule engine + confirmation dialogs.
   - The schedule (recurring items) is independent from generated expenses.
   - A confirmation ledger (localStorage) guarantees one transaction per (recurring id, due date).
   - Nothing is ever recorded without an explicit user confirmation. */
(function () {
  var LEDGER_KEY = 'masroof-recurring-ledger-v1';
  var STEP = { weekly: { d: 7 }, monthly: { m: 1 }, quarterly: { m: 3 }, halfYearly: { m: 6 }, yearly: { m: 12 } };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parts(s) { var a = String(s).split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function fmt(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function addDays(s, n) {
    var p = parts(s), dt = new Date(p.y, p.m - 1, p.d + n, 12);
    return fmt(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  function addMonths(start, k) {            // anchored to the start day, clamped to month length
    var p = parts(start), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), m = t % 12;
    var dim = new Date(y, m + 1, 0).getDate();
    return fmt(y, m + 1, Math.min(p.d, dim));
  }
  function baseDate(it) {
    var start = it.startDate || it.nextDate;
    if (it.schedV === 2) return it.schedFrom && it.schedFrom > start ? it.schedFrom : start;
    var legacy = it.schedFrom || it.nextDate || start;      // old items: earlier periods were already handled
    return legacy > start ? legacy : start;
  }
  function dueAt(it, i) {
    var base = baseDate(it), st = STEP[it.frequency];
    if (st && st.m) return addMonths(base, i * st.m);
    var days = st ? st.d : Math.max(1, +it.customDays || 1);
    return addDays(base, i * days);
  }
  function occurrences(it, today) {
    var out = [];
    if (!it || !it.title || !(+it.amount > 0) || it.active === false) return out;
    for (var i = 0; i < 6000; i++) {
      var d = dueAt(it, i);
      if (d > today) break;
      if (it.endDate && d > it.endDate) break;
      out.push(d);
    }
    return out;
  }
  function readLedger() {
    try { return new Set(JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function addLedger(keys) {
    var s = readLedger(); keys.forEach(function (k) { s.add(k); });
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(Array.from(s))); } catch (e) {}
  }
  function key(it, date) { return it.id + '|' + date; }
  function confirmedSet(expenses) {
    var s = readLedger();
    (expenses || []).forEach(function (x) {
      if (x && x.recurringKey) s.add(x.recurringKey);
    });
    return s;
  }
  function legacyMatch(it, date, expenses) {   // keys may be stripped by older saves: fall back to fields
    return (expenses || []).some(function (x) {
      return x && x.date === date && x.shopName === it.title && Math.abs((+x.amount) - (+it.amount)) < 0.005 &&
        /مصروف متكرر|Recurring expense/.test(x.note || '');
    });
  }
  function pending(items, expenses, today) {
    var conf = confirmedSet(expenses), out = [];
    (items || []).forEach(function (it) {
      occurrences(it, today).forEach(function (d) {
        var k = key(it, d);
        if (conf.has(k) || legacyMatch(it, d, expenses)) return;
        out.push({ item: it, date: d, key: k });
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function nextDate(it, expenses, today) {      // first unconfirmed occurrence (past or future); null when finished
    var conf = confirmedSet(expenses);
    for (var i = 0; i < 6000; i++) {
      var d = dueAt(it, i);
      if (it.endDate && d > it.endDate) return null;
      if (!conf.has(key(it, d)) && !(d <= today && legacyMatch(it, d, expenses))) return d;
    }
    return null;
  }

  /* ---------------- UI ---------------- */
  var openDlg = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
  var FREQ = {
    weekly: ['أسبوعي', 'Weekly'], monthly: ['شهري', 'Monthly'], quarterly: ['ربع سنوي', 'Quarterly'],
    halfYearly: ['نصف سنوي', 'Half-yearly'], yearly: ['سنوي', 'Yearly']
  };
  function freqLabel(it, ar) {
    if (it.frequency === 'customDays') return ar ? 'كل ' + it.customDays + ' يوم' : 'Every ' + it.customDays + ' days';
    return (FREQ[it.frequency] || [it.frequency, it.frequency])[ar ? 0 : 1];
  }
  function daysBetween(a, b) {
    var pa = parts(a), pb = parts(b);
    return Math.round((new Date(pb.y, pb.m - 1, pb.d, 12) - new Date(pa.y, pa.m - 1, pa.d, 12)) / 864e5);
  }
  function shell(ar, title, sub) {
    var back = el('div', 'app-dialog-backdrop rec-backdrop'); back.setAttribute('role', 'presentation');
    var dlg = el('section', 'app-dialog rec-dialog'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('dir', ar ? 'rtl' : 'ltr');
    dlg.addEventListener('click', function (e) { e.stopPropagation(); });
    var mark = el('div', 'app-dialog-mark'); mark.innerHTML = ICON;
    var copy = el('div', 'app-dialog-copy'); copy.appendChild(el('h2', '', title)); if (sub) copy.appendChild(el('p', '', sub));
    var head = el('div', 'rec-head'); head.appendChild(mark); head.appendChild(copy);
    dlg.appendChild(head); back.appendChild(dlg);
    return { back: back, dlg: dlg };
  }
  function close(back) { if (back && back.parentNode) back.parentNode.removeChild(back); openDlg = null; }
  function mount(back, onEsc) {
    document.body.appendChild(back); openDlg = back;
    function key(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', key); onEsc(); } }
    document.addEventListener('keydown', key);
    back._off = function () { document.removeEventListener('keydown', key); };
  }
  function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function retro(o) {
    if (openDlg) return;
    var ar = o.ar, it = o.item, list = o.list, f = o.fmt, cur = o.currency;
    var total = list.reduce(function (s, p) { return s + (+p.item.amount); }, 0);
    var sh = shell(ar, ar ? 'تأكيد تسجيل مصروفات بأثر رجعي' : 'Confirm retroactive expenses',
      ar ? 'راجع الملخص التالي. لن يُسجَّل أي مصروف قبل تأكيدك.' : 'Review the summary. Nothing is recorded until you confirm.');
    var rows = el('div', 'rec-rows');
    [
      [ar ? 'اسم المصروف' : 'Expense name', it.title],
      [ar ? 'المبلغ لكل دفعة' : 'Amount per occurrence', f(it.amount) + ' ' + cur],
      [ar ? 'التكرار' : 'Frequency', freqLabel(it, ar)],
      [ar ? 'تاريخ البداية' : 'Start date', it.startDate || it.nextDate],
      [ar ? 'تاريخ النهاية' : 'End date', it.endDate || (ar ? 'مفتوح' : 'Open-ended')],
      [ar ? 'عدد المصروفات التي ستُنشأ' : 'Entries to be created', String(list.length)]
    ].forEach(function (r) { var row = el('div', 'rec-row'); row.appendChild(el('span', '', r[0])); row.appendChild(el('b', '', r[1])); rows.appendChild(row); });
    var tot = el('div', 'rec-row rec-total'); tot.appendChild(el('span', '', ar ? 'إجمالي المبلغ الذي سيُضاف' : 'Total amount to be added')); tot.appendChild(el('b', '', f(total) + ' ' + cur)); rows.appendChild(tot);
    sh.dlg.appendChild(rows);
    var chips = el('div', 'rec-dates');
    list.slice(0, 48).forEach(function (p) { chips.appendChild(el('span', 'rec-chip', p.date)); });
    if (list.length > 48) chips.appendChild(el('span', 'rec-chip', '+' + (list.length - 48)));
    sh.dlg.appendChild(chips);
    sh.dlg.appendChild(el('div', 'rec-notice', ar
      ? 'تنبيه: ستُضاف هذه المصروفات بأثر رجعي إلى الفترات السابقة، وكل مصروف سيُسجَّل بتاريخ استحقاقه الأصلي وليس بتاريخ اليوم.'
      : 'Notice: these entries will be added retroactively to previous periods. Each one is recorded on its original due date, not today.'));
    var act = el('div', 'app-dialog-actions');
    act.appendChild(btn('app-dialog-cancel', ar ? 'إلغاء' : 'Cancel', function () { sh.back._off(); close(sh.back); }));
    act.appendChild(btn('app-dialog-confirm', ar ? 'تأكيد وإضافة ' + list.length + ' مصروف' : 'Confirm & add ' + list.length, function () { sh.back._off(); close(sh.back); o.onConfirm(); }));
    sh.dlg.appendChild(act);
    sh.back.addEventListener('click', function () { sh.back._off(); close(sh.back); });
    mount(sh.back, function () { close(sh.back); });
  }

  function due(o) {
    if (openDlg) return;
    var ar = o.ar, f = o.fmt, cur = o.currency, today = o.today, list = o.list.slice();
    var sh = shell(ar, ar ? 'مصروفات متكررة بانتظار تأكيدك' : 'Recurring expenses awaiting confirmation', '');
    var sum = el('div', 'rec-summary'); sh.dlg.appendChild(sum);
    var box = el('div', 'rec-list'); sh.dlg.appendChild(box);
    sh.dlg.appendChild(el('div', 'rec-notice', ar
      ? 'هذه المصروفات معلّقة ولن تُسجَّل تلقائيًا. عند التأكيد يُسجَّل كل مصروف بتاريخ استحقاقه الأصلي.'
      : 'These payments are pending and are never added automatically. On confirmation each one is recorded on its original due date.'));
    var act = el('div', 'app-dialog-actions rec-actions'); sh.dlg.appendChild(act);
    function done() { sh.back._off(); close(sh.back); }
    function render() {
      var total = list.reduce(function (s, p) { return s + (+p.item.amount); }, 0);
      sum.textContent = ar ? list.length + ' مصروف معلّق · الإجمالي ' + f(total) + ' ' + cur : list.length + ' pending · Total ' + f(total) + ' ' + cur;
      box.textContent = '';
      list.forEach(function (p) {
        var r = el('div', 'rec-item'), info = el('div', 'rec-item-info');
        info.appendChild(el('b', '', p.item.title));
        var late = daysBetween(p.date, today);
        info.appendChild(el('small', '', (ar ? 'تاريخ الاستحقاق: ' : 'Due date: ') + p.date + (late > 0 ? (ar ? ' · متأخر ' + late + ' يوم' : ' · ' + late + ' days late') : (ar ? ' · مستحق اليوم' : ' · due today'))));
        info.appendChild(el('span', 'rec-badge', ar ? 'بانتظار التأكيد' : 'Pending confirmation'));
        var amt = el('strong', '', f(p.item.amount) + ' ' + cur);
        var one = btn('rec-one', ar ? 'تأكيد' : 'Confirm', function () {
          list = list.filter(function (x) { return x !== p; });
          o.onConfirm([p]);
          if (!list.length) done(); else render();
        });
        r.appendChild(info); r.appendChild(amt); r.appendChild(one); box.appendChild(r);
      });
      act.textContent = '';
      act.appendChild(btn('app-dialog-cancel', ar ? 'ذكّرني لاحقًا' : 'Remind me later', done));
      act.appendChild(btn('app-dialog-confirm', ar ? 'تأكيد الكل (' + list.length + ')' : 'Confirm all (' + list.length + ')', function () {
        var all = list.slice(); list = []; o.onConfirm(all); done();
      }));
    }
    render();
    sh.back.addEventListener('click', done);
    mount(sh.back, done);
  }

  function whenUnlocked(cb, tries) {
    tries = tries || 0;
    if (document.querySelector('.lock-screen') && tries < 120) return setTimeout(function () { whenUnlocked(cb, tries + 1); }, 1000);
    cb();
  }

  window.MasroofRecurring = { occurrences: occurrences, pending: pending, nextDate: nextDate, addLedger: addLedger,
    ui: { retro: retro, due: due }, whenUnlocked: whenUnlocked, isOpen: function () { return !!openDlg; } };
})();
