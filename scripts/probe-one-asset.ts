// INFO: Throwaway. Fetches one stored emoticon object through a presigned GET and reports what actually comes back.
import { emoticonItems, getDb } from "@/shared/db";
import { presignDownload } from "@/shared/storage";
import { ne } from "drizzle-orm";

async function main() {
  const [row] = await getDb()
    .select({ key: emoticonItems.r2Key, mime: emoticonItems.mime })
    .from(emoticonItems)
    .where(ne(emoticonItems.mime, "image/png"))
    .limit(1);

  console.log("bucket:", process.env.R2_BUCKET);
  console.log("key:", row.key, row.mime);

  const response = await fetch(await presignDownload(row.key));

  console.log("status:", response.status, response.headers.get("content-type"));

  const body = Buffer.from(await response.arrayBuffer());

  console.log("bytes:", body.byteLength);
  console.log("magic:", body.subarray(0, 16).toString("hex"));
  console.log("as text:", body.subarray(0, 180).toString("utf8").replace(/\s+/g, " "));
}

void main();
