import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find tournaments that:
    // 1. Are NOT closed
    // 2. Have NOT been manually closed (is_manually_closed = false)
    // 3. Ended more than 48 hours ago
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: toClose, error: fetchError } = await supabase
      .from("tournaments")
      .select("id, name, end_date")
      .eq("is_closed", false)
      .eq("is_manually_closed", false)
      .lt("end_date", cutoff);

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!toClose || toClose.length === 0) {
      return new Response(JSON.stringify({ closed: 0 }), { status: 200 });
    }

    const ids = toClose.map((t) => t.id);

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({
        is_closed: true,
        auto_closed_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
    }

    console.log(`Auto-closed ${ids.length} tournament(s):`, toClose.map((t) => t.name));

    return new Response(
      JSON.stringify({ closed: ids.length, tournaments: toClose.map((t) => t.name) }),
      { status: 200 }
    );
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
