"use client";

import type { Emoticon, EmoticonPackWithItems } from "@/entities/emoticon";
import {
  EmoticonFormSheet,
  EmoticonItemGrid,
  addEmoticonsFromFiles,
  deleteEmoticon,
  fillEmoticonKeywords,
  updateEmoticonPack,
  type BulkAddFailure,
  type KeywordRateLimit,
} from "@/features/author-emoticon";
import { useMediaPicker } from "@/features/upload-media";
import { EMOTICON_SETTINGS_ROUTE } from "@/shared/config";
import { cn, type EmoticonItemId, type Maybe, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, OfflineStaleNotice, useOfflineGate } from "@/shared/offline-ux";
import { ActionSheet, AppHeader, Button, EmptyState, IconButton, Modal, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import {
  ChevronLeft,
  Images,
  LoaderCircle,
  Pencil,
  Plus,
  Smile,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** REQUIREMENTS.md § 13.8.1. What a 429 from Google is told to the user as. */
const RATE_LIMIT_MESSAGES: Record<KeywordRateLimit, string> = {
  minute: "요청이 몰렸어요. 1분 후에 다시 눌러 주세요",
  day: "오늘 쓸 수 있는 양을 다 썼어요. 내일 다시 시도해 주세요",
};

/** REQUIREMENTS.md § 13.8.1. The three things 자동으로 채우기 can be saying: what it does, that it is doing it, and how far along. */
function toFillLabel(tagging: Nullable<{ done: number; total: number }>, untagged: number): string {
  if (!tagging) {
    return `검색 키워드 자동으로 채우기 (${untagged}개)`;
  }

  return tagging.done === 0
    ? "검색 키워드를 만들고 있어요"
    : `${tagging.done}/${tagging.total}개 채웠어요`;
}

export type EmoticonPackPageProps = {
  className?: string;
  pack: EmoticonPackWithItems;
};

/**
 * REQUIREMENTS.md § 13.4. The pack's own screen: add items — one at a time or a
 * whole pile at once — edit one, choose which is the tab icon, delete.
 *
 * INFO: § 13.1. Every control here is available to both participants — a pack
 * belongs to the conversation, so there is no `created_by` branch anywhere.
 */
export function EmoticonPackPage({ className, pack }: EmoticonPackPageProps) {
  const [items, setItems] = useState(pack.items);
  const [thumbnailItemId, setThumbnailItemId] = useState(pack.thumbnailItemId);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<Nullable<File>>(null);
  const [editing, setEditing] = useState<Nullable<Emoticon>>(null);
  const [addingCount, setAddingCount] = useState(0);
  const [failures, setFailures] = useState<BulkAddFailure[]>([]);
  const [selectedId, setSelectedId] = useState<Nullable<EmoticonItemId>>(null);
  // WARN: § 13.8.1. A fraction, deliberately **not** § 13.4.'s countdown. That convention counts what is left because its grid gains rows as files land, so a fixed total would contradict them — here the items already exist and only their keywords are filling in, so the total is settled before the first batch and saying it is the more useful half.
  const [tagging, setTagging] = useState<Nullable<{ done: number; total: number }>>(null);
  const router = useRouter();
  // INFO: § 13.4. 여러 장 한 번에 추가 already names what it takes, so the row opens the album picker itself rather than a second sheet with one row in it.
  const picker = useMediaPicker({ accept: "image/*", isMultiple: true, onSelect: handlePick });
  // INFO: § 13.4. The header opens 하나씩 추가 and 여러 장 한 번에 추가 together, so one gate covers both.
  const addGate = useOfflineGate(OFFLINE_MESSAGES.add);
  const fillGate = useOfflineGate(OFFLINE_MESSAGES.fill);
  const editGate = useOfflineGate(OFFLINE_MESSAGES.edit);
  const thumbnailGate = useOfflineGate(OFFLINE_MESSAGES.wear);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);
  const selected = items.find((item) => item.id === selectedId);
  // INFO: § 13.8. Only the items nobody has described. Suggestions never overwrite a keyword somebody typed — the model is filling gaps, not revising work.
  const untagged = items.filter((item) => item.keywords.length === 0);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title={pack.name}
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            haptic
            aria-label="뒤로"
            onClick={() => router.push(EMOTICON_SETTINGS_ROUTE)}
          />
        }
        trailing={
          // WARN: § 13.4. Closed for as long as a pile is landing, and it is the only way into `addMany` — a second batch would run its own registration chain, interleaving two picks in one `sort_order` sequence, and `setAddingCount(files.length)` is an absolute write that the overlap would corrupt.
          <IconButton
            variant="floating"
            Icon={Plus}
            haptic
            disabled={addingCount > 0 || tagging !== null}
            aria-label="이모티콘 추가"
            {...addGate.blockedProps}
            onClick={addGate.guard(() => setIsAddMenuOpen(true))}
          />
        }
      />
      <div className="pt-(--app-header-inset)">
        <OfflineStaleNotice />
      </div>
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex-1 p-md">
        {items.length === 0 && addingCount === 0 ? (
          <EmptyState Icon={Smile} description="아직 이모티콘이 없어요" />
        ) : (
          <div className="space-y-sm">
            <EmoticonItemGrid
              items={items}
              thumbnailItemId={thumbnailItemId}
              onSelect={openItemActions}
            />
            {addingCount > 0 && (
              <p className="text-center text-body-sm text-meta">
                {addingCount}개를 더 올리는 중이에요
              </p>
            )}
            {/* INFO: REQUIREMENTS.md § 13.8.1. Withheld once every item has words, since the only thing it would offer then is overwriting them. */}
            {(tagging !== null || untagged.length > 0) && addingCount === 0 && (
              <div className="space-y-2xs">
                {/* WARN: § 13.8.1. No count until the first batch lands. `0/12개 채웠어요` is a completive sentence about nothing having happened, which reads as a failed press rather than as one still running — and at four images per request that frame is on screen for a couple of seconds every time. */}
                <Button
                  variant="secondary"
                  disabled={tagging !== null}
                  haptic
                  {...fillGate.blockedProps}
                  onClick={fillGate.guard(() => void fillKeywords())}
                >
                  {tagging ? (
                    // INFO: The icon carries the wait on its own, so the label never has to say 기다려 주세요 — the same swap § 8.'s message search bar makes.
                    <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Sparkles className="size-4" strokeWidth={1.75} />
                  )}
                  {toFillLabel(tagging, untagged.length)}
                </Button>
                {/* INFO: § 13.8.1. The reason to press an optional button, which the label alone does not give — an item with no keywords is one § 13.8.'s composer search can never reach. */}
                {!tagging && (
                  <p className="text-center text-caption text-meta">
                    키워드를 넣어두면 대화 중에 단어로 찾을 수 있어요
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* INFO: § 13.4. Two ways in: the authoring sheet, where one item gets a crop and a sound, or a pile of images that skips both. */}
      <ActionSheet
        isOpen={isAddMenuOpen}
        header={{ title: "이모티콘 추가" }}
        items={[
          { label: "하나씩 추가", Icon: Plus, onSelect: () => setIsFormOpen(true) },
          { label: "여러 장 한 번에 추가", Icon: Images, onSelect: picker.open },
        ]}
        onClose={() => setIsAddMenuOpen(false)}
      />
      {picker.input}
      <EmoticonFormSheet
        packId={pack.id}
        isOpen={isFormOpen}
        emoticon={editing}
        initialFile={pendingFile}
        onClose={closeForm}
        onSaved={handleSaved}
      />
      <ActionSheet
        isOpen={selected !== undefined}
        header={{ title: "이모티콘" }}
        items={[
          {
            label: "수정",
            Icon: Pencil,
            onSelect: editGate.guard(() => openEditor(selected)),
          },
          {
            label: "대표 이미지로 지정",
            Icon: Smile,
            onSelect: thumbnailGate.guard(() => void setThumbnail(selectedId)),
          },
          {
            label: "삭제",
            Icon: Trash2,
            variant: "destructive",
            onSelect: deleteGate.guard(() => void removeItem(selectedId)),
          },
        ]}
        onClose={() => setSelectedId(null)}
      />
      <Modal
        isOpen={failures.length > 0}
        header={{
          title: "추가하지 못한 이모티콘",
          description: `${failures.length}개를 추가하지 못했어요`,
        }}
        onClose={() => setFailures([])}
      >
        {/* INFO: Scrolls at a fixed height — a pick of forty images can fail forty times, and the modal must not grow past the shell. */}
        <ul className="max-h-[40vh] space-y-2xs overflow-y-auto">
          {failures.map((failure, index) => (
            <li
              key={`${failure.fileName}-${index}`}
              className="rounded-sm bg-surface-soft px-sm py-xs"
            >
              <p className="truncate text-body-sm text-ink">{failure.fileName}</p>
              <p className="text-body-sm text-meta">{failure.reason}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );

  // INFO: A single file from the bulk picker still opens the authoring sheet — one image is one item either way, and there it can be cropped and given a sound.
  function handlePick(files: File[]) {
    const [first, ...rest] = files;

    if (!first) {
      return;
    }

    if (rest.length === 0) {
      setPendingFile(first);
      setIsFormOpen(true);

      return;
    }

    void addMany(files);
  }

  // INFO: § 13.4. The grid fills in as each item lands rather than after the last one, so a pile of twenty is visibly progressing.
  async function addMany(files: File[]) {
    setAddingCount(files.length);

    try {
      // WARN: The count is what is *left*, not what was picked — it is rendered beside a grid that is already filling in, so a fixed total would contradict the rows next to it.
      const { failed } = await addEmoticonsFromFiles(pack.id, files, {
        onAdded: (emoticon) => setItems((current) => [...current, emoticon]),
        onSettled: () => setAddingCount((current) => Math.max(current - 1, 0)),
      });

      // INFO: § 13.4. A modal rather than a toast — a bulk add fails per file and for different reasons, and a count alone leaves the user re-picking twenty images to find the three that did not land.
      setFailures(failed);
    } catch {
      toast.error("이모티콘을 추가하지 못했어요");
    } finally {
      // WARN: In `finally`, or a rejection would strand the count above zero — which disables the `+` for the life of the screen and pins § 15.1.'s reload open with it.
      setAddingCount(0);
    }
  }

  function openEditor(item: Maybe<Emoticon>) {
    setSelectedId(null);
    setEditing(item ?? null);
    setIsFormOpen(item != null);
  }

  function closeForm() {
    setIsFormOpen(false);
    setPendingFile(null);
    setEditing(null);
  }

  /**
   * REQUIREMENTS.md § 13.8. Asks the model for words for every item that has none,
   * then saves each through § 13.4.'s own write.
   *
   * WARN: Saved item by item rather than in one call, because there is no bulk
   * write and inventing one would be a second path into `emoticon_items` that
   * § 13.4.'s asset rules do not cover. A save that fails leaves that item untagged
   * and the rest tagged, which is the same state a second press repairs.
   */
  async function fillKeywords() {
    // WARN: Set before the first batch and cleared after the last, so the `+` and this button are both closed for the whole run — the same reason § 13.4.'s bulk add closes them, since a second run would re-tag the items the first is still saving.
    setTagging({ done: 0, total: untagged.length });

    try {
      const { filled, failed, rateLimit } = await fillEmoticonKeywords(
        untagged,
        ({ saved, remaining }) => {
          // INFO: § 13.8.1. Applied per batch rather than at the end, so the grid fills in while the run continues — which is what the count beside it is counting down against.
          saved.forEach(handleSaved);
          setTagging({ done: untagged.length - remaining, total: untagged.length });
        },
      );

      // WARN: § 13.8.1. Named before the counts, because it is the only outcome that says *when* to press again — and § 6.7.'s rule applies to somebody else's quota too: a minute is worth waiting out and a day is not, so the two may not share a sentence.
      if (rateLimit) {
        toast.error(RATE_LIMIT_MESSAGES[rateLimit]);

        return;
      }

      if (filled === 0) {
        toast.error("검색 키워드를 만들지 못했어요");

        return;
      }

      // INFO: A partly-finished run says so. The button stays, offering exactly the items that still have none, so the number is an invitation rather than an apology.
      toast.success(
        failed === 0
          ? `${josa(`${filled}개`, "이/가")} 채워졌어요`
          : `${filled}개를 채웠어요. ${josa(`${failed}개`, "은/는")} 다시 시도해 주세요`,
      );
    } catch {
      toast.error("검색 키워드를 만들지 못했어요");
    } finally {
      setTagging(null);
    }
  }

  /** WARN: § 13.8. Ignored while a keyword run is writing. The edit sheet saves the whole list, so a user typing chips into an item the run reaches a moment later loses them to last-write-wins. */
  function openItemActions(itemId: EmoticonItemId) {
    if (tagging === null) {
      setSelectedId(itemId);
    }
  }

  function handleSaved(emoticon: Emoticon) {
    setItems((current) =>
      current.some((item) => item.id === emoticon.id)
        ? current.map((item) => (item.id === emoticon.id ? emoticon : item))
        : [...current, emoticon],
    );
  }

  async function setThumbnail(itemId: Nullable<EmoticonItemId>) {
    if (!itemId) {
      return;
    }

    const previous = thumbnailItemId;

    setThumbnailItemId(itemId);
    setSelectedId(null);

    try {
      await updateEmoticonPack(pack.id, { thumbnailItemId: itemId });
    } catch {
      setThumbnailItemId(previous);
      toast.error("대표 이미지를 바꾸지 못했어요");
    }
  }

  async function removeItem(itemId: Nullable<EmoticonItemId>) {
    if (!itemId) {
      return;
    }

    setSelectedId(null);

    try {
      await deleteEmoticon(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));

      // INFO: REQUIREMENTS.md § 13.2. The FK is `ON DELETE SET NULL`, so the server has already cleared this — mirroring it keeps the highlight from pointing at a row that is gone.
      if (itemId === thumbnailItemId) {
        setThumbnailItemId(null);
      }
    } catch (error) {
      toast.error(toDeleteMessage(error));
    }
  }
}

// INFO: § 13.6. An item already sent answers 409 — the user needs to be told why rather than shown a generic failure.
function toDeleteMessage(error: unknown): string {
  return error instanceof Error && error.message === "409"
    ? "이미 대화에서 보낸 이모티콘은 삭제할 수 없어요"
    : "삭제하지 못했어요";
}
