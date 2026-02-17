# Chat MVP Test Script (10 Steps)

1. Apply migration `supabase/migrations/010_match_messages_chat.sql`.
2. Sign in as `User A` and `User B` in separate browsers.
3. Ensure both users completed onboarding and can see each other in Discover.
4. Create a mutual match (A likes B, B likes back).
5. Open `/matches` as `User A` and confirm match card appears with `Open chat`.
6. Tap `Open chat` and verify route is `/matches/{matchId}`.
7. In `User A` chat, send message: `Hi, want to grab coffee this weekend?`.
8. In `User B` chat for the same match, wait up to 3 seconds and verify message appears.
9. Send reply from `User B`, then refresh both pages and verify full history persists.
10. Validate states:
   - Empty chat shows: `No messages yet. Say hi.`
   - If API fails, error appears and app does not crash.
