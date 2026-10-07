import type { ChatMessage } from "@/entities/message";
import { josa } from "es-hangul";

/**
 * Composes the announcement string shown inside the time letter arrival notice card,
 * matching the visual output of TimeLetterArrivalNoticeCard.
 */
export function formatTimeLetterAnnouncement(
  message: ChatMessage,
  senderName: string,
  isMine = false,
  now = new Date(),
): string {
  let writtenDateStr = "";
  let onlyMe = false;
  if (message.text) {
    try {
      const parsed = JSON.parse(message.text) as {
        writtenAt?: string;
        onlyMe?: boolean;
      };
      writtenDateStr = parsed.writtenAt ?? "";
      onlyMe = parsed.onlyMe ?? false;
    } catch {
      // fallback
    }
  }

  const isBlind = !isMine && onlyMe;
  const writtenDate = writtenDateStr ? new Date(writtenDateStr) : message.createdAt;
  const diffMs = Math.max(0, now.getTime() - writtenDate.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let elapsedText = "";
  if (diffMinutes < 1) {
    elapsedText = "방금 전 ";
  } else if (diffMinutes < 60) {
    elapsedText = `${diffMinutes}분 전 `;
  } else if (diffHours < 24) {
    elapsedText = `${diffHours}시간 전 `;
  } else if (diffDays < 30) {
    elapsedText = `${diffDays}일 전 `;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    elapsedText = `${months}개월 전 `;
  } else {
    const years = Math.floor(diffDays / 365);
    elapsedText = `${years}년 전 `;
  }

  if (isMine) {
    return `내가 ${elapsedText}과거에서 보낸 편지예요`;
  }
  if (isBlind) {
    return `${senderName}${josa(senderName, "이/가")} 과거의 자신에게 보낸 편지가 도착했어요 📮`;
  }
  return `${senderName}님이 ${elapsedText}과거에서 보낸 편지예요`;
}
