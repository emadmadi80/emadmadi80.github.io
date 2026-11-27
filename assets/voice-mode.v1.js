/* MASROOF — voice input mode: "fast" (browser speech recognition, hands-free) or "record" (record, then transcribe).
   The choice is stored per device. First launch asks once; More tab has a card to change it. */
(function () {
  var KEY = 'masroof-voice-mode-v1', open = false;
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function recommended() { return isIOS() ? 'record' : 'fast'; }
  function mode() { try { var v = localStorage.getItem(KEY); return v === 'record' || v === 'fast' ? v : ''; } catch (e) { return ''; } }
  function effective() { return mode() || recommended(); }
  function set(m) {
    if (m !== 'fast' && m !== 'record') return;
    try { localStorage.setItem(KEY, m); } catch (e) {}
    document.dispatchEvent(new CustomEvent('masroof-voice-mode', { detail: m }));
  }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  var MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>';
  var WAVE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 4v16"/><path d="M14 8v8"/><path d="M18 6v12"/><path d="M22 12h-2"/></svg>';

  function chooser() {
    if (open) return; open = true;
    var ar = (document.documentElement.getAttribute('lang') || 'ar') !== 'en', rec = recommended(), sel = rec;
    var back = el('div', 'app-dialog-backdrop vm-backdrop'), dlg = el('section', 'app-dialog rec-dialog vm-dialog');
    dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('dir', ar ? 'rtl' : 'ltr');
    var head = el('div', 'rec-head'), mark = el('div', 'app-dialog-mark'); mark.innerHTML = MIC;
    var copy = el('div', 'app-dialog-copy');
    copy.appendChild(el('h2', '', ar ? 'اختر طريقة الإدخال الصوتي' : 'Choose your voice input'));
    copy.appendChild(el('p', '', ar ? 'يمكنك تغييرها لاحقًا من تبويب المزيد.' : 'You can change it later in the More tab.'));
    head.appendChild(mark); head.appendChild(copy); dlg.appendChild(head);
    var list = el('div', 'vm-list'); dlg.appendChild(list);
    var opts = [
      ['fast', MIC, ar ? 'تعرّف صوتي فوري' : 'Instant speech recognition',
        ar ? 'يبدأ تلقائيًا ويتوقف وحده عند انتهاء كلامك، دون الضغط لإيقاف الميكروفون. الأنسب لأندرويد والكمبيوتر.' : 'Starts automatically and stops by itself when you finish talking. Best for Android and desktop.'],
      ['record', WAVE, ar ? 'تسجيل ثم تحويل لنص' : 'Record, then transcribe',
        ar ? 'تضغط للبدء وتضغط للإيقاف، ثم يُحوَّل الصوت إلى نص. الأنسب لآيفون.' + (window.MASROOF_VOICE_API ? '' : ' على هذا التطبيق يعمل بإملاء لوحة المفاتيح لعدم توفر خدمة تحويل.')
           : 'Tap to start, tap to stop, then the audio is turned into text. Best for iPhone.' + (window.MASROOF_VOICE_API ? '' : ' Here it uses keyboard dictation because no transcription service is configured.')]
    ];
    function paint() {
      list.textContent = '';
      opts.forEach(function (o) {
        var b = el('button', 'vm-opt' + (sel === o[0] ? ' sel' : '')); b.type = 'button';
        var ico = el('span', 'vm-ico'); ico.innerHTML = o[1];
        var tx = el('span'), t = el('b', '', o[2]);
        if (rec === o[0]) t.appendChild(el('span', 'vm-tag', ar ? 'مقترح لجهازك' : 'Suggested for your device'));
        tx.appendChild(t); tx.appendChild(el('small', '', o[3]));
        b.appendChild(ico); b.appendChild(tx);
        b.addEventListener('click', function () { sel = o[0]; paint(); });
        list.appendChild(b);
      });
    }
    paint();
    var act = el('div', 'app-dialog-actions'), ok = el('button', 'app-dialog-confirm', ar ? 'حفظ الاختيار' : 'Save choice'); ok.type = 'button';
    ok.style.width = '100%';
    ok.addEventListener('click', function () { set(sel); back.remove(); open = false; });
    act.appendChild(ok); dlg.appendChild(act); back.appendChild(dlg); document.body.appendChild(back);
  }

  function boot() {
    if (mode()) return;
    var tries = 0;
    (function wait() {
      var ready = document.querySelector('#root .app-shell') && !document.querySelector('.lock-screen');
      if (ready) return setTimeout(function () { if (!mode()) chooser(); }, 500);
      if (++tries < 120) setTimeout(wait, 500);
    })();
  }
  window.MasroofVoiceMode = { mode: mode, effective: effective, recommended: recommended, set: set, isOpen: function () { return open; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
