import { LoginPage } from "@/pages/login";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인",
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { error } = await searchParams;

  return <LoginPage error={error} />;
}
