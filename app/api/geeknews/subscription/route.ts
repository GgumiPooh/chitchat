import "server-only";

import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  GEEKNEWS_SUBSCRIPTION_COOKIE_NAME,
  GEEKNEWS_SUBSCRIPTION_COOKIE_OPTIONS,
} from "@/shared/config";
import { geeknewsSubscriptions, getDb } from "@/shared/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const db = getDb();
  const [row] = await db
    .select({ enabled: geeknewsSubscriptions.enabled })
    .from(geeknewsSubscriptions)
    .where(eq(geeknewsSubscriptions.userId, user.id));

  const enabled = row?.enabled ?? false;
  (await cookies()).set(
    GEEKNEWS_SUBSCRIPTION_COOKIE_NAME,
    String(enabled),
    GEEKNEWS_SUBSCRIPTION_COOKIE_OPTIONS,
  );

  return NextResponse.json({ enabled });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { enabled } = parsed.data;
  const db = getDb();

  await db
    .insert(geeknewsSubscriptions)
    .values({
      userId: user.id,
      enabled,
    })
    .onConflictDoUpdate({
      target: geeknewsSubscriptions.userId,
      set: { enabled },
    });

  (await cookies()).set(
    GEEKNEWS_SUBSCRIPTION_COOKIE_NAME,
    String(enabled),
    GEEKNEWS_SUBSCRIPTION_COOKIE_OPTIONS,
  );

  return NextResponse.json({ enabled });
}
