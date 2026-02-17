import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { MatchesList } from "@/components/matches/MatchesList";

export default async function MatchesPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return <MatchesList />;
}
