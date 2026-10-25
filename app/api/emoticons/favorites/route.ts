import { addEmoticonFavorite, listUserEmoticonFavorites } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonItemId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const addFavoriteSchema = z.object({
  itemId: snowflakeSchema<EmoticonItemId>(),
});

export const GET = withEncryptedRoute(
  async () => {
    const user = await getCurrentUser();

    if (!user) {
      return apiError("unauthorized");
    }

    const favorites = await listUserEmoticonFavorites(user.id);

    return NextResponse.json(favorites);
  },
  { allowPlaintextFallback: true },
);

export const POST = withEncryptedRoute(
  async (request: Request) => {
    const user = await getCurrentUser();

    if (!user) {
      return apiError("unauthorized");
    }

    const body = addFavoriteSchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
      return apiError("invalid_request");
    }

    await addEmoticonFavorite(user.id, body.data.itemId);

    return new NextResponse(null, { status: 204 });
  },
  { allowPlaintextFallback: true },
);
