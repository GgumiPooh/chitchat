/**
 * RESTRUCTURE.md § 5.5. Gives every existing `emoticon_items` row the `media` rows and
 * slot FKs § 5.2. introduced.
 *
 * Three passes, and they are separate because their risk is:
 *
 *   1. **link** — a `media` row per stored object, and the slot FK that names it. No
 *      decoding, no upload, nothing new in the bucket. Undone by nulling three columns.
 *   2. **still** — for an item whose object animates, the extracted still: a new object,
 *      a new `media` row, and `still_image_id`. This is the pass that changes screens.
 *   3. neither pass ever touches `updated_at` — see below.
 *
 * A `png` gets `still_image_id` and leaves `animated_image_id` **NULL**: it does not
 * animate, so it has no animation, and pass 2 skips it entirely. That is 380 of
 * production's 757 finished by pass 1 alone.
 *
 * WARN: `updated_at` is `Emoticon.version` and rides on every asset URL (§ 13.4.).
 * Bumping it here would invalidate the cached redirect of every emoticon at once —
 * the mass re-download this whole body of work exists to avoid. Neither pass writes it.
 *
 * WARN: An item whose still cannot be produced is **left NULL**, never guessed at.
 * § 5.2.'s nullability is what makes "do nothing" available to a script that is unsure,
 * and it is why this can never attach the wrong picture to a row. APNG in particular is
 * unverified against a real file, so failures are reported rather than worked around.
 *
 * Usage — dry run is the default and nothing writes without `--apply`:
 *
 *   pnpm emoticon-slots --samples /tmp/stills   # dry run, and write every extracted frame there to look at
 *   pnpm emoticon-slots --apply      # run pass 1 and pass 2
 *   pnpm emoticon-slots --apply --link-only
 */
