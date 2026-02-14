import { getCurrentUser } from "@/lib/auth/session";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user?.id) {
    redirect("/app");
  }

  return (
    <main>
      <RegisterForm />
    </main>
  );
}
