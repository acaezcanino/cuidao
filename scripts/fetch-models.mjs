// Downloads the MediaPipe hand model into public/vision/models/ so the camera
// check also works offline (e.g. at the hackathon venue). Run: npm run models
// Runs automatically after `npm install`; a failed download is not fatal
// (the app then loads the model from Google at runtime).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "vision", "models");
const models = [
  {
    file: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
];
const optional = process.argv.includes("--optional");

mkdirSync(dir, { recursive: true });
for (const { file, url } of models) {
  const dest = join(dir, file);
  if (existsSync(dest)) {
    console.log(`✓ ${file} already present`);
    continue;
  }
  try {
    console.log(`↓ downloading ${file}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`✓ saved ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    const msg = `✗ could not download ${file}: ${err.message}`;
    if (optional) console.warn(msg + " (the app will load it from Google at runtime)");
    else { console.error(msg); process.exit(1); }
  }
}
