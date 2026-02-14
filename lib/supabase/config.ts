export function getSupabaseUrl(): string {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error("Missing SUPABASE_URL");
  }
  return value;
}

export function getSupabaseAnonKey(): string {
  const value = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }
  return value;
}
