import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

// WARN: The ESM build, not `dist/` root (UMD) — `@ffmpeg/ffmpeg`'s worker only
// auto-rewrites umd→esm for its own untouched CDN default, so a self-hosted UMD
// core fails both `importScripts` and `import()`.
const CORE_DIR = path.join(process.cwd(), "node_modules", "@ffmpeg", "core", "dist", "esm");

/**
 * WARN: The worker is copied out of the package **unbundled**, and that is what makes
 * ffmpeg work at all here. Its job is one dynamic `import(coreURL)`, which Turbopack
 * cannot resolve statically and rewrites into a stub that throws `Cannot find module
 * as expression is too dynamic` — so the bundled copy Next builds can never load a
 * core. `loadFfmpeg` points `classWorkerURL` at this copy instead.
 *
 * WARN: `worker.js` imports `const.js` and `errors.js` beside it, so the three move
 * together and the paths they resolve to must stay siblings under `public/ffmpeg/`.
 */
const WORKER_DIR = path.join(process.cwd(), "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");

const OUTPUT_DIR = path.join(process.cwd(), "public", "ffmpeg");

const FILES = [
  [CORE_DIR, "ffmpeg-core.js"],
  [CORE_DIR, "ffmpeg-core.wasm"],
  [WORKER_DIR, "worker.js"],
  [WORKER_DIR, "const.js"],
  [WORKER_DIR, "errors.js"],
] as const;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(
    FILES.map(([dir, file]) => copyFile(path.join(dir, file), path.join(OUTPUT_DIR, file))),
  );
  console.log(`Copied ${FILES.length} ffmpeg files to ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
