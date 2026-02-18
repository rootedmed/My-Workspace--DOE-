import { GuestCompatibilityForm } from "@/components/guest/GuestCompatibilityForm";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function GuestTokenPage({ params }: PageProps) {
  const { token } = await params;

  if (!isUiRouteEnabled("guest_snapshot")) {
    return (
      <main className="public-main guest-public-main">
        <UiFallbackNotice
          title="Guest link experience is temporarily paused"
          description="The guest compatibility UI is currently gated for staged rollout."
          primaryHref="/"
          primaryLabel="Back to home"
        />
      </main>
    );
  }

  return (
    <main className="public-main guest-public-main">
      <GuestCompatibilityForm token={token} />
    </main>
  );
}
