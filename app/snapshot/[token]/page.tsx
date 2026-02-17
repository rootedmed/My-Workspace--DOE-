import { SnapshotViewer } from "@/components/snapshot/SnapshotViewer";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SnapshotPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <SnapshotViewer token={token} />
        </div>
      </section>
    </main>
  );
}
