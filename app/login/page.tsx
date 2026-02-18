import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";
import { redirect } from "next/navigation";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.id) {
    redirect("/app");
  }

  if (!isUiRouteEnabled("public_auth")) {
    return (
      <main className="public-main">
        <UiFallbackNotice
          title="Sign-in refresh is temporarily paused"
          description="This visual journey is currently gated while rollout metrics are reviewed."
          primaryHref="/"
          primaryLabel="Back to home"
          secondaryHref="/register"
          secondaryLabel="Create account"
        />
      </main>
    );
  }

  return (
    <main className="public-main">
      <LoginForm />
    </main>
  );
}
