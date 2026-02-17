import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { PhotosManager } from "@/components/me/PhotosManager";

export default async function MePhotosPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack">
            <p className="eyebrow">Me</p>
            <h1>Profile photos</h1>
            <p className="muted">
              Upload photos to Storage and keep your Discover card up to date.
            </p>
            <div className="actions">
              <Link className="button-link ghost" href="/me">Back to Me</Link>
            </div>
          </section>

          <PhotosManager />
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
