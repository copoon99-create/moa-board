// Cloudflare Worker: /api 로 요청하면 그 자리에서 게시판들을 읽어 JSON으로 돌려준다.
// 나머지 주소는 저장소의 index.html 같은 정적 파일을 그대로 보여준다(wrangler.toml의 assets).
import { collect } from "./boards.js";

const CACHE_SECONDS = 60; // 1분 안에 다시 열면 같은 결과를 바로 보여준다

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api") return env.ASSETS.fetch(request);

    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" };
    const cache = caches.default;
    const key = new Request(url.origin + "/api");
    if (!url.searchParams.has("fresh")) {
      const hit = await cache.match(key);
      if (hit) return new Response(hit.body, { headers: cors });
    }
    const body = JSON.stringify(await collect());
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { ...cors, "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
    return new Response(body, { headers: cors });
  },
};
