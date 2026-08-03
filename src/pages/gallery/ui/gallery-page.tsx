import { cn } from "@/shared/lib";
import { AppHeader, EmptyState } from "@/shared/ui";
import { Images } from "lucide-react";

export type GalleryPageProps = {
  className?: string;
};

// TODO: Replace the body with the month-sectioned photo grid — step 7 of REQUIREMENTS.md § 17.
export function GalleryPage({ className }: GalleryPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="갤러리" />
      <div className="flex flex-1 items-center justify-center p-md">
        <EmptyState Icon={Images} description="아직 주고받은 사진이 없어요" />
      </div>
    </div>
  );
}
