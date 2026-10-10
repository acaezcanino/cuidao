import { useEffect, useRef, useState } from "react";
import { DEMO_MED, lookupBarcode } from "./ndc.js";
import { Icon } from "./ui.jsx";

// Caregiver tool: point the camera at the barcode on a medicine bottle.
// The code is read on this device; only the number is sent to the FDA's public
// NDC Directory to get the name, strength (mg) and pills per bottle.
// The caregiver always reviews the result before it's saved.

const FORMATS_NATIVE = [
  "upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39", "code_93", "itf", "codabar", "data_matrix", "qr_code", "pdf417",
];

// Ways to look at one camera frame. Webcams are low-res and can't focus up close,
// so a small barcode on a curved bottle is only a couple of blurry pixels per bar.
// We crop the middle (where the on-screen box is), enlarge it 2x and sharpen it
// (unsharp mask) before decoding — in tests that turned unreadable blurry codes
// into readable ones. The decoder itself also tries 90°/180°/270° turns.
const VIEWS = [
  { crop: [0.06, 0.15, 0.88, 0.7], scale: 2, sharpen: 2, radius: 4 },
  { crop: [0.06, 0.15, 0.88, 0.7], scale: 2, sharpen: 1.5, radius: 2 },
  { crop: [0, 0, 1, 1], scale: 1, sharpen: 1.5, radius: 2 },
  { crop: [0.2, 0.25, 0.6, 0.5], scale: 3, sharpen: 2.5, radius: 6 },
  { crop: [0.06, 0.15, 0.88, 0.7], scale: 2, sharpen: 0 },
];

// Unsharp mask on an RGBA ImageData, in place: out = g + amount·(g − blur(g)).
function sharpen(img, amount, r = 2) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  // separable box blur of radius r
  const k = 2 * r + 1, tmp = new Float32Array(n), blur = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += g[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / k;
      acc += g[row + Math.min(w - 1, x + r + 1)] - g[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      blur[y * w + x] = acc / k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, g[i] + amount * (g[i] - blur[i])));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
  }
  return img;
}

async function makeDecoder() {
  // 1) Built-in BarcodeDetector (Chrome/Edge on Android, macOS, ChromeOS)
  if ("BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS_NATIVE.filter((f) => supported.includes(f));
      if (formats.includes("upc_a")) {
        const det = new window.BarcodeDetector({ formats });
        return async (src) => (await det.detect(src))[0]?.rawValue || null;
      }
    } catch {
      /* fall through to ZXing */
    }
  }
  // 2) ZXing-C++ compiled to WebAssembly (Windows/Linux Chrome & Edge, Firefox, Safari).
  //    The .wasm file is served by our own app (no CDN), loaded only when the scanner opens.
  const [{ prepareZXingModule, readBarcodes }, { default: wasmUrl }] = await Promise.all([
    import("zxing-wasm/reader"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) } });
  const options = {
    tryHarder: true,
    tryRotate: true,
    tryInvert: false,
    tryDownscale: true,
    maxNumberOfSymbols: 1,
    formats: ["UPC-A", "UPC-E", "EAN-13", "EAN-8", "Code128", "Code39", "Code93", "ITF", "Codabar", "DataMatrix", "QRCode", "PDF417"],
  };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  async function tryView(src, w, h, v) {
    const [cx, cy, cw, ch] = v.crop;
    const sx = cx * w, sy = cy * h, sw = cw * w, sh = ch * h;
    const scale = Math.min(v.scale, 1600 / sw); // never larger than ~1600 px wide
    const dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
    canvas.width = dw; canvas.height = dh;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
    let img = ctx.getImageData(0, 0, dw, dh);
    if (v.sharpen) img = sharpen(img, v.sharpen, v.radius);
    const found = await readBarcodes(img, options);
    return found[0]?.text || null;
  }

  let turn = 0;
  // Live video: one view per frame, taking turns, so the page stays smooth.
  // A still photo (all: true): every view, once.
  return async (src, { all = false } = {}) => {
    const w = src.videoWidth || src.naturalWidth || src.width;
    const h = src.videoHeight || src.naturalHeight || src.height;
    if (!w || !h) return null;
    const views = all ? VIEWS : [VIEWS[turn++ % VIEWS.length]];
    for (const v of views) {
      const text = await tryView(src, w, h, v);
      if (text) return text;
    }
    return null;
  };
}

