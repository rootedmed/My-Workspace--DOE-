import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildLucySessionView } from "@/lib/onboarding/lucy/engine";
import { buildLucySessionViewFree, enableFreeConversationMode } from "@/lib/onboarding/lucy/freeConversationEngine";
import { resolveLucyOnboardingEngine } from "@/lib/onboarding/lucy/freeMode";
import { ensureLucySession } from "@/lib/onboarding/lucy/store";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);
  const existing = await ensureLucySession(user.id);
  const engine = resolveLucyOnboardingEngine();
  const view =
    engine === "free_chat"
      ? buildLucySessionViewFree(enableFreeConversationMode(existing))
      : buildLucySessionView(existing);
  return NextResponse.json({ session: view }, { status: 200 });
}
