import { getEmoticonPack } from "@/entities/emoticon";
import { EmoticonPackPage } from "@/pages/emoticon-pack";
import { requireUserOrRedirect } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonPackId } from "@/shared/lib";
import { notFound } from "next/navigation";

export default async function MiniPackRoute({ params }: { params: Promise<{ packId: string }> }) {
  const user = await requireUserOrRedirect();
  const packId = snowflakeSchema<EmoticonPackId>().safeParse((await params).packId);

  if (!packId.success) {
    notFound();
  }

  // INFO: § 13. The kind is part of the lookup, so an 이모티콘 pack opened at this address is a 404 rather than a pack drawn six to a row.
  const pack = await getEmoticonPack(packId.data, user.id, "mini");

  if (!pack) {
    notFound();
  }

  return <EmoticonPackPage pack={pack} />;
}
