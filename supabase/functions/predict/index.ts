// The deal model: nearest neighbours over past deals stored in the database.
// Called by the Salesforce site when a deal is saved and when a call is logged.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// How much each thing counts when deciding how similar two deals are
const WEIGHTS = { industry: 0.35, products: 0.35, words: 0.2, source: 0.05, region: 0.05 };
const K = 5;            // how many of the closest past deals get a vote
const MIN_SHARE = 0.15; // a sticking point needs at least this share of the vote to be shown

const STOP = new Set(('a an and are as at be but by can do for from have how if in is it its of on or our out so that the their them there they ' +
  'this to up was we what when where who will with you your just not only after been get has into more than then about ever every whos were weve isnt').split(' '));

function words(text: string): Set<string> {
  const out = new Set<string>();
  text.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).forEach((w) => {
    if (w.length < 3 || STOP.has(w)) return;
    out.add(w.replace(/(ing|ed|es|s|e)$/, ''));
  });
  return out;
}

function overlap<T>(a: T[] | Set<T>, b: T[] | Set<T>): number {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]).size;
  if (!union) return 0;
  let both = 0;
  A.forEach((x) => { if (B.has(x)) both += 1; });
  return both / union;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { deal_id } = await req.json();
    if (!deal_id) return json({ error: 'deal_id is required' }, 400);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const [dealRes, actsRes, pastRes, pointsRes, vertsRes, runsRes] = await Promise.all([
      db.from('deals').select('*').eq('id', deal_id).single(),
      db.from('activities').select('*').eq('deal_id', deal_id).order('created_at'),
      db.from('past_deals').select('*').eq('held_out', false).neq('id', deal_id),
      db.from('sticking_points').select('*'),
      db.from('verticals').select('*'),
      db.from('model_runs').select('id', { count: 'exact', head: true }).eq('deal_id', deal_id)
    ]);
    if (dealRes.error) return json({ error: 'Deal not found' }, 404);
    const deal = dealRes.data;
    const acts = actsRes.data ?? [];
    const past = pastRes.data ?? [];
    const points = pointsRes.data ?? [];
    const group = (vertsRes.data ?? []).find((v) => v.vertical === deal.vertical)?.industry_group ?? 'Other';
    const notes = acts.map((a) => a.body).join(' ');
    const myWords = words((deal.problem ?? '') + ' ' + notes);

    // 1. Score every past deal
    const ranked = past.map((p) => {
      const parts = {
        industry: p.industry_group === group ? 1 : 0,
        products: overlap(p.products, deal.products),
        words: Math.min(1, overlap(words(p.problem + ' ' + (p.last_note ?? '')), myWords) * 4),
        source: p.source_type === (deal.source ?? '').split(' ')[0] ? 1 : 0,
        region: p.regions.some((r: string) => deal.regions.includes(r)) ? 1 : 0
      };
      const sim = WEIGHTS.industry * parts.industry + WEIGHTS.products * parts.products + WEIGHTS.words * parts.words +
        WEIGHTS.source * parts.source + WEIGHTS.region * parts.region;
      return { id: p.id, name: p.name, group: p.industry_group, sim: Math.round(sim * 1000) / 1000, parts, sticking_points: p.sticking_points };
    }).sort((a, b) => b.sim - a.sim);

    // 2. The closest deals vote on what this one could get stuck on
    const top = ranked.slice(0, K);
    const total = top.reduce((s, p) => s + p.sim, 0) || 1;
    const votes = new Map<string, typeof top>();
    top.forEach((p) => p.sticking_points.forEach((t: string) => votes.set(t, [...(votes.get(t) ?? []), p])));

    // 3. Anything the buyer raised on a logged call is happening now
    const raised = new Set(points.filter((s) => s.keywords && new RegExp(s.keywords, 'i').test(notes)).map((s) => s.tag));

    type Pred = { tag: string; status: string; kind: string; raised: boolean; share: number; evidence: Record<string, unknown> };
    const preds: Pred[] = [];
    votes.forEach((from, tag) => {
      const share = from.reduce((s, p) => s + p.sim, 0) / total;
      if (share >= MIN_SHARE || raised.has(tag)) {
        preds.push({ tag, status: raised.has(tag) ? 'now' : 'likely', kind: 'similar', raised: raised.has(tag), share: Math.round(share * 1000) / 1000, evidence: { from: from.map((p) => ({ id: p.id, name: p.name, sim: p.sim })) } });
      }
    });
    raised.forEach((tag) => { if (!preds.some((p) => p.tag === tag)) preds.push({ tag, status: 'now', kind: 'similar', raised: true, share: 0, evidence: { from: [] } }); });

    // 4. Known product issues from support calls
    points.filter((s) => s.product && deal.products.includes(s.product) && (!s.region || deal.regions.includes(s.region)))
      .forEach((s) => { if (!preds.some((p) => p.tag === s.tag)) preds.push({ tag: s.tag, status: 'likely', kind: 'product', raised: false, share: 0, evidence: { source: 'Support calls', product: s.product } }); });

    preds.sort((a, b) => (a.status !== b.status ? (a.status === 'now' ? -1 : 1) : a.kind !== b.kind ? (a.kind === 'similar' ? -1 : 1) : b.share - a.share));

    // 5. Save the run and its predictions
    const runNo = (runsRes.count ?? 0) + 1;
    const run = await db.from('model_runs').insert({ deal_id, run_no: runNo, compared: ranked.length, neighbours: ranked }).select().single();
    if (run.error) throw run.error;
    await db.from('predictions').delete().eq('deal_id', deal_id);
    if (preds.length) {
      const ins = await db.from('predictions').insert(preds.map((p) => ({ ...p, run_id: run.data.id, deal_id })));
      if (ins.error) throw ins.error;
    }
    return json({ run_id: run.data.id, run_no: runNo, compared: ranked.length, k: K, weights: WEIGHTS, neighbours: ranked, predictions: preds });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
