import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { redirect } from "next/navigation";

export default async function ProtectedAppPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return (
    <main>
      <section className="panel actions">
        <h1>Welcome, {user.firstName ?? "there"}</h1>
      </section>
      <OnboardingFlow userId={user.id} />
    </main>
  );
}
