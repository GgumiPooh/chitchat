import type { Participant } from "@/entities/user";
import { request } from "@/shared/api";

export async function fetchParticipants(): Promise<Participant[]> {
  const response = await request("/api/users");

  if (!response.ok) {
    throw new Error(`GET /api/users responded ${response.status}`);
  }

  const { users } = (await response.json()) as { users: Participant[] };

  return users;
}
