// supabase/functions/delete-post/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "opslagsbilleder";

serve(async (req) => {
  try {
    const { postId, userId } = await req.json();

    // Tjek ejerskab via DB (RLS må stadig gerne være tændt; service role kan dog overstyre)
    const { data: row, error: selErr } = await supabase
      .from("posts")
      .select("id, user_id, image_paths")
      .eq("id", postId)
      .single();
    if (selErr) throw selErr;
    if (row.user_id !== userId) return new Response("Forbidden", { status: 403 });

    if (Array.isArray(row.image_paths) && row.image_paths.length) {
      await supabase.storage.from(BUCKET).remove(row.image_paths.filter(Boolean));
    }
    const { error: delErr } = await supabase.from("posts").delete().eq("id", postId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});