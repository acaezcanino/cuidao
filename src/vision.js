// On-device computer vision for the optional "Verificar con la cámara" check.
//  - Google MediaPipe HandLandmarker: 21-point hand skeleton per hand.
//  - YOLO11n (Ultralytics, COCO, exported to ONNX at 320 px) via onnxruntime-web:
//    detects bottle-like objects (COCO "bottle"/"cup"; no pill-bottle class).
// Everything runs in the browser. No frame is stored or sent anywhere.
// This module is loaded lazily (dynamic import) only when the camera opens.

import { HandLandmarker } from "@mediapipe/tasks-vision";
import mpLoader from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import mpWasm from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import * as ort from "onnxruntime-web/wasm";
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { BOTTLE_CLASSES, decodeYolo, letterbox, rgbaToCHW, YOLO_SIZE } from "./visionLogic.js";

const HAND_MODEL_LOCAL = "/vision/models/hand_landmarker.task"; // fetched by `npm run models`
const HAND_MODEL_REMOTE =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const YOLO_MODEL = "/vision/models/yolo11n.onnx";

// Fetch a binary model; reject HTML fallbacks (dev servers answer 404s with index.html).
async function fetchModel(url) {
  const res = await fetch(url);
  const type = res.headers.get("content-type") || "";
  if (!res.ok || type.includes("text/html")) throw new Error(`${url} not available`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadHands() {
  let buffer;
  try {
    buffer = await fetchModel(HAND_MODEL_LOCAL);
  } catch {
    buffer = await fetchModel(HAND_MODEL_REMOTE); // needs internet
  }
  // Vite bundles MediaPipe's wasm; pass the URLs directly (no CDN needed).
  const fileset = { wasmLoaderPath: mpLoader, wasmBinaryPath: mpWasm };
  const make = (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buffer, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return await make("GPU");
  } catch {
    return await make("CPU");
  }
}

export async function loadYolo() {
  ort.env.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
  ort.env.wasm.numThreads = 1; // no cross-origin isolation needed
  return ort.InferenceSession.create(YOLO_MODEL, { executionProviders: ["wasm"] });
}

// Bottle detector only (no hand model): used by the caregiver's bottle scanner.
export async function loadBottleDetector() {
  const yolo = await loadYolo();
  let released = false;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = YOLO_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    async detect(video) {
      if (released) return [];
      const srcW = video.videoWidth, srcH = video.videoHeight;
      if (!srcW || !srcH) return [];
      const lb = letterbox(srcW, srcH);
      ctx.fillStyle = "rgb(114,114,114)";
      ctx.fillRect(0, 0, YOLO_SIZE, YOLO_SIZE);
      ctx.drawImage(video, lb.padX, lb.padY, lb.w, lb.h);
      const { data } = ctx.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE);
      const input = new ort.Tensor("float32", rgbaToCHW(data), [1, 3, YOLO_SIZE, YOLO_SIZE]);
      const out = await yolo.run({ [yolo.inputNames[0]]: input });
      const o = out[yolo.outputNames[0]];
      return decodeYolo(o.data, { numAnchors: o.dims[2], classes: BOTTLE_CLASSES, scoreThr: 0.3, lb, srcW, srcH });
    },
    close() {
      if (released) return; // may be called from several cleanup paths
      released = true;
      try { yolo.release?.()?.catch?.(() => {}); } catch { /* already gone */ }
    },
  };
}

export async function loadVision() {
  const [hands, yolo] = await Promise.allSettled([loadHands(), loadYolo()]);
  if (hands.status === "rejected") console.error("[vision] hand model failed", hands.reason);
  if (yolo.status === "rejected") console.error("[vision] YOLO model failed", yolo.reason);
  if (hands.status === "rejected" || yolo.status === "rejected") {
    hands.value?.close();
    const err = new Error("models");
    err.code = "models";
    throw err;
  }
  const engine = createEngine(hands.value, yolo.value);
  // The first hand inference compiles GPU shaders (~5 s on some laptops).
  // Do it now, while the "Preparando la cámara…" spinner is showing, instead
  // of freezing the live video on the first frame.
  engine.warmUp();
  console.info("[vision] models ready");
  return engine;
}

export function createEngine(hands, yolo) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = YOLO_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let busy = false;

  return {
    warmUp() {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      c.getContext("2d").fillRect(0, 0, 64, 64);
      try { hands.detectForVideo(c, performance.now()); } catch { /* warm-up only */ }
    },

    // Hand landmarks for the current video frame (synchronous, fast).
    detectHands(video, timestamp) {
      return hands.detectForVideo(video, timestamp).landmarks || [];
    },

    // Bottle-like boxes in video pixel coordinates. Returns null if a previous
    // inference is still running (caller keeps the last result).
    async detectBottles(video, classes = BOTTLE_CLASSES) {
      if (busy) return null;
      busy = true;
      try {
        const srcW = video.videoWidth || video.naturalWidth, srcH = video.videoHeight || video.naturalHeight;
        const lb = letterbox(srcW, srcH);
        ctx.fillStyle = "rgb(114,114,114)";
        ctx.fillRect(0, 0, YOLO_SIZE, YOLO_SIZE);
        ctx.drawImage(video, lb.padX, lb.padY, lb.w, lb.h);
        const { data } = ctx.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE);
        const input = new ort.Tensor("float32", rgbaToCHW(data), [1, 3, YOLO_SIZE, YOLO_SIZE]);
        const out = await yolo.run({ [yolo.inputNames[0]]: input });
        const o = out[yolo.outputNames[0]];
        return decodeYolo(o.data, { numAnchors: o.dims[2], classes, scoreThr: 0.3, lb, srcW, srcH });
      } finally {
        busy = false;
      }
    },

    close() {
      hands.close();
      yolo.release?.();
    },
  };
}
