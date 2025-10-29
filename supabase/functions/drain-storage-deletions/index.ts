import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url  = Deno.env.get('SUPABASE_URL')!;
const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb   = createClient(url, key);
const BUCKET_FALLBACK = 'opslagsbilleder';

export async function handler(_req: Request) {
  let removed = 0;

  while (true) {
    const { data: rows, error } = await sb
      .from('storage_delete_queue')
      .select('id,bucket,path')
      .order('id', { ascending: true })
      .limit(100);
    if (error) return new Response(error.message, { status: 500 });
    if (!rows?.length) break;

    // group by bucket for a single remove call each
    const byBucket = new Map<string, { id: number; path: string }[]>();
    for (const r of rows) {
      const b = r.bucket || BUCKET_FALLBACK;
      if (!byBucket.has(b)) byBucket.set(b, []);
      byBucket.get(b)!.push({ id: r.id, path: r.path });
    }

    for (const [bucket, list] of byBucket) {
      const paths = list.map(x => x.path);
      const { error: rmErr } = await sb.storage.from(bucket).remove(paths);
      if (rmErr) {
        // Don’t delete queue rows; try again next run
        return new Response(rmErr.message, { status: 500 });
      }
      removed += paths.length;
      const ids = list.map(x => x.id);
      await sb.from('storage_delete_queue').delete().in('id', ids);
    }
  }

  return new Response(JSON.stringify({ removed }), { headers: { 'content-type': 'application/json' }});
}

Deno.serve(handler);