"use client";

import type { Emoticon, EmoticonPackWithItems } from "@/entities/emoticon";
import { EMOTICON_PACKS_PATH, toEmoticonAssetUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { EmptyState, PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock, Smile } from "lucide-react";
import { useStorageState } from "synced-storage/react";
import { useRecentEmoticons } from "../model/use-recent-emoticons";

// INFO: DESIGN.md § 9. Assets are user-authored, so their aspect ratios are arbitrary — the cell is a fixed square and the still is `object-contain` inside it.
const RECENTS_TAB = "recents";

const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

export type EmoticonPickerProps = {
  className?: string;
  onSelect: (emoticon: Emoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.6. The panel behind the composer's emoticon toggle: bottom
 * tabs are the enabled packs in this user's order (§ 13.1.), and selecting an
 * emoticon sends it immediately.
 *
 * INFO: DESIGN.md § 9. leaves the panel's exact geometry open. It is capped at a
 * fixed height and otherwise takes half of `--viewport-height` (§ 3.4.) — never
 * `vh`, which resolves against the layout viewport and would overrun the shell.
 */
export function EmoticonPicker({ className, onSelect }: EmoticonPickerProps) {
  // WARN: Read straight from storage rather than seeded into `useState` — the panel can mount during hydration, where the first snapshot is still the fallback and a seeded state would never pick the stored tab up.
  const [storedTab, setRequestedTab] = useStorageState<string>(ACTIVE_TAB_KEY, RECENTS_TAB, {
    strategy: "localStorage",
  });
  const requestedTab = typeof storedTab === "string" ? storedTab : RECENTS_TAB;
  const { recentIds, remember } = useRecentEmoticons();
  const { data: packs = [], isPending } = useQuery({
    queryKey: ["emoticon-packs", "enabled"],
    queryFn: fetchEnabledPacks,
  });

  // INFO: The remembered pack can be gone or hidden (§ 13.1.) by the time the panel reopens, so it only holds while the loaded list still has it.
  const activeTab =
    requestedTab === RECENTS_TAB || isPending || findPack(packs, requestedTab)
      ? requestedTab
      : RECENTS_TAB;

  const byId = new Map(packs.flatMap((pack) => pack.items.map((item) => [item.id, item] as const)));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((item): item is Emoticon => item !== undefined);
  const shown = activeTab === RECENTS_TAB ? recents : (findPack(packs, activeTab)?.items ?? []);

  return (
    <div
      className={cn(
        "pointer-events-auto flex h-[min(22rem,calc(var(--viewport-height,100dvh)*0.5))] flex-col rounded-lg border border-hairline bg-canvas",
        className,
      )}
    >
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain p-xs">
        {isPending ? null : shown.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            Icon={Smile}
            description={
              activeTab === RECENTS_TAB
                ? "최근 사용한 이모티콘이 여기에 보여요"
                : "이 그룹에는 이모티콘이 없어요"
            }
          />
        ) : (
          <div className="grid grid-cols-4 gap-2xs">
            {shown.map((item) => (
              <button
                key={item.id}
                className="aspect-square rounded-sm p-2xs transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
                type="button"
                aria-label="이모티콘"
                onClick={() => handleSelect(item)}
              >
                <PreloadImage
                  className="size-full"
                  imgClassName="size-full object-contain"
                  placeholderClassName="rounded-sm"
                  src={toEmoticonAssetUrl(item.id, "image", item.version)}
                  alt=""
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      {/* INFO: § 13.6. Pack tabs along the bottom, matching where the thumb already is. */}
      <div className="scrollbar-hidden flex shrink-0 gap-2xs overflow-x-auto border-t border-hairline-soft p-2xs">
        <TabButton
          isActive={activeTab === RECENTS_TAB}
          label="최근 사용"
          onClick={() => setRequestedTab(RECENTS_TAB)}
        >
          <Clock className="size-5 text-meta" strokeWidth={1.75} />
        </TabButton>
        {packs.map((pack) => {
          const tabItem = toTabItem(pack);

          return (
            <TabButton
              key={pack.id}
              isActive={activeTab === pack.id}
              label={pack.name}
              onClick={() => setRequestedTab(pack.id)}
            >
              {tabItem ? (
                <PreloadImage
                  className="size-full"
                  imgClassName="size-full object-contain"
                  placeholderClassName="rounded-sm"
                  src={toEmoticonAssetUrl(tabItem.id, "image", tabItem.version)}
                  alt=""
                />
              ) : (
                <Smile className="size-5 text-meta" strokeWidth={1.75} />
              )}
            </TabButton>
          );
        })}
      </div>
    </div>
  );

  function handleSelect(item: Emoticon) {
    remember(item.id);
    onSelect(item);
  }
}

type TabButtonProps = {
  className?: string;
  isActive: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
};

function TabButton({ className, isActive, label, children, onClick }: TabButtonProps) {
  return (
    <button
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-md p-2xs transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        isActive ? "bg-primary-tint" : "hover:bg-surface-soft active:bg-surface-strong",
        className,
      )}
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** INFO: REQUIREMENTS.md § 13.2. Null `thumbnail_item_id` falls back to the pack's first item. */
// INFO: The item itself rather than its id — the tab's asset URL needs its version too (§ 13.4.).
function toTabItem(pack: EmoticonPackWithItems): Nullable<Emoticon> {
  return pack.items.find((item) => item.id === pack.thumbnailItemId) ?? pack.items[0] ?? null;
}

function findPack(packs: EmoticonPackWithItems[], id: string) {
  return packs.find((pack) => pack.id === id);
}

async function fetchEnabledPacks(): Promise<EmoticonPackWithItems[]> {
  const response = await fetch(`${EMOTICON_PACKS_PATH}?enabled=1`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_PACKS_PATH} responded ${response.status}`);
  }

  const { packs } = (await response.json()) as { packs: EmoticonPackWithItems[] };

  return packs;
}
