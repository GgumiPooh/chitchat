import { LibraryFallback } from "@/pages/archive";

// INFO: The bare `/archive` only exists for the instant before its redirect to 사진 lands (REQUIREMENTS.md § 10.), so it is that shelf this covers.
export default function Loading() {
  return <LibraryFallback shelf="gallery" />;
}
