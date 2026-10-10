import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the camera libraries when the dev server starts. Otherwise Vite
  // may discover them the first time the camera opens and reload the whole
  // page (closing the camera and returning to "Activar mi alarma").
  optimizeDeps: {
    include: ["@mediapipe/tasks-vision", "onnxruntime-web/wasm"],
  },
});
