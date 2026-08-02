import type { User } from "@/shared/db";

/** REQUIREMENTS.md § 8.7. Resolved at render time, never copied onto a message row. */
export function resolveDisplayName(user: Pick<User, "email" | "nickname">): string {
  return user.nickname.trim() || user.email.split("@")[0];
}
