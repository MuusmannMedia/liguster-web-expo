// supabase/functions/prune-posts/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "opslagsbilleder";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Row = { id: string; image_paths: string[] | null };

// konstanter
const MS_DAY = 24 * 60 * 60 * 1000;
const EXPIRES_DAYS = 14;

// tunables
const ROWS_LIMIT = 1000; // hent ad gangen
const STORAGE_CHUNK = 100; // antal paths per storage.remove() kald
const MAX_LOOPS = 10; // sikkerhedsstop, så vi ikke kører for evigt

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "content-type": "application/json",
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchExpiredBatch(): Promise<Row[]> {
  const nowIso = new Date().toISOString();
  const ageCutoffIso = new Date(Date.now() - EXPIRES_DAYS * MS_DAY).toISOString();

  // A) Eksplicit udløb
  const { data: aRows, error: aErr } = await supabase
    .from("posts")
    .select("id, image_paths")
    .lte("expires_at", nowIso)
    .limit(ROWS_LIMIT);

  if (aErr) throw new Error("select expires_at failed: " + aErr.message);

  // B) Implicit udløb (ingen expires_at, ældre end 14 dage)
  const { data: bRows, error: bErr } = await supabase
    .from("posts")
    .select("id, image_paths")
    .is("expires_at", null)
    .lte("created_at", ageCutoffIso)
    .limit(ROWS_LIMIT);

  if (bErr) throw new Error("select aged rows failed: " + bErr.message);

  const rows: Row[] = [...(aRows ?? []), ...(bRows ?? [])];

  // dedup hvis en række opfylder begge (teoretisk)
  const seen = new Set<string>();
  const deduped: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    deduped.push(r);
  }
  return deduped;
}

async function pruneBatch(rows: Row[], dryRun = false) {
  if (!rows.length) return { deletedIds: [] as string[], removedPaths: [] as string[] };

  // Saml paths
  const allPaths = uniq(
    rows.flatMap((r) =>
      Array.isArray(r.image_paths) ? r.image_paths.filter((p): p is string => !!p && typeof p === "string") : []
    )
  );

  const removedPaths: string[] = [];
  if (!dryRun && allPaths.length) {
    // slet i chunks for at være forsigtig
    for (const grp of chunk(allPaths, STORAGE_CHUNK)) {
      const { data, error } = await supabase.storage.from(BUCKET).remove(grp);
      if (error) {
        // vi fortsætter, men logger fejlen
        console.error("Storage remove error:", error);
      } else {
        removedPaths.push(...(data ?? []));
      }
    }
  }

  const ids = rows.map((r) => r.id);
  if (!dryRun && ids.length) {
    const { error } = await supabase.from("posts").delete().in("id", ids);
    if (error) throw new Error("delete rows failed: " + error.message);
  }

  return { deletedIds: ids, removedPaths: dryRun ? allPaths : removedPaths };
}

async function pruneAll(dryRun = false) {
  let totalDeleted = 0;
  let totalFiles = 0;
  const deletedIds: string[] = [];
  const removedPaths: string[] = [];

  for (let i = 0; i < MAX_LOOPS; i++) {
    const batch = await fetchExpiredBatch();
    if (!batch.length) break;

    const res = await pruneBatch(batch, dryRun);
    totalDeleted += res.deletedIds.length;
    totalFiles += res.removedPaths.length;
    deletedIds.push(...res.deletedIds);
    removedPaths.push(...res.removedPaths);

    // hvis vi fik en “fuld” batch, så prøver vi igen (kan være der er flere end ROWS_LIMIT)
    if (batch.length < ROWS_LIMIT) break;
  }

  return {
    ok: true as const,
    dryRun,
    deleted: totalDeleted,
    files: totalFiles,
    deletedIds: uniq(deletedIds),
    removedPaths: uniq(removedPaths),
  };
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS, status: 204 });
  }

  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";

    const result = await pruneAll(dry);
    return new Response(JSON.stringify(result), { headers: CORS, status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { headers: CORS, status: 500 }
    );
  }
});