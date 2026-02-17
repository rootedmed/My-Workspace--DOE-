import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return <DiscoverFeed />;
}
