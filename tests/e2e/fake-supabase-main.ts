import { startFakeSupabase } from "./fake-supabase";

const port = Number(process.env.FAKE_SUPABASE_PORT ?? "54321");
await startFakeSupabase(port);
console.log(`fake supabase listening on ${port}`);
