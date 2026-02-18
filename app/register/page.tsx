import { getCurrentUser } from "@/lib/auth/session";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { redirect } from "next/navigation";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user?.id) {
    redirect("/app");
  }

  if (!isUiRouteEnabled("public_auth")) {
    return (
      <main className="public-main">
        <UiFallbackNotice
          title="Registration refresh is temporarily paused"
          description="The redesigned account creation flow is currently gated."
          primaryHref="/login"
          primaryLabel="Sign in"
          secondaryHref="/"
          secondaryLabel="Back to home"
        />
      </main>
    );
  }

  return (
    <main className="public-main">
      <RegisterForm />
    </main>
  );
}
