import { getEmoticonPack } from "@/entities/emoticon";
import { EmoticonPackPage } from "@/pages/emoticon-pack";
import { requireUserOrRedirect } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonPackId } from "@/shared/lib";
import { notFound } from "next/navigation";

export default async function EmoticonPackRoute({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const user = await requireUserOrRedirect();
  const packId = snowflakeSchema<EmoticonPackId>().safeParse((await params).packId);

  if (!packId.success) {
    notFound();
  }

  const pack = await getEmoticonPack(packId.data, user.id);

  if (!pack) {
    notFound();
  }

  return <EmoticonPackPage pack={pack} />;
}
