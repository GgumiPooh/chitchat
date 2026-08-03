import { DEV_LOGIN_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Button, Input } from "@/shared/ui";

export type DevLoginFormProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 5.4. A plain form POST, so the dev path needs no client bundle of its own.
export function DevLoginForm({ className }: DevLoginFormProps) {
  return (
    <form className={cn("flex flex-col gap-xs", className)} action={DEV_LOGIN_ROUTE} method="post">
      <Input name="email" type="email" autoComplete="email" placeholder="개발용 이메일" required />
      <Button type="submit">개발용 로그인</Button>
    </form>
  );
}
