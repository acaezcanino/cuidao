// Pure computer-vision helpers (no browser APIs) so they can be unit-tested.
// Used by vision.js (models) and CameraCheck.jsx (UI).

export const YOLO_SIZE = 320; // model input (exported with imgsz=320)

// COCO classes the pre-trained YOLO11n knows that look like a pill bottle.
// There is no "pill bottle" class in COCO; see docs for fine-tuning.
export const BOTTLE_CLASSES = { 39: "bottle", 41: "cup" };

// Letterbox: fit a srcW x srcH frame into a size x size square, centered.
export function letterbox(srcW, srcH, size = YOLO_SIZE) {
  const scale = Math.min(size / srcW, size / srcH);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  return { scale, w, h, padX: Math.floor((size - w) / 2), padY: Math.floor((size - h) / 2) };
}

// RGBA pixels (size*size*4) -> Float32 CHW tensor data in [0,1].
export function rgbaToCHW(rgba, size = YOLO_SIZE) {
  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = rgba[p] / 255;
    out[n + i] = rgba[p + 1] / 255;
    out[2 * n + i] = rgba[p + 2] / 255;
  }
  return out;
}

export function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return ua > 0 ? inter / ua : 0;
}

export function nms(boxes, iouThr = 0.45) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep = [];
  for (const b of sorted) {
    if (keep.every((k) => k.cls !== b.cls || iou(k, b) < iouThr)) keep.push(b);
  }
  return keep;
}

// Decode YOLOv8/YOLO11 output [1, 4 + numClasses, N] (cx, cy, w, h in model
// pixels, then per-class scores) into boxes in SOURCE frame pixels.
export function decodeYolo(data, { numAnchors, numClasses = 80, classes = BOTTLE_CLASSES, scoreThr = 0.3, lb, srcW, srcH }) {
  const N = numAnchors;
  const boxes = [];
  for (let i = 0; i < N; i++) {
    let best = 0, bestCls = -1;
    for (const c of Object.keys(classes)) {
      const s = data[(4 + Number(c)) * N + i];
      if (s > best) { best = s; bestCls = Number(c); }
    }
    if (best < scoreThr) continue;
    const cx = data[i], cy = data[N + i], w = data[2 * N + i], h = data[3 * N + i];
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    boxes.push({
      x1: clamp((cx - w / 2 - lb.padX) / lb.scale, srcW),
      y1: clamp((cy - h / 2 - lb.padY) / lb.scale, srcH),
      x2: clamp((cx + w / 2 - lb.padX) / lb.scale, srcW),
      y2: clamp((cy + h / 2 - lb.padY) / lb.scale, srcH),
      score: best,
      cls: bestCls,
      label: classes[bestCls],
    });
  }
  return nms(boxes);
}

// MediaPipe 21-point hand: fingertips are thumb 4, index 8, middle 12, ring 16, pinky 20.
export const FINGERTIPS = [4, 8, 12, 16, 20];

export function handBox(landmarks, w, h) {
  const xs = landmarks.map((p) => p.x * w), ys = landmarks.map((p) => p.y * h);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

// Is this hand holding this bottle? A grip wraps the fingertips around the
// object, so several fingertips fall on (or right next to) the bottle box,
// and the hand overlaps the bottle.
export function isHolding(landmarks, bottle, w, h, { margin = 0.2, minTips = 3 } = {}) {
  const mx = (bottle.x2 - bottle.x1) * margin, my = (bottle.y2 - bottle.y1) * margin;
  const ex = { x1: bottle.x1 - mx, y1: bottle.y1 - my, x2: bottle.x2 + mx, y2: bottle.y2 + my };
  let tips = 0;
  for (const i of FINGERTIPS) {
    const x = landmarks[i].x * w, y = landmarks[i].y * h;
    if (x >= ex.x1 && x <= ex.x2 && y >= ex.y1 && y <= ex.y2) tips++;
  }
  const hb = handBox(landmarks, w, h);
  const inter =
    Math.max(0, Math.min(hb.x2, bottle.x2) - Math.max(hb.x1, bottle.x1)) *
    Math.max(0, Math.min(hb.y2, bottle.y2) - Math.max(hb.y1, bottle.y1));
  const handArea = Math.max(1, (hb.x2 - hb.x1) * (hb.y2 - hb.y1));
  const overlap = inter / handArea;
  return { holding: tips >= minTips || (tips >= 2 && overlap >= 0.25), tips, overlap };
}

// Requires the "holding" signal to stay on for `needMs`, tolerating short
// drop-outs (`graceMs`) so one missed frame doesn't reset the progress.
export function createHoldTracker({ needMs = 1200, graceMs = 300 } = {}) {
  let start = null, lastSeen = null;
  return {
    update(holding, t) {
      if (holding) {
        if (start === null || t - lastSeen > graceMs) start = t;
        lastSeen = t;
      } else if (lastSeen !== null && t - lastSeen > graceMs) {
        start = null;
      }
      const held = start === null ? 0 : lastSeen - start;
      return { progress: Math.min(1, held / needMs), done: held >= needMs };
    },
    reset() { start = null; lastSeen = null; },
  };
}
