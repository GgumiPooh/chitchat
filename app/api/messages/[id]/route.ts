import { areInlineEmoticonsKnown, deleteMessage, editMessage } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  isMessageContentPaired,
  MAX_EMOTICON_ID_LOOKUP,
  MAX_MESSAGE_LENGTH,
  snowflakeSchema,
} from "@/shared/config";
import type { EmoticonItemId, MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = snowflakeSchema<MessageId>();

// INFO: REQUIREMENTS.md § 8.13. The same shape a send is validated against — an edit may not produce a message the composer could not have sent in the first place.
// WARN: REQUIREMENTS.md § 13. The emoticons are part of that shape, and absent means **none** rather than "leave them". A correction rewrites the text the placeholders sit in, so ids carried over from before it would stand at the wrong ones.
const bodySchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    inlineEmoticonItemIds: z
      .array(snowflakeSchema<EmoticonItemId>())
      .max(MAX_EMOTICON_ID_LOOKUP)
      .optional(),
  })
  .refine((body) =>
    isMessageContentPaired({
      text: body.text,
      inlineEmoticonItemIds: body.inlineEmoticonItemIds ?? [],
    }),
  );

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 14. A message that is not this user's is reported the same as one that does not exist.
  if (!(await deleteMessage(id.data, user.id))) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!id.success || !body.success) {
    return apiError("invalid_request");
  }

  const inlineEmoticonItemIds = body.data.inlineEmoticonItemIds ?? [];

  // INFO: REQUIREMENTS.md § 13. The send path's own check, for the send path's reason — the column carries no foreign key, so nothing else refuses an id that names no item.
  if (!(await areInlineEmoticonsKnown(inlineEmoticonItemIds))) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 14. Not mine, not text, and already deleted are all reported as the 404 a missing id gets — the endpoint may not be used to probe what a given row is.
  if (!(await editMessage(id.data, user.id, body.data.text, inlineEmoticonItemIds))) {
    return apiError("not_found");
  }

  // INFO: REQUIREMENTS.md § 8.13. No body, like the DELETE above — the editor patches its own window and every other client is told by the § 8.13. stream event.
  return new NextResponse(null, { status: 204 });
}
