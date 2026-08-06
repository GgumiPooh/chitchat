import { getLinkPreview } from "@/entities/link-preview";
import { getCurrentUser } from "@/shared/auth";
import { MAX_LINK_PREVIEW_URL_LENGTH } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: `node:dns` and streamed response bodies (§ 8.9.) — this handler cannot run on the edge runtime.
export const runtime = "nodejs";

const querySchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(MAX_LINK_PREVIEW_URL_LENGTH),
});

/**
 * REQUIREMENTS.md § 8.9. The card behind a link in a message. Signed-in only, and
 * not because the metadata is secret: the handler makes an outbound request to a
 * URL the caller chooses, which is not something to leave open to the internet.
 *
 * INFO: `null` is a normal answer, not an error — most links describe themselves
 * with nothing, and the bubble renders unchanged when they do.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return NextResponse.json({ preview: await getLinkPreview(query.data.url) });
}
