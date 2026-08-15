import { josa } from "es-hangul";

/**
 * What a control says when the network is what stands between the tap and the
 * thing it does.
 *
 * INFO: One frame across every case, and it names the recovery condition rather than the state — the 오프라인 모드 pill is already saying the state, and a control tapped inside the pill's own settle delay still has to explain itself alone.
 */
export const OFFLINE_MESSAGES = {
  save: "인터넷에 연결되면 저장할 수 있어요",
  remove: "인터넷에 연결되면 삭제할 수 있어요",
  upload: "인터넷에 연결되면 올릴 수 있어요",
  share: "인터넷에 연결되면 공유할 수 있어요",
  play: "인터넷에 연결되면 들을 수 있어요",
  change: "인터넷에 연결되면 바꿀 수 있어요",
  select: "인터넷에 연결되면 선택할 수 있어요",
  wear: "인터넷에 연결되면 설정할 수 있어요",
  view: "인터넷에 연결되면 볼 수 있어요",
  logOut: "인터넷에 연결되면 로그아웃할 수 있어요",
  create: "인터넷에 연결되면 만들 수 있어요",
  add: "인터넷에 연결되면 추가할 수 있어요",
  hide: "인터넷에 연결되면 숨길 수 있어요",
  edit: "인터넷에 연결되면 수정할 수 있어요",
  fill: "인터넷에 연결되면 채울 수 있어요",
  preview: "인터넷에 연결되면 미리 볼 수 있어요",
  sweep: "인터넷에 연결되면 정리할 수 있어요",
  reload: "인터넷에 연결되면 다시 불러올 수 있어요",
} as const;

/** What the always-mounted description node reads, and the one string reused from `/offline`. */
export const OFFLINE_NOTICE_TEXT = "인터넷에 연결되어 있지 않아요";

// INFO: Outside the frame above on purpose — a queued message is a state rather than a refusal, and there is nothing for the reader to come back and do.
export const OFFLINE_QUEUED_SEND_TEXT = "인터넷에 연결되면 보내요";

/**
 * What a row leading to a screen this deployment cannot reach offline says when it
 * is tapped.
 *
 * WARN: AGENTS.md § 0.4. The particle follows the row's own label, and the three that reach this sentence do not agree — 이모티콘 takes 은 where 서버 관리 and 로그인된 기기 take 는.
 */
export function toOfflineOpenMessage(label: string): string {
  return `${josa(label, "은/는")} 인터넷에 연결되면 열 수 있어요`;
}
