import { defineConfig } from "vite";
import path from "node:path";

// https://vitejs.dev/config
// `root` points Vite at the folder holding index.html (src/pages). Because we
// override `root` with an absolute path, Forge's plugin would otherwise resolve
// its renderer outDir relative to that root and emit into src/pages/.vite/...,
// which never makes it into the packaged asar. Pin outDir to the project-root
// path main.ts loads from (../renderer/main_window) so the packaged app finds it.
export default defineConfig({
  root: path.join(__dirname, "src/pages"),
  build: {
    outDir: path.join(__dirname, ".vite/renderer/main_window"),
    emptyOutDir: true,
  },
});
