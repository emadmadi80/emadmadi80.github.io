/*
 * Masroof — on-device voice recognition for iPhone (Whisper, runs locally).
 *
 * Loaded BEFORE the app bundle. On iOS it replaces window.SpeechRecognition with a
 * drop-in class that records the microphone, runs Whisper in a Web Worker and fires
 * the same events (onstart / onresult / onerror / onend) the app already uses.
 * No change to the app bundle is needed.
 *
 * Switches (add to the URL):  ?whisper=0  disable   |   ?whisper=1  force on (any device)
 */
(function () {
  "use strict";

  var CFG = {
    model: "Xenova/whisper-base", // multilingual. For better Arabic accuracy try "Xenova/whisper-small" (bigger, slower)
    dtype: "q8",                  // 8-bit quantized: smallest download, works everywhere
    device: "wasm",               // safest on iPhone; WebGPU memory limits on iOS are tight
    maxSeconds: 12,               // hard stop for one recording
    silenceMs: 1300,              // auto-stop after this much silence once speech started
    noSpeechMs: 7000,             // give up if nobody speaks
    preloadDelayMs: 2500          // start downloading the model shortly after the app opens
  };

  var params = new URLSearchParams(location.search);
  var flag = params.get("whisper");
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (flag === "0" || !(flag === "1" || isIOS)) return;

  var NativeSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var scriptSrc = (document.currentScript && document.currentScript.src) ||
    (location.origin + (window.__MASROOF_BASE__ || "/") + "whisper-voice.js");

  // ---------- model / worker state ----------
  var state = { status: "idle", percent: 0 }; // idle | loading | ready | error
  var worker = null;
  var pending = {};
  var nextId = 1;

  function ensureWorker() {
    if (worker || state.status === "error") return worker;
    try {
      worker = new Worker(new URL("whisper-worker.js", scriptSrc), { type: "module" });
    } catch (e) {
      setState("error");
      return null;
    }
    worker.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === "progress") {
        state.percent = m.percent;
        setState("loading");
      } else if (m.type === "ready") {
        setState("ready");
      } else if (m.type === "error") {
        setState("error");
      } else if (m.type === "result") {
        var p = pending[m.id];
        if (p) {
          delete pending[m.id];
          p(m);
        }
      }
    };
    worker.onerror = function () {
      setState("error");
      failAllPending("worker-error");
    };
    return worker;
  }

  function failAllPending(reason) {
    Object.keys(pending).forEach(function (id) {
      var p = pending[id];
      delete pending[id];
      p({ error: reason });
    });
  }

  function preload() {
    var w = ensureWorker();
    if (!w) return;
    if (state.status === "idle") setState("loading");
    w.postMessage({ type: "load", config: CFG });
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {}
  }

  // ---------- small status pill ----------
  var pill = null;
  var pillTimer = null;

  function ensurePill() {
    if (pill || !document.body) return pill;
    pill = document.createElement("div");
    pill.setAttribute("dir", "rtl");
    pill.style.cssText =
      "position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);" +
      "z-index:2147483000;max-width:92vw;padding:6px 14px;border-radius:999px;background:rgba(22,50,79,.94);" +
      "color:#fff;font:600 12px/1.4 system-ui,-apple-system,sans-serif;pointer-events:none;display:none;text-align:center";
    document.body.appendChild(pill);
    return pill;
  }

  function showPill(text, autoHideMs) {
    if (!ensurePill()) return;
    clearTimeout(pillTimer);
    pill.textContent = text;
    pill.style.display = "block";
    if (autoHideMs) pillTimer = setTimeout(hidePill, autoHideMs);
  }

  function hidePill() {
    if (pill) pill.style.display = "none";
  }

  var busy = 0; // active recordings/transcriptions, keeps pill messages from clashing

  function setState(status) {
    state.status = status;
    if (busy) return;
    if (status === "loading") showPill("جارٍ تحميل نموذج الصوت… " + state.percent + "٪ (مرة واحدة فقط)");
    else if (status === "ready") showPill("نموذج الصوت جاهز ✓", 2500);
    else if (status === "error") showPill("تعذر تحميل نموذج الصوت", 4000);
  }

  // ---------- audio helpers ----------
  function resampleTo16k(chunks, inRate) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var all = new Float32Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) {
      all.set(chunks[j], off);
      off += chunks[j].length;
    }
    if (inRate === 16000) return all;
    var ratio = inRate / 16000;
    var outLen = Math.floor(all.length / ratio);
    var out = new Float32Array(outLen);
    for (var k = 0; k < outLen; k++) {
      var start = Math.floor(k * ratio);
      var end = Math.min(all.length, Math.floor((k + 1) * ratio));
      var sum = 0;
      var n = 0;
      for (var s = start; s < end; s++) {
        sum += all[s];
        n++;
      }
      out[k] = n ? sum / n : 0;
    }
    return out;
  }

  function rms(buf) {
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  var HALLUCINATIONS =
    /^(thank you\.?|thanks for watching\.?|you\.?|bye\.?|شكرا للمشاهدة\.?|شكراً للمشاهدة\.?|اشتركوا في القناة\.?|\.+)$/i;

  // ---------- SpeechRecognition replacement ----------
  function WhisperSR() {
    this.lang = "ar-SA";
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.continuous = false;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onresult = null;
    this._active = false;
    this._native = null;
  }

  WhisperSR.prototype._emit = function (name, ev) {
    var fn = this["on" + name];
    if (typeof fn === "function") {
      try {
        fn.call(this, ev || {});
      } catch (e) {
        console.error(e);
      }
    }
  };

  WhisperSR.prototype.start = function () {
    var self = this;
    if (this._active) return;

    // The model could not load at all: fall back to the browser's own recognizer.
    if (state.status === "error" && NativeSR) {
      var n = new NativeSR();
      n.lang = this.lang;
      n.interimResults = this.interimResults;
      n.maxAlternatives = this.maxAlternatives;
      ["start", "end", "error", "result"].forEach(function (h) {
        n["on" + h] = function (e) {
          self._emit(h, e);
        };
      });
      this._native = n;
      n.start();
      return;
    }

    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._emit("error", { error: "audio-capture" });
      this._emit("end");
      return;
    }

    this._active = true;
    this._stopRequested = false;
    busy++;
    preload(); // no-op if already loading / loaded

    // Create the context synchronously inside the tap so iOS lets it run.
    var ctx = new AC();
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    this._ctx = ctx;

    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then(function (stream) {
        self._stream = stream;
        if (self._stopRequested) return self._finish("no-speech");
        if (ctx.state === "suspended" && ctx.resume) ctx.resume();

        var src = ctx.createMediaStreamSource(stream);
        var proc = ctx.createScriptProcessor(4096, 1, 1);
        self._src = src;
        self._proc = proc;

        var chunks = [];
        var frames = 0;
        var noise = 0;
        var noiseN = 0;
        var heard = false;
        var voiceFrames = 0;
        var lastVoiceMs = 0;
        self._chunks = chunks;

        proc.onaudioprocess = function (ev) {
          if (!self._active || self._done) return;
          var data = new Float32Array(ev.inputBuffer.getChannelData(0));
          chunks.push(data);
          frames += data.length;
          var tMs = (frames / ctx.sampleRate) * 1000;
          var level = rms(data);

          if (tMs < 400) {
            noise = (noise * noiseN + level) / (noiseN + 1);
            noiseN++;
          }
          var threshold = Math.max(0.012, noise * 2.5);
          if (level > threshold) {
            voiceFrames += data.length;
            lastVoiceMs = tMs;
            if (!heard && (voiceFrames / ctx.sampleRate) * 1000 > 120) heard = true;
          }
          self._heard = heard;
          self._voiceMs = (voiceFrames / ctx.sampleRate) * 1000;

          if (heard && tMs - lastVoiceMs > CFG.silenceMs) self._finish();
          else if (!heard && tMs > CFG.noSpeechMs) self._finish("no-speech");
          else if (tMs > CFG.maxSeconds * 1000) self._finish();
        };

        src.connect(proc);
        proc.connect(ctx.destination);
        showPill("🎙️ تكلّم الآن…");
        self._emit("start");
      })
      .catch(function (err) {
        var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
        self._cleanupAudio();
        self._active = false;
        busy = Math.max(0, busy - 1);
        hidePill();
        self._emit("error", { error: denied ? "not-allowed" : "audio-capture" });
        self._emit("end");
      });
  };

  WhisperSR.prototype.stop = function () {
    if (this._native) return this._native.stop();
    if (!this._active) return;
    this._stopRequested = true;
    if (this._proc) this._finish();
  };

  WhisperSR.prototype.abort = function () {
    if (this._native) return this._native.abort();
    this._aborted = true;
    if (this._active && this._proc) this._finish();
  };

  WhisperSR.prototype._cleanupAudio = function () {
    try {
      if (this._proc) {
        this._proc.onaudioprocess = null;
        this._proc.disconnect();
      }
      if (this._src) this._src.disconnect();
      if (this._stream) this._stream.getTracks().forEach(function (t) { t.stop(); });
      if (this._ctx && this._ctx.close) this._ctx.close();
    } catch (e) {}
  };

  WhisperSR.prototype._finish = function (reason) {
    if (this._done) return;
    this._done = true;
    var self = this;
    var rate = this._ctx ? this._ctx.sampleRate : 44100;
    var chunks = this._chunks || [];
    var heard = this._heard;
    var voiceMs = this._voiceMs || 0;
    this._cleanupAudio();
    this._active = false;

    if (this._aborted) {
      busy = Math.max(0, busy - 1);
      hidePill();
      this._emit("end");
      return;
    }

    if (reason === "no-speech" || !heard || !chunks.length) {
      busy = Math.max(0, busy - 1);
      hidePill();
      this._emit("error", { error: "no-speech" });
      this._emit("end");
      return;
    }

    // Recording is over: leave the "listening" state, then deliver the text when ready.
    this._emit("end");
    showPill(
      state.status === "ready"
        ? "جارٍ تحويل الصوت إلى نص…"
        : "جارٍ تجهيز نموذج الصوت… سيظهر النص فور الانتهاء"
    );

    var audio = resampleTo16k(chunks, rate);
    var language = /^en/i.test(this.lang) ? "english" : "arabic";
    var id = nextId++;
    var w = ensureWorker();
    var timer = setTimeout(function () {
      if (pending[id]) {
        delete pending[id];
        done({ error: "timeout" });
      }
    }, 240000);

    function done(m) {
      clearTimeout(timer);
      busy = Math.max(0, busy - 1);
      var text = (m && m.text) || "";
      var hallucinated = voiceMs < 1200 && HALLUCINATIONS.test(text.trim());
      if (!m || m.error || !text.trim() || hallucinated) {
        showPill("لم أفهم الصوت، حاول مرة أخرى", 2500);
        self._emit("error", { error: m && m.error ? "network" : "no-speech" });
        return;
      }
      hidePill();
      var alt = { transcript: text.trim(), confidence: 0.9 };
      var res = [alt];
      res.isFinal = true;
      self._emit("result", { resultIndex: 0, results: [res] });
    }

    if (!w) return done({ error: "no-worker" });
    pending[id] = done;
    w.postMessage({ type: "transcribe", id: id, audio: audio, language: language, config: CFG }, [audio.buffer]);
  };

  // ---------- install ----------
  window.SpeechRecognition = WhisperSR;
  window.__whisperVoice = { config: CFG, state: state, resampleTo16k: resampleTo16k, WhisperSR: WhisperSR };

  function boot() {
    setTimeout(preload, CFG.preloadDelayMs);
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
