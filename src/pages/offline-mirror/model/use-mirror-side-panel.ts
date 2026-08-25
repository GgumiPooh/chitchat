import { APP_SHELL_ID, SIDE_PANEL_COOKIE_NAME } from "@/shared/config";
import { useEffect } from "react";

// INFO: AGENTS.md § 4.1. The mirror is a static document, so the cookie the `(main)` layout paints `data-side-panel` from can only be read after mount — the body-portalled dialog and drawer centre on `--content-left`, and none can open before hydration.
export function useMirrorSidePanel() {
  useEffect(() => {
    const isClosed = document.cookie
      .split("; ")
      .some((entry) => entry === `${SIDE_PANEL_COOKIE_NAME}=false`);

    if (isClosed) {
      document.getElementById(APP_SHELL_ID)?.setAttribute("data-side-panel", "closed");
    }
  }, []);
}
