import { GuestCompatibilityForm } from "@/components/guest/GuestCompatibilityForm";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function GuestTokenPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <GuestCompatibilityForm token={token} />
        </div>
      </section>
    </main>
  );
}
