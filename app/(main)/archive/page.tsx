import { ARCHIVE_GALLERY_ROUTE } from "@/shared/config";
import { redirect } from "next/navigation";

/**
 * REQUIREMENTS.md § 10. `/archive` is the tab's prefix, not a shelf — it sends the
 * caller to 사진.
 *
 * WARN: A redirect, never a second copy of `ArchivePage`. Two routes rendering one
 * screen would give 사진 two URLs, and `LibrarySegments` reads the active chip off
 * the pathname — the chip would light on one of them and not the other.
 *
 * INFO: The tab bar links straight to `ARCHIVE_GALLERY_ROUTE` (`widgets/tab-bar`), so
 * nothing in the app walks through this. It is here for a typed URL and for a
 * bookmark made before the shelves became symmetric.
 */
export default function Page() {
  redirect(ARCHIVE_GALLERY_ROUTE);
}
