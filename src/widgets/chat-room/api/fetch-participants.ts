import type { Participant } from "@/entities/user";

export async function fetchParticipants(): Promise<Participant[]> {
  const response = await fetch("/api/users");

  if (!response.ok) {
    throw new Error(`GET /api/users responded ${response.status}`);
  }

  const { users } = (await response.json()) as { users: Participant[] };

  return users;
}
