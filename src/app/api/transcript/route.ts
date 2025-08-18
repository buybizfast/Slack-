// src/app/api/transcript/route.ts
export const runtime = 'edge';

const DESCRIPT_RE = /^https:\/\/share\.descript\.com\/view\/[A-Za-z0-9]+$/;
const META_RE = /<meta\s+property="descript:transcript"\s+content="([^"]+)"/i;

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function getTranscriptUrl(shareUrl: string) {
  const res = await fetch(shareUrl, { cache: 'no-store' });
  const html = await res.text();
  const m = html.match(META_RE);
  return m?.[1] ?? null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shareUrl = searchParams.get('u')?.trim();
  const expand = searchParams.get('expand') === 'true';
  if (!shareUrl || !DESCRIPT_RE.test(shareUrl)) return bad('invalid descript share url');

  const transcriptUrl = await getTranscriptUrl(shareUrl);
  if (!transcriptUrl) return bad('transcript meta not found', 404);

  if (!expand) {
    return new Response(JSON.stringify({ ok: true, transcriptUrl }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const tRes = await fetch(transcriptUrl, { cache: 'no-store' });
  if (!tRes.ok) return bad(`failed to fetch transcript json (${tRes.status})`, 502);
  const transcript = await tRes.json();

  return new Response(JSON.stringify({ ok: true, transcriptUrl, transcript }), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request) {
  const { url, expand } = await req.json().catch(() => ({}));
  if (!url || !DESCRIPT_RE.test(url)) return bad('invalid descript share url');
  const transcriptUrl = await getTranscriptUrl(url);
  if (!transcriptUrl) return bad('transcript meta not found', 404);
  if (!expand) return new Response(JSON.stringify({ ok: true, transcriptUrl }), { headers: { 'content-type': 'application/json' } });
  const tRes = await fetch(transcriptUrl, { cache: 'no-store' });
  if (!tRes.ok) return bad(`failed to fetch transcript json (${tRes.status})`, 502);
  const transcript = await tRes.json();
  return new Response(JSON.stringify({ ok: true, transcriptUrl, transcript }), { headers: { 'content-type': 'application/json' } });
}
