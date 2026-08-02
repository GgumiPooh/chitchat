import { Container } from "@/shared/ui";

// TODO: Replace with the session check that redirects to `/chat` or `/login` once auth lands (REQUIREMENTS.md § 5.2.).
export default function Page() {
  return (
    <main className="min-h-dvh bg-canvas">
      <Container className="py-2xl">
        <h1 className="text-display-lg text-ink">J&amp;H</h1>
      </Container>
    </main>
  );
}
