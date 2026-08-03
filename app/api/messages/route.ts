import { createTextMessage, listMessages } from "@/entities/message";
import { getCurrentUser } from "@/shared/auth";
import { MAX_MESSAGE_LENGTH, MAX_MESSAGE_PAGE_SIZE, MESSAGE_PAGE_SIZE } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

const cursorSchema = z.coerce.number().int().positive().optional();

const querySchema = z.object({
  before: cursorSchema,
  after: cursorSchema,
  around: cursorSchema,
  limit: z.coerce.number().int().positive().optional(),
});

const bodySchema = z.object({
  clientMsgId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
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

  const { before, after, around, limit } = query.data;

  return NextResponse.json({
    messages: await listMessages({
      before,
      after,
      around,
      limit: Math.min(limit ?? MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE),
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const message = await createTextMessage({ senderId: user.id, ...body.data });

  // INFO: The client id is already taken by a row this sender cannot claim, so echoing anything back would replace their optimistic bubble with a stranger's message.
  if (!message) {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }

  return NextResponse.json({ message }, { status: 201 });
}
