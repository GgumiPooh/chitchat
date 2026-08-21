import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

// WARN: The ESM build, not `dist/` root (UMD) — `@ffmpeg/ffmpeg`'s worker only
// auto-rewrites umd→esm for its own untouched CDN default, so a self-hosted UMD
// core fails both `importScripts` and `import()`.
const SOURCE_DIR = path.join(process.cwd(), "node_modules", "@ffmpeg", "core", "dist", "esm");
const OUTPUT_DIR = path.join(process.cwd(), "public", "ffmpeg");
const FILES = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(
    FILES.map((file) => copyFile(path.join(SOURCE_DIR, file), path.join(OUTPUT_DIR, file))),
  );
  console.log(
    `Copied ${FILES.length} ffmpeg core files to ${path.relative(process.cwd(), OUTPUT_DIR)}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
