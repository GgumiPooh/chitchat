import { ServerSettingsFallback } from "@/pages/server-settings";
import { isOpsDispatchConfigured } from "@/shared/ops";

export default function Loading() {
  // INFO: REQUIREMENTS.md § 12.4. Read here for the same reason the page reads it — a fallback that guessed would leave a hole where the two dispatching panels are not going to be.
  return <ServerSettingsFallback isOpsAvailable={isOpsDispatchConfigured()} />;
}
