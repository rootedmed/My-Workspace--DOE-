import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const matches = await supabase
    .from("match_results")
    .select("candidate_id, candidate_first_name, total_score, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (matches.error) {
    return NextResponse.json({ error: "Could not load matches." }, { status: 500 });
  }

  return NextResponse.json({ matches: matches.data ?? [] }, { status: 200 });
}
