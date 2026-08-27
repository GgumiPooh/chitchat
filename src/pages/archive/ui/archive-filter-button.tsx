"use client";

import { ActionSheet, IconButton, type ActionSheetItem } from "@/shared/ui";
import { Filter, Check, ListFilter } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef } from "react";

export function ArchiveFilterButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  
  const current = searchParams?.get("mode") ?? "all";
  
  function selectFilter(val: string) {
    setIsOpen(false);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (val === "all") {
      params.delete("mode");
    } else {
      params.set("mode", val);
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
    }
  ];

  const isFiltered = current !== "all";

  return (
    <>
      <div ref={buttonRef} className="inline-block flex items-center justify-center">
        <IconButton
          variant="floating"
          Icon={isFiltered ? ListFilter : Filter}
          iconClassName={isFiltered ? "text-primary" : undefined}
          haptic
          aria-label="보기 옵션 필터"
          onClick={() => setIsOpen(true)}
        />
      </div>
      <ActionSheet 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)}
        header={{ title: "보기 옵션" }}
        items={items}
        anchorRef={buttonRef}
      />
    </>
  );
}
