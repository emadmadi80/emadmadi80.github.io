// Masroof — on-device speech recognition worker (Whisper via Transformers.js).
// Runs in a module Web Worker so the UI never freezes while the model works.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels = false;       // models come from the Hugging Face Hub
env.useBrowserCache = true;         // cached in Cache Storage after the first download
env.backends.onnx.wasm.numThreads = 1; // GitHub Pages cannot send COOP/COEP headers, so no threads

let transcriber = null;
let loading = null;
let config = null;
const fileProgress = {};
let lastPercent = 0;

function post(msg) {
  self.postMessage(msg);
}

function onProgress(p) {
  if (p && p.status === "progress" && p.total) {
    fileProgress[p.file] = { loaded: p.loaded || 0, total: p.total };
    let loaded = 0;
    let total = 0;
    for (const k in fileProgress) {
      loaded += fileProgress[k].loaded;
      total += fileProgress[k].total;
    }
    const percent = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
    if (percent > lastPercent) {
      lastPercent = percent;
      post({ type: "progress", percent });
    }
  }
}

function load(cfg) {
  if (cfg) config = cfg;
  if (loading) return loading;
  if (!config) return Promise.reject(new Error("no-config"));
  loading = pipeline("automatic-speech-recognition", config.model, {
    device: config.device,
    dtype: config.dtype,
    progress_callback: onProgress,
  })
    .then((p) => {
      transcriber = p;
      post({ type: "ready" });
      return p;
    })
    .catch((err) => {
      loading = null;
      post({ type: "error", message: String((err && err.message) || err) });
      throw err;
    });
  return loading;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "load") {
    load(msg.config).catch(() => {});
    return;
  }
  if (msg.type === "transcribe") {
    try {
      if (!transcriber) await load(msg.config);
      const out = await transcriber(msg.audio, {
        language: msg.language || "arabic",
        task: "transcribe",
        chunk_length_s: 30,
        return_timestamps: false,
      });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
      post({ type: "result", id: msg.id, text: String(text || "").trim() });
    } catch (err) {
      post({ type: "result", id: msg.id, error: String((err && err.message) || err) });
    }
  }
};
