// Cloudflare Worker: /api 로 요청하면 그 자리에서 게시판들을 읽어 JSON으로 돌려준다.
//   /api?board=<id>  게시판 하나 (페이지는 게시판마다 따로 불러서 먼저 온 것부터 보여준다)
//   /api?board=hot-<id>  인기글 (개념글, 불펜 베스트)
//   /api             게시판 전부
//   /api/ebook?lib=<id>&q=<책 제목>  전자도서관 한 곳에서 책 찾기 (/api/ebook 만 부르면 도서관 목록)
// 나머지 주소는 저장소의 index.html 같은 정적 파일을 그대로 보여준다(wrangler.toml의 assets).
import { BOARDS, HOT, collect, collectOne } from "./boards.js";
import { LIBS, searchLib } from "./ebook.js";

const CACHE_SECONDS = 60; // 1분 안에 다시 열면 같은 결과를 바로 보여준다

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" };
    if (url.pathname === "/api/ebook") return ebook(url, headers, ctx);
    if (url.pathname !== "/api") return env.ASSETS.fetch(request);

    const id = url.searchParams.get("board") || "";
    const board = id && BOARDS.concat(HOT).find(b => b.id === id);
    if (id && !board) return new Response(JSON.stringify({ error: "없는 게시판" }), { status: 404, headers });

    const cache = caches.default;
    const key = new Request(url.origin + "/api?board=" + encodeURIComponent(id));
    if (!url.searchParams.has("fresh")) {
      const hit = await cache.match(key);
      if (hit) return new Response(hit.body, { headers });
    }
    const body = JSON.stringify(board ? await collectOne(board) : await collect());
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { ...headers, "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
    return new Response(body, { headers });
  },
};

async function ebook(url, headers, ctx) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const id = url.searchParams.get("lib") || "";
  if (!q || !id) return new Response(JSON.stringify(LIBS.map(l => ({ id: l.id, name: l.name, home: l.home }))), { headers });
  const lib = LIBS.find(l => l.id === id);
  if (!lib) return new Response(JSON.stringify({ error: "없는 도서관" }), { status: 404, headers });
  const cache = caches.default;
  const key = new Request(url.origin + "/api/ebook?lib=" + id + "&q=" + encodeURIComponent(q));
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers });
  const r = await searchLib(lib, q);
  const body = JSON.stringify(r);
  if (!r.error) ctx.waitUntil(cache.put(key, new Response(body, { headers: { ...headers, "Cache-Control": "max-age=600" } })));
  return new Response(body, { headers });
}
