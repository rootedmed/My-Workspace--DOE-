type SupabaseQueryResult = {
  error?: unknown | null;
  data?: Record<string, unknown> | null;
  count?: number | null;
};

type SupabaseQueryBuilder = {
  upsert: (...args: unknown[]) => Promise<SupabaseQueryResult>;
  update: (...args: unknown[]) => SupabaseQueryBuilder;
  select: (...args: unknown[]) => SupabaseQueryBuilder;
  eq: (...args: unknown[]) => SupabaseQueryBuilder;
  maybeSingle: () => Promise<SupabaseQueryResult>;
};

type SupabaseLike = {
  from: (table: string) => unknown;
};

function fromTable(supabase: SupabaseLike, table: string): SupabaseQueryBuilder {
  return supabase.from(table) as SupabaseQueryBuilder;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureMatchOutcomeRows(
  supabase: SupabaseLike,
  args: {
    matchId: string;
    userAId: string;
    userBId: string;
    scoreForA?: number | null;
    scoreForB?: number | null;
  }
) {
  const timestamp = nowIso();
  await fromTable(supabase, "match_outcomes").upsert(
    [
      {
        match_id: args.matchId,
        user_id: args.userAId,
        matched_user_id: args.userBId,
        compatibility_score: args.scoreForA ?? null,
        updated_at: timestamp
      },
      {
        match_id: args.matchId,
        user_id: args.userBId,
        matched_user_id: args.userAId,
        compatibility_score: args.scoreForB ?? null,
        updated_at: timestamp
      }
    ],
    { onConflict: "match_id,user_id" }
  );
}

export async function recordMatchView(
  supabase: SupabaseLike,
  args: { matchId: string; userId: string; matchedUserId: string }
) {
  const timestamp = nowIso();
  await fromTable(supabase, "match_outcomes").upsert(
    {
      match_id: args.matchId,
      user_id: args.userId,
      matched_user_id: args.matchedUserId,
      did_view: true,
      viewed_at: timestamp,
      updated_at: timestamp
    },
    { onConflict: "match_id,user_id" }
  );
}

export async function recordMessageOutcome(
  supabase: SupabaseLike,
  args: {
    matchId: string;
    senderId: string;
    recipientId: string;
  }
) {
  const timestamp = nowIso();

  await fromTable(supabase, "match_outcomes").upsert(
    {
      match_id: args.matchId,
      user_id: args.senderId,
      matched_user_id: args.recipientId,
      did_message: true,
      messaged_at: timestamp,
      updated_at: timestamp
    },
    { onConflict: "match_id,user_id" }
  );

  const recipientOutcomeRes = await fromTable(supabase, "match_outcomes")
    .select("did_message, did_reply, messaged_at")
    .eq("match_id", args.matchId)
    .eq("user_id", args.recipientId)
    .maybeSingle();
  const recipientOutcome = (recipientOutcomeRes.data ?? null) as {
    did_message?: boolean | null;
    did_reply?: boolean | null;
    messaged_at?: string | null;
  } | null;

  if (!recipientOutcomeRes.error && recipientOutcome?.did_message === true && recipientOutcome.did_reply !== true) {
    const messagedAt = recipientOutcome.messaged_at ? Date.parse(String(recipientOutcome.messaged_at)) : NaN;
    const within72Hours = Number.isFinite(messagedAt) && Date.now() - messagedAt <= 72 * 60 * 60 * 1000;
    if (within72Hours) {
      await (fromTable(supabase, "match_outcomes")
        .update({
          did_reply: true,
          replied_at: timestamp,
          updated_at: timestamp
        })
        .eq("match_id", args.matchId)
        .eq("user_id", args.recipientId) as unknown as Promise<SupabaseQueryResult>);
    }
  }

  const countRes = await (fromTable(supabase, "match_messages")
    .select("id", { count: "exact", head: true })
    .eq("match_id", args.matchId) as unknown as Promise<SupabaseQueryResult>);
  const count = typeof countRes.count === "number" ? countRes.count : 0;
  await (fromTable(supabase, "match_outcomes")
    .update({ conversation_length: count, updated_at: timestamp })
    .eq("match_id", args.matchId)
    .eq("user_id", args.senderId) as unknown as Promise<SupabaseQueryResult>);
  await (fromTable(supabase, "match_outcomes")
    .update({ conversation_length: count, updated_at: timestamp })
    .eq("match_id", args.matchId)
    .eq("user_id", args.recipientId) as unknown as Promise<SupabaseQueryResult>);
}
