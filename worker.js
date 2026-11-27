// Cloudflare Worker: FANZA ItemList API proxy
// Set secrets in Worker settings:
//   API_ID         = DMM Webサービス API ID
//   AFFILIATE_ID   = FANZA affiliate ID (e.g. xxx-990)
// Never put these values in the HTML or public repository.
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, configured: !!(env.API_ID && env.AFFILIATE_ID) }, { headers: JSON_HEADERS });
    }
    if (url.pathname !== "/api/new" || request.method !== "GET") {
      return Response.json({ error: "Not found" }, { status: 404, headers: JSON_HEADERS });
    }
    if (!env.API_ID || !env.AFFILIATE_ID) {
      return Response.json({ error: "API_ID and AFFILIATE_ID are not configured on the server." }, { status: 503, headers: JSON_HEADERS });
    }

    const hits = Math.min(50, Math.max(1, Number(url.searchParams.get("hits") || 30)));
    const api = new URL("https://api.dmm.com/affiliate/v3/ItemList");
    const params = {
      api_id: env.API_ID,
      affiliate_id: env.AFFILIATE_ID,
      site: "FANZA",
      service: "digital",
      floor: "videoa",
      hits: String(hits),
      offset: "1",
      sort: "date",
      output: "json"
    };
    for (const [k, v] of Object.entries(params)) api.searchParams.set(k, v);

    try {
      const upstream = await fetch(api.toString(), { headers: { "accept": "application/json" } });
      const body = await upstream.json();
      if (!upstream.ok || body?.result?.status !== 200) {
        return Response.json({ error: "FANZA API request failed", detail: body?.result?.message || upstream.statusText }, { status: 502, headers: JSON_HEADERS });
      }
      const items = body?.result?.items || [];
      // Return only fields needed by the feed; do not expose request metadata or API ID.
      const safeItems = items.map(item => ({
        content_id: item.content_id,
        title: item.title,
        date: item.date,
        affiliateURL: item.affiliateURL,
        imageURL: item.imageURL,
        sampleMovieURL: item.sampleMovieURL,
        iteminfo: {
          actress: item.iteminfo?.actress || [],
          maker: item.iteminfo?.maker || []
        }
      }));
      return Response.json({ items: safeItems }, {
        headers: { ...JSON_HEADERS, "cache-control": "public, max-age=900" }
      });
    } catch (err) {
      return Response.json({ error: "Upstream request error", detail: String(err) }, { status: 502, headers: JSON_HEADERS });
    }
  }
};