import type { Dirent } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");
const OUTPUT_PATH = path.join(process.cwd(), "public", "offline-precache.json");
const OUTPUT_RELATIVE_PATH = path.relative(process.cwd(), OUTPUT_PATH);

// INFO: The two subtrees a document boots from — the build id's own directory holds only the Pages Router manifests, which no App Router document references.
const ASSET_DIRS = ["chunks", "media"];

const ASSET_PREFIX = "/_next/static";

/**
 * Every file under `.next/static/{chunks,media}` as a URL the service worker can
 * precache (REQUIREMENTS.md § 16.).
 *
 * WARN: The whole of both directories, never the subset a prerendered document names. A chunk reached through `import()` after mount appears in no HTML, so an HTML-scraped list boots the mirror and then fails at the first lazy boundary — offline, where nothing reports it.
 */
async function collectAssetUrls(): Promise<string[]> {
  const urls: string[] = [];

  for (const dir of ASSET_DIRS) {
    for (const entry of await readAssetDir(dir)) {
      if (!entry.isFile()) {
        continue;
      }

      // INFO: `parentPath` rather than `dir` itself, so a nested chunk directory keeps its segments.
      const absolute = path.join(entry.parentPath, entry.name);

      urls.push(`${ASSET_PREFIX}/${path.relative(STATIC_DIR, absolute).split(path.sep).join("/")}`);
    }
  }

  return urls.sort();
}

/**
 * WARN: An absent directory contributes nothing rather than throwing, because `build` chains this step — `media` exists only while something still imports an asset, so an ENOENT here would make a fact about the current source into a hard build dependency. Every other error is rethrown: a permission failure or a half-written build must not ship a short list quietly.
 */
async function readAssetDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(path.join(STATIC_DIR, dir), { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    return [];
  }
}

async function main() {
  const urls = await collectAssetUrls();

  // WARN: JSON fetched by the worker rather than a script it `importScripts`es. `next.config.ts` gives only `/sw.js` a `no-cache` header, so a second script file would go stale exactly the way REQUIREMENTS.md § 16.1. describes — the worker's own `cache: "reload"` is what answers that instead, and it needs a body it can parse rather than execute.
  await writeFile(OUTPUT_PATH, `${JSON.stringify(urls, null, 2)}\n`, "utf8");
  console.log(`Wrote ${urls.length} precache entries to ${OUTPUT_RELATIVE_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
