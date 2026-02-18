import { SnapshotViewer } from "@/components/snapshot/SnapshotViewer";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SnapshotPage({ params }: PageProps) {
  const { token } = await params;

  if (!isUiRouteEnabled("guest_snapshot")) {
    return (
      <main className="public-main guest-public-main">
        <UiFallbackNotice
          title="Snapshot experience is temporarily paused"
          description="Shared snapshot rendering is currently gated for staged rollout."
          primaryHref="/"
          primaryLabel="Back to home"
        />
      </main>
    );
  }

  return (
    <main className="public-main guest-public-main">
      <SnapshotViewer token={token} />
    </main>
  );
}
