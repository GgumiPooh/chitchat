import { getEmoticonPack } from "@/entities/emoticon";
import { EmoticonPackPage } from "@/pages/emoticon-pack";
import { requireUserOrRedirect } from "@/shared/auth";
import { notFound } from "next/navigation";

export default async function EmoticonPackRoute({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const user = await requireUserOrRedirect();
  const pack = await getEmoticonPack((await params).packId, user.id);

  if (!pack) {
    notFound();
  }

  return <EmoticonPackPage pack={pack} />;
}