import { registerMedia } from "@/entities/media/@x/emoticon";
import { EMOTICON_MAX_EDGE } from "@/shared/config";
import { emoticonItems, getDb, media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { buildStorageKey, presignDownload, presignUpload } from "@/shared/storage";
import { eq, isNull, or } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/** § 5.5. At most eight pages are sampled — enough to pass a fade-in, cheap on a long loop. */
const MAX_SAMPLED_PAGES = 8;

const isApply = process.argv.includes("--apply");
const isLinkOnly = process.argv.includes("--link-only");
/**
 * Where a dry run writes the frames it picked, so they can be **looked at**.
 *
 * WARN: § 5.5.'s rule is measurable and its outcome is not. Alpha coverage says a frame
 * is not half-empty; it cannot say the frame reads as the emoticon. Nothing in a report
 * of numbers answers that, and this backfill fills a slot the picker is already drawing
 * from — so the frames go somewhere a person can open them before `--apply` is run.
 */
const sampleDirectory = readOption("--samples");

type Outcome = { itemId: string; note: string };

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      id: emoticonItems.id,
      packId: emoticonItems.packId,
      r2Key: emoticonItems.r2Key,
      mime: emoticonItems.mime,
      audioKey: emoticonItems.audioKey,
      width: emoticonItems.width,
      height: emoticonItems.height,
      stillImageId: emoticonItems.stillImageId,
      animatedImageId: emoticonItems.animatedImageId,
      audioId: emoticonItems.audioId,
    })
    .from(emoticonItems)
    .where(
      or(
        isNull(emoticonItems.stillImageId),
        isNull(emoticonItems.animatedImageId),
        // INFO: An item with a sound but no `audio_id` is unlinked too, whatever its images say.
        isNull(emoticonItems.audioId),
      ),
    );

  console.log(`${rows.length} item(s) with at least one empty slot.`);
  console.log(isApply ? "MODE: apply — this writes." : "MODE: dry run — nothing is written.\n");

  const linked: Outcome[] = [];
  const stilled: Outcome[] = [];
  const failed: Outcome[] = [];

  let seen = 0;

  for (const row of rows) {
    seen++;

    // INFO: A progress line per item. Without one this script is a silent six-minute wait that cannot be told from a hang — which it was, twice.
    if (seen % 25 === 0) {
      console.log(
        `  … ${seen}/${rows.length}  linked ${linked.length}  stills ${stilled.length}  failed ${failed.length}`,
      );
    }

    // INFO: The stored mime is the proxy `registerEmoticon` uses; pass 2 decodes and is what actually settles whether a thing animates.
    const isAnimatedMime = row.mime !== "image/png";
    const ownerId = toOwnerId(row.r2Key);

    if (!ownerId) {
      failed.push({ itemId: row.id, note: `key has no owner segment: ${row.r2Key}` });
      continue;
    }

    // ---- pass 1: link the object that is already stored -------------------
    if (!row.stillImageId && !row.animatedImageId) {
      if (!isApply) {
        linked.push({
          itemId: row.id,
          note: `${row.mime} → ${isAnimatedMime ? "animated_image_id" : "still_image_id"}`,
        });
      } else {
        const imageMedia = await registerMedia({
          ownerId,
          r2Key: row.r2Key,
          width: row.width,
          height: row.height,
          scope: "emoticon",
        });

        if (!imageMedia) {
          failed.push({ itemId: row.id, note: `registerMedia refused ${row.r2Key}` });
          continue;
        }

        await db
          .update(emoticonItems)
          .set(
            isAnimatedMime ? { animatedImageId: imageMedia.id } : { stillImageId: imageMedia.id },
          )
          .where(eq(emoticonItems.id, row.id));

        linked.push({ itemId: row.id, note: `${row.mime} → ${imageMedia.id}` });
      }
    }

    if (row.audioKey && !row.audioId) {
      if (!isApply) {
        linked.push({ itemId: row.id, note: "audio → audio_id" });
      } else {
        const audioMedia = await registerMedia({
          ownerId,
          r2Key: row.audioKey,
          width: null,
          height: null,
          scope: "emoticon",
        });

        if (!audioMedia) {
          failed.push({ itemId: row.id, note: `registerMedia refused ${row.audioKey}` });
        } else {
          await db
            .update(emoticonItems)
            .set({ audioId: audioMedia.id })
            .where(eq(emoticonItems.id, row.id));
          linked.push({ itemId: row.id, note: `audio → ${audioMedia.id}` });
        }
      }
    }

    // ---- pass 2: extract a still from what animates ------------------------
    if (isLinkOnly || !isAnimatedMime || row.stillImageId) {
      continue;
    }

    try {
      const source = Buffer.from(
        await (await fetch(await presignDownload(row.r2Key))).arrayBuffer(),
      );
      const still = await toFullestFrame(source);

      if (!still) {
        failed.push({ itemId: row.id, note: `${row.mime}: no frame could be decoded` });
        continue;
      }

      if (!isApply) {
        // INFO: The coverage leads the filename so `ls` sorts the least confident extractions to the top — those are the ones worth opening.
        if (sampleDirectory) {
          const name = `${String(still.coverage).padStart(3, "0")}-${row.id}-p${still.page}of${still.pages}.png`;

          await mkdir(sampleDirectory, { recursive: true });
          await writeFile(join(sampleDirectory, name), still.body);
        }

        stilled.push({
          itemId: row.id,
          note: `${row.mime} ${still.pages}p → frame ${still.page} (${still.coverage}% alpha), ${Math.round(still.body.byteLength / 1024)}KB`,
        });
        continue;
      }

      const key = buildStorageKey("emoticon", ownerId);

      // INFO: § 9. The server has no put of its own — every upload in this app is a presigned PUT, and a one-shot script is not a reason to grow that surface.
      const upload = await fetch(await presignUpload(key, "image/png"), {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: new Uint8Array(still.body),
      });

      if (!upload.ok) {
        failed.push({
          itemId: row.id,
          note: `PUT of the extracted still answered ${upload.status}`,
        });
        continue;
      }

      const stillMedia = await registerMedia({
        ownerId,
        r2Key: key,
        width: still.width,
        height: still.height,
        scope: "emoticon",
      });

      if (!stillMedia) {
        failed.push({ itemId: row.id, note: `registerMedia refused the extracted still` });
        continue;
      }

      // WARN: § 5.5. `still_image_id` alone. `updated_at` stays where it is, or every emoticon's cached asset redirect is invalidated at once.
      await db
        .update(emoticonItems)
        .set({ stillImageId: stillMedia.id })
        .where(eq(emoticonItems.id, row.id));

      stilled.push({ itemId: row.id, note: `frame ${still.page} → ${stillMedia.id}` });
    } catch (error) {
      failed.push({ itemId: row.id, note: `${row.mime}: ${(error as Error).message}` });
    }
  }

  report("linked", linked);
  report("stills", stilled);
  report("failed", failed);

  const remaining = await db
    .select({ id: emoticonItems.id })
    .from(emoticonItems)
    .where(isNull(emoticonItems.stillImageId));

  console.log(`\n${remaining.length} item(s) would still have no still image.`);
  console.log(
    `${(await db.select({ id: media.id }).from(media).where(eq(media.scope, "emoticon"))).length} media row(s) with scope=emoticon.`,
  );
}

