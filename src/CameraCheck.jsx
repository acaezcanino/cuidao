import { useEffect, useRef, useState } from "react";
import { createHoldTracker, isHolding } from "./visionLogic.js";
import { Icon } from "./ui.jsx";

// Optional camera check shown inside the alarm (step 2). It looks for a hand
// HOLDING a bottle-like object for ~1.2 s, then calls onVerified().
// It never blocks the "Listo" button and never claims the pill was swallowed.
// Video is processed on this device only: nothing is recorded or uploaded.

const HAND = "#ffffff";
const HAND_OK = "#3ddc84";
const BOTTLE = "#ff941e";

export default function CameraCheck({ t, onVerified, onError, onClose }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | running | verified | error
  const [error, setError] = useState("");
  const [hint, setHint] = useState("prompt"); // prompt | hand | bottle | hold
  const [progress, setProgress] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    let stream, engine, raf, cancelled = false;
    const tracker = createHoldTracker({ needMs: 1200, graceMs: 300 });
    let bottles = [];
    let lastYolo = 0;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("nocam"), { code: "nocam" });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) return;
        video.current.srcObject = stream;
        await video.current.play();
        const { loadVision } = await import("./vision.js"); // loaded only when needed
        engine = await loadVision();
        if (cancelled) return engine.close();
        setPhase("running");
        loop();
      } catch (err) {
        console.error("[camera]", err);
        const code =
          err?.name === "NotAllowedError" ? "denied" :
          err?.name === "NotFoundError" || err?.code === "nocam" ? "nocam" : "models";
        setError(code);
        onError?.(code);
        setPhase("error");
      }
    }

    function loop() {
      if (cancelled) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState >= 2) {
        const w = v.videoWidth, h = v.videoHeight;
        if (c.width !== w) { c.width = w; c.height = h; }
        const now = performance.now();
        const hands = engine.detectHands(v, now);
        if (now - lastYolo > 150) {
          lastYolo = now;
          engine.detectBottles(v).then((b) => { if (b) bottles = b; }).catch(() => {});
        }
        // Pick the best hand/bottle pair
        let holding = false;
        const handOk = hands.map((lm) => bottles.some((b) => isHolding(lm, b, w, h).holding));
        holding = handOk.some(Boolean);
        const state = tracker.update(holding, now);
        draw(c, hands, handOk, bottles);

        setProgress(state.progress);
        setHint(holding ? "hold" : bottles.length ? "bottle" : hands.length ? "hand" : "prompt");
        if (state.done && !done.current) {
          done.current = true;
          setPhase("verified");
          onVerified?.();
          return stopAll();
        }
      }
      raf = requestAnimationFrame(loop);
    }

    function stopAll() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      engine?.close();
      engine = null;
    }

    start();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hints = { prompt: t.camPrompt, hand: t.camSeeHand, bottle: t.camSeeBottle, hold: t.camHold };

  return (
    <section className="camcheck" aria-labelledby="cam-title">
      <h3 id="cam-title" className="sr-only">{t.camVerify}</h3>

      <div className={`cam-stage is-${phase}`}>
        <video ref={video} muted playsInline aria-hidden="true" />
        <canvas ref={canvas} aria-hidden="true" />
        {phase === "loading" && <div className="cam-overlay"><span className="spinner" />{t.camLoading}</div>}
        {phase === "verified" && (
          <div className="cam-overlay ok"><Icon name="check" size={56} /><strong>{t.camVerified}</strong></div>
        )}
        {phase === "error" && <div className="cam-overlay err">{t.camErr[error]}</div>}
      </div>

      {phase === "running" && (
        <>
          <p className="cam-hint" aria-live="polite">{hints[hint]}</p>
          <div className="cam-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </>
      )}
      <p className="cam-note">{t.camPrivacy} {t.camNotProof}</p>
      <button className="btn ghost-dark small" onClick={onClose}>
        {phase === "verified" ? t.camDone : t.camClose}
      </button>
    </section>
  );
}

function draw(c, hands, handOk, bottles) {
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const lw = Math.max(3, c.width / 160);

  for (const b of bottles) {
    ctx.strokeStyle = BOTTLE;
    ctx.lineWidth = lw;
    ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  }
  hands.forEach((lm, k) => {
    const col = handOk[k] ? HAND_OK : HAND;
    const P = (i) => [lm[i].x * c.width, lm[i].y * c.height];
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    for (const { start, end } of HAND_LINKS) {
      const [x1, y1] = P(start), [x2, y2] = P(end);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.fillStyle = col;
    for (let i = 0; i < 21; i++) {
      const [x, y] = P(i);
      ctx.beginPath(); ctx.arc(x, y, lw * 1.3, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// The 21-point hand skeleton (same topology as MediaPipe HAND_CONNECTIONS).
const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
].map(([start, end]) => ({ start, end }));
