import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { redirect } from "next/navigation";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return (
    <main className="app-main">
      <OnboardingFlow userId={user.id} firstName={user.firstName} initialTab="me" />
    </main>
  );
}
