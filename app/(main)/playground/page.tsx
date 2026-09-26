import { PlaygroundPage } from "@/pages/playground";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  await requireUserOrRedirect();

  return <PlaygroundPage />;
}