/**
 * § 5.5. The sampled frame with the greatest alpha coverage, re-encoded as PNG.
 *
 * WARN: The **fullest** frame and not the first one. An animation that fades in opens on
 * a nearly empty frame — as little as 8% coverage against 36% once it has settled — which
 * reads as a half-transparent tile in the picker. Taking the fullest sampled frame removes
 * that case by construction.
 */
async function toFullestFrame(body: Buffer) {
  const probe = await sharp(body, { animated: true }).metadata();
  const pages = probe.pages ?? 1;
  const sampled = Math.min(pages, MAX_SAMPLED_PAGES);
  let best: { page: number; coverage: number } | null = null;

  for (let index = 0; index < sampled; index++) {
    // INFO: Sampled across the whole loop rather than the first N, so a long fade is not mistaken for the whole animation.
    const page = Math.floor((index * pages) / sampled);
    const frame = sharp(body, { page }).ensureAlpha();
    const { data, info } = await frame.raw().toBuffer({ resolveWithObject: true });
    let opaque = 0;

    for (let offset = info.channels - 1; offset < data.length; offset += info.channels) {
      if (data[offset] > 0) {
        opaque++;
      }
    }

    const coverage = Math.round((opaque / (info.width * info.height)) * 100);

    if (!best || coverage > best.coverage) {
      best = { page, coverage };
    }
  }

  if (!best) {
    return null;
  }

  const output = await sharp(body, { page: best.page })
    .resize({
      width: EMOTICON_MAX_EDGE,
      height: EMOTICON_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    body: output.data,
    width: output.info.width,
    height: output.info.height,
    page: best.page,
    coverage: best.coverage,
    pages,
  };
}

// INFO: § 9. Keys are `{scope}/{ownerId}/{object}`, and the owner is the only thing this script cannot read off the row — `emoticon_items` carries no uploader column.
function toOwnerId(key: string) {
  const owner = key.split("/")[1];

  return owner && /^[1-9]\d{0,18}$/.test(owner) ? (owner as never) : null;
}

function readOption(flag: string): Nullable<string> {
  const at = process.argv.indexOf(flag);

  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

function report(label: string, outcomes: Outcome[]) {
  console.log(`\n${label}: ${outcomes.length}`);
  outcomes.slice(0, 20).forEach(({ itemId, note }) => console.log(`  ${itemId}  ${note}`));

  if (outcomes.length > 20) {
    console.log(`  … and ${outcomes.length - 20} more`);
  }
}

void main();