export default function BarcodeScanner({ t, lang = "es", mode = "add", onUse, onDemo, onClose }) {
  const s = t.scan;
  const video = useRef(null);
  const [phase, setPhase] = useState("starting"); // starting | scanning | looking | found | notfound | error
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [info, setInfo] = useState(null);
  const [round, setRound] = useState(0); // "scan again" restarts the camera
  const stopCam = useRef(() => {});
  const halt = useRef(() => {}); // stop the loops but keep the last frame on screen
  const cardTimer = useRef(null);
  const onDemoRef = useRef(onDemo);
  onDemoRef.current = onDemo; // the camera loop is set up once; always call the latest handler
  const [seeing, setSeeing] = useState(0); // 0..1: how sure we are a bottle is in view
  const decoderRef = useRef(null);
  const [slow, setSlow] = useState(false); // nothing read after 8 s: show tips + photo option
  const [photoBusy, setPhotoBusy] = useState(false);

  // A sharp photo (phone camera, or the laptop photo app) reads far better than a
  // blurry live webcam frame. Decoded here on the device, like the live video.
  async function readPhoto(file) {
    if (!file) return;
    setPhotoBusy(true);
    setErr("");
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const decode = decoderRef.current || (await makeDecoder());
      const raw = await decode(img, { all: true });
      URL.revokeObjectURL(url);
      if (raw) lookup(raw);
      else { setCode(""); register(); } // prototype: unreadable photo still registers
    } catch (e) {
      console.error("[scanner photo]", e);
      setErr("photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function lookup(raw) {
    halt.current();
    setCode(raw);
    setPhase("looking");
    let found = null;
    try {
      found = await lookupBarcode(raw);
    } catch {
      found = null; // no internet: fall back to the demo below
    }
    if (found) {
      setInfo(found);
      setPhase("found");
      return;
    }
    // Prototype: a code that isn't in the FDA list registers the prototype medication.
    register();
  }

  // Prototype: the bottle was seen (or its code read) → register the prototype
  // medication. The frame turns green with a check, then the summary card shows.
  function register() {
    halt.current();
    setInfo(DEMO_MED);
    setPhase("registered");
    onDemoRef.current?.(DEMO_MED);
    clearTimeout(cardTimer.current);
    cardTimer.current = setTimeout(() => setPhase("demo"), 1400);
  }

  useEffect(() => {
    let stream, timer, slowTimer, bottleTimer, fallbackTimer, detector, stopped = false;
    setSlow(false);
    setSeeing(0);
    const haltLoops = () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
      clearTimeout(bottleTimer);
      clearTimeout(fallbackTimer);
      video.current?.pause();
    };
    const stop = () => {
      haltLoops();
      stream?.getTracks().forEach((tr) => tr.stop());
      detector?.close();
      detector = null;
    };
    halt.current = haltLoops;
    stopCam.current = stop;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: "NotFoundError" });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) return;
        // Ask for continuous autofocus where the camera supports it (phones, some webcams).
        const track = stream.getVideoTracks()[0];
        try {
          if (track.getCapabilities?.().focusMode?.includes("continuous")) {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          }
        } catch { /* not supported: fine */ }
        video.current.srcObject = stream;
        await video.current.play();
        const decode = await makeDecoder();
        decoderRef.current = decode;
        if (stopped) return;
        setPhase("scanning");
        slowTimer = setTimeout(() => setSlow(true), 8000);
        const tick = async () => {
          if (stopped) return;
          const v = video.current;
          const raw = v && v.readyState >= 2 ? await decode(v) : null;
          if (raw && !stopped) {
            lookup(raw); // also stops the camera
            return;
          }
          timer = setTimeout(tick, 120);
        };
        tick();

        // Bottle detector (YOLO, on this device): a bottle in view for ~1 s registers it,
        // even when the label is too blurry to read.
        try {
          const { loadBottleDetector } = await import("./vision.js");
          detector = await loadBottleDetector();
          if (stopped) { detector.close(); detector = null; return; }
          let hits = 0;
          const look = async () => {
            if (stopped || !detector) return;
            const v = video.current;
            const boxes = v && v.readyState >= 2 ? await detector.detect(v) : [];
            if (stopped) return;
            hits = boxes.some((b) => b.score >= 0.3) ? hits + 1 : Math.max(0, hits - 1);
            setSeeing(Math.min(1, hits / 4));
            if (hits >= 4) { register(); return; }
            bottleTimer = setTimeout(look, 200);
          };
          look();
        } catch (e) {
          // No bottle model available: register after a few seconds of scanning instead.
          console.warn("[scanner] bottle detector unavailable", e);
          fallbackTimer = setTimeout(() => { if (!stopped) register(); }, 5000);
        }
      } catch (e) {
        if (stopped) return;
        console.error("[scanner]", e);
        setErr(e?.name === "NotAllowedError" ? "denied" : e?.name === "NotFoundError" ? "nocam" : "load");
        setPhase("error");
      }
    })();
    return () => { stop(); clearTimeout(cardTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  // Release the camera once we've moved on to a result.
  useEffect(() => {
    if (["found", "demo", "notfound", "error"].includes(phase)) stopCam.current();
  }, [phase]);

  const camOn = ["starting", "scanning", "looking", "registered"].includes(phase);

  return (
    <section className="scanner" aria-labelledby="scan-title">
      <div className="scanner-head">
        <h3 id="scan-title"><Icon name="barcode" size={24} /> {mode === "refill" ? s.titleRefill : s.title}</h3>
        <button type="button" className="icon-btn" aria-label={s.close} title={s.close} onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
      </div>

      {camOn && (
        <>
          <p className="field-hint">{s.hint}</p>
          <div className={`scan-stage ${phase === "registered" ? "is-ok" : seeing > 0 ? "is-seeing" : ""}`}>
            <video ref={video} muted playsInline aria-hidden="true" />
            <span className="scan-frame" aria-hidden="true" />
            {phase === "starting" && <div className="scan-overlay"><span className="spinner" />{s.starting}</div>}
            {phase === "scanning" && (
              <span className="scan-live" aria-hidden="true">{seeing > 0 ? s.seeing : s.scanning}</span>
            )}
            {phase === "scanning" && seeing > 0 && (
              <span className="scan-progress" aria-hidden="true"><span style={{ width: `${Math.round(seeing * 100)}%` }} /></span>
            )}
            {phase === "registered" && (
              <div className="scan-overlay ok"><Icon name="check" size={64} /><strong>{s.registered}</strong></div>
            )}
          </div>
          {slow && phase === "scanning" && (
            <div className="scan-tips" role="note">
              <strong>{s.tipsTitle}</strong>
              <ul>{s.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <label className="btn ghost small scan-photo">
        <Icon name="camera" size={20} /> {photoBusy ? s.photoBusy : s.photo}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => { readPhoto(e.target.files?.[0]); e.target.value = ""; }}
        />
      </label>
      {err === "photo" && phase !== "error" && <p className="scan-msg warn"><Icon name="alert" size={20} /> {s.err.photo}</p>}

      <div role="status" aria-live="polite" className="scan-status">
        {phase === "looking" && <p className="scan-msg"><span className="spinner small" /> {s.looking(code)}</p>}
        {phase === "notfound" && <p className="scan-msg warn"><Icon name="alert" size={20} /> {s.notFound(code)}</p>}
        {phase === "error" && <p className="scan-msg warn"><Icon name="alert" size={20} /> {s.err[err]}</p>}
      </div>

      {phase === "found" && info && (
        <div className="scan-result">
          <p className="scan-name">{info.name}{info.strength && <span className="strength"> {info.strength}</span>}</p>
          {info.brand && <p className="scan-line">{s.brand}: {info.brand}</p>}
          <dl className="scan-facts">
            <div><dt>{s.strength}</dt><dd>{info.strength || "—"}</dd></div>
            <div><dt>{s.count}</dt><dd>{info.count ?? "—"}</dd></div>
            <div><dt>{s.form}</dt><dd>{info.form || "—"}</dd></div>
          </dl>
          <p className="scan-line small">NDC {info.ndc}{info.labeler && ` · ${info.labeler}`}</p>
          {info.count == null && <p className="scan-line small">{s.noCount}</p>}
          <p className="field-hint">{s.review}</p>
          <div className="confirm-actions">
            <button type="button" className="btn primary small" onClick={() => onUse(info)}>
              <Icon name="check" size={20} /> {mode === "refill" ? s.useRefill(info.count) : s.use}
            </button>
            <button type="button" className="btn ghost small" onClick={() => { setInfo(null); setRound((r) => r + 1); setPhase("starting"); }}>
              {s.again}
            </button>
          </div>
        </div>
      )}

      {phase === "demo" && (
        <div className="scan-result is-ok">
          <p className="scan-ok"><Icon name="check" size={22} /> {s.registered}</p>
          <p className="scan-name">{DEMO_MED.names[lang] || DEMO_MED.name}<span className="strength"> {DEMO_MED.strength}</span></p>
          <dl className="scan-facts">
            <div><dt>{s.strength}</dt><dd>{DEMO_MED.strength}</dd></div>
            <div><dt>{s.count}</dt><dd>{DEMO_MED.count}</dd></div>
            <div><dt>{s.form}</dt><dd>{lang === "es" ? "Tableta" : "Tablet"}</dd></div>
          </dl>
          <p className="note note-good"><Icon name="check" size={20} /> {mode === "refill" ? s.demoRefill : s.demoAdded}</p>
          <div className="confirm-actions">
            <button type="button" className="btn primary small" onClick={onClose}>{s.done}</button>
            <button type="button" className="btn ghost small" onClick={() => { setInfo(null); setCode(""); setRound((r) => r + 1); setPhase("starting"); }}>
              {s.again}
            </button>
          </div>
        </div>
      )}

      {(phase === "notfound" || phase === "error") && (
        <button type="button" className="btn ghost small" onClick={() => { setErr(""); setRound((r) => r + 1); setPhase("starting"); }}>
          <Icon name="refresh" size={18} /> {s.again}
        </button>
      )}

      {/* No camera, blurry label, or for the demo: type the number under the barcode */}
      <form
        className="scan-manual"
        onSubmit={(e) => { e.preventDefault(); if (typed.trim()) lookup(typed.trim()); }}
      >
        <label>
          {s.manual}
          <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="3 31722 75730 0" autoComplete="off" />
        </label>
        <button className="btn ghost small" disabled={phase === "looking"}>{s.search}</button>
      </form>
      <p className="field-hint small">{s.privacy}</p>
    </section>
  );
}
