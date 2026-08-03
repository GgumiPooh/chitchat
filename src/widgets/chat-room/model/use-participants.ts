"use client";

import type { Participant } from "@/entities/user";
import { safelyGetAsync } from "@/shared/lib";
import { useCallback, useState } from "react";
import { fetchParticipants } from "../api/fetch-participants";

/**
 * The participant set behind every sender name and avatar in the room. A `user`
 * event refetches it whole (REQUIREMENTS.md § 8.4.) — a rename produces no new
 * row, so there is no cursor that would ever fire on one.
 */
export function useParticipants(initialParticipants: Participant[]) {
  const [participants, setParticipants] = useState(initialParticipants);

  const refreshParticipants = useCallback(async () => {
    // INFO: A failed refresh keeps the names already on screen; the next event or resume retries, and the payload is idempotent.
    const next = await safelyGetAsync(fetchParticipants);

    if (next) {
      setParticipants(next);
    }
  }, []);

  return { participants, refreshParticipants };
}
