import type { TimeLetterDraft } from "@/entities/time-letter";
import type { Nullable } from "@/shared/lib";

export const TIME_LETTER_DRAFT_KEY = "jandh:draft:time-letter";

export function loadStoredDraft(): Nullable<TimeLetterDraft> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TIME_LETTER_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<TimeLetterDraft>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    // INFO: Only restore if there's actual content or title
    const hasContent = Boolean(parsed.content?.trim() || parsed.title?.trim());
    if (!hasContent) {
      return null;
    }

    return {
      title: parsed.title ?? "",
      content: parsed.content ?? "",
      theme: parsed.theme ?? "classic",
      scheduledDayKey: parsed.scheduledDayKey ?? "",
      scheduledTime: parsed.scheduledTime ?? "08:00",
      recipientMode: parsed.recipientMode ?? "partner",
      showTeaser: Boolean(parsed.showTeaser),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveStoredDraft(draft: Omit<TimeLetterDraft, "savedAt">): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: TimeLetterDraft = {
      ...draft,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(TIME_LETTER_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // INFO: Gracefully handle QuotaExceededError or private browsing restrictions
  }
}

export function clearStoredDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(TIME_LETTER_DRAFT_KEY);
  } catch {
    // INFO: Graceful fallback
  }
}
