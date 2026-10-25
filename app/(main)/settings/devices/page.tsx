import { SECURITY_SETTINGS_ROUTE } from "@/shared/config";
import { redirect } from "next/navigation";

export default function DeviceSettingsRoute() {
  redirect(SECURITY_SETTINGS_ROUTE);
}
