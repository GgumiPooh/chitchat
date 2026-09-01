"use client";

import { ARCHIVE_MODE_PARAM, toArchiveModeFilter, type ArchiveModeFilter } from "@/shared/config";
import { ActionSheet, IconButton, type ActionSheetItem } from "@/shared/ui";
import { Check, Filter, ListFilter } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

export function ArchiveFilterButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const current = toArchiveModeFilter(searchParams?.get(ARCHIVE_MODE_PARAM));

  function selectFilter(val: ArchiveModeFilter) {
    setIsOpen(false);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (val === "all") {
      params.delete(ARCHIVE_MODE_PARAM);
    } else {
      params.set(ARCHIVE_MODE_PARAM, val);
    }
    router.replace(`?${params.toString()}`);
  }

  const items: ActionSheetItem[] = [
    {
      label: "전체보기",
      Icon: current === "all" ? Check : undefined,
      onSelect: () => selectFilter("all"),
    },
    {
      label: "공유된 항목",
      Icon: current === "shared" ? Check : undefined,
      onSelect: () => selectFilter("shared"),
    },
    {
      label: "나에게 보낸 항목",
      Icon: current === "onlyMe" ? Check : undefined,
      onSelect: () => selectFilter("onlyMe"),
    },
  ];

  const isFiltered = current !== "all";

  return (
    <>
      <div ref={buttonRef} className="flex inline-block items-center justify-center">
        <IconButton
          iconClassName={isFiltered ? "text-primary" : undefined}
          variant="floating"
          Icon={isFiltered ? ListFilter : Filter}
          haptic
          aria-label="보기 옵션 필터"
          onClick={() => setIsOpen(true)}
        />
      </div>
      <ActionSheet
        isOpen={isOpen}
        header={{ title: "보기 옵션" }}
        items={items}
        anchorRef={buttonRef}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
