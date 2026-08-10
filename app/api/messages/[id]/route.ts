import { deleteMessage, editMessage } from "@/entities/message";
import { notifyMessageRetraction } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_MESSAGE_LENGTH } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

// INFO: REQUIREMENTS.md § 8.13. The same shape a send is validated against — an edit may not produce a message the composer could not have sent in the first place.
const bodySchema = z.object({ text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) });

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

  // WARN: REQUIREMENTS.md § 16.1. `after`, like the send path — the fan-out's round trips to the push services must never sit between the deleter and their 204.
  after(() => safelyRunAsync(() => notifyMessageRetraction(user, id.data)));

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

  // INFO: REQUIREMENTS.md § 14. Not mine, not text, and already deleted are all reported as the 404 a missing id gets — the endpoint may not be used to probe what a given row is.
  if (!(await editMessage(id.data, user.id, body.data.text))) {
    return apiError("not_found");
  }

  // INFO: REQUIREMENTS.md § 8.13. No body, like the DELETE above — the editor patches its own window and every other client is told by the § 8.13. stream event.
  return new NextResponse(null, { status: 204 });
}
