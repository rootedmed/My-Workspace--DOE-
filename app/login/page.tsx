import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.id) {
    redirect("/app");
  }

  return (
    <main>
      <LoginForm />
    </main>
  );
}
