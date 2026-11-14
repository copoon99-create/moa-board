// Cloudflare Worker: /api 로 요청하면 그 자리에서 게시판들을 읽어 JSON으로 돌려준다.
//   /api?board=<id>  게시판 하나 (페이지는 게시판마다 따로 불러서 먼저 온 것부터 보여준다)
//   /api?board=<id>&page=2  더 지난 글 (아래로 내릴 때)
//   /api?board=hot-<id>  인기글 (개념글, 불펜 베스트)
//   /api             게시판 전부
//   /api/read?k=<연동 코드>  읽은 글 주소 목록 (GET 읽기, POST {add:[주소]} 추가)
//   /api/prefs?k=<연동 코드>  바로가기·게시판 편집과 숨길 단어 (GET 읽기, POST {t, v} 더 새것이면 저장)
//   /api/ebook?lib=<id>&q=<책 제목>  전자도서관 한 곳에서 책 찾기 (/api/ebook 만 부르면 도서관 목록)
// 나머지 주소는 저장소의 index.html 같은 정적 파일을 그대로 보여준다(wrangler.toml의 assets).
import { BOARDS, HOT, collect, collectOne } from "./boards.js";
import { LIBS, searchLib } from "./ebook.js";
import { DurableObject } from "cloudflare:workers";

const CACHE_SECONDS = 60; // 1분 안에 다시 열면 같은 결과를 바로 보여준다
const STALE_SECONDS = 1800; // 그보다 오래된 결과도 30분까지는 먼저 보여주고 뒤에서 새로 읽는다

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" };
    if (url.pathname === "/api/ebook") return ebook(url, headers, ctx);
    if (url.pathname === "/api/read") return reads(request, url, env, headers);
    if (url.pathname === "/api/prefs") return prefs(request, url, env, headers);
    if (url.pathname !== "/api") return env.ASSETS.fetch(request);

    const id = url.searchParams.get("board") || "";
    const board = id && BOARDS.concat(HOT).find(b => b.id === id);
    if (id && !board) return new Response(JSON.stringify({ error: "없는 게시판" }), { status: 404, headers });

    const cache = caches.default;
    const page = Math.min(20, Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const key = new Request(url.origin + "/api?board=" + encodeURIComponent(id) + (page > 1 ? "&page=" + page : ""));
    // 1분 넘게 지난 결과도 일단 바로 보여주고, 뒤에서 새로 읽어 저장해 둔다 (느린 게시판도 바로 뜨게)
    const refresh = async () => {
      const body = JSON.stringify(board ? await collectOne(board, undefined, page) : await collect());
      const ok = /"posts":\[\{/.test(body);
      // 이번에 못 읽었으면, 저장해 둔 정상 결과를 오류로 덮지 않고 그 결과에 오류 표시만 붙여 돌려준다
      if (!ok && board) {
        const old = await cache.match(key);
        if (old) {
          try {
            const o = JSON.parse(await old.text());
            if ((o.posts || []).length) {
              o.error = JSON.parse(body).error || "새로 못 읽었어요";
              o.stale = true;
              return JSON.stringify(o);
            }
          } catch {}
        }
      }
      await cache.put(key, new Response(body, { headers: { ...headers, "Cache-Control": `max-age=${ok ? STALE_SECONDS : CACHE_SECONDS}`, "X-Fetched-At": String(Date.now()) } }));
      return body;
    };
    if (!url.searchParams.has("fresh")) {
      const hit = await cache.match(key);
      if (hit) {
        const age = Date.now() - (+hit.headers.get("X-Fetched-At") || 0);
        if (age > CACHE_SECONDS * 1000) ctx.waitUntil(refresh().catch(() => {}));
        return new Response(hit.body, { headers });
      }
    }
    return new Response(await refresh(), { headers });
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

// 읽은 글 연동: 같은 연동 코드를 쓰는 기기끼리 읽은 글 목록을 같이 쓴다
//   since=<번호> 를 붙이면 그 번호 뒤에 새로 들어온 주소만 돌려준다 (글 하나 누를 때마다 목록 전체를 받지 않게)
const READ_MAX = 3000;
async function reads(request, url, env, headers) {
  const k = url.searchParams.get("k") || "";
  if (!/^[a-z0-9]{6,40}$/.test(k)) return new Response(JSON.stringify({ error: "연동 코드가 이상해요" }), { status: 400, headers });
  const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
  const store = env.READS.get(env.READS.idFromName(k));
  let add = [];
  if (request.method === "POST") {
    try { add = ((await request.json()).add || []).filter(u => typeof u === "string" && u.length < 500).slice(0, 200); } catch {}
  }
  return new Response(JSON.stringify(await store.sync(add, since)), { headers: { ...headers, "Cache-Control": "no-store" } });
}

// 설정 연동: 같은 연동 코드를 쓰는 기기끼리 바로가기·게시판 편집과 숨길 단어를 같이 쓴다.
// 고친 시각(t)이 더 늦은 쪽이 이긴다.
async function prefs(request, url, env, headers) {
  const k = url.searchParams.get("k") || "";
  if (!/^[a-z0-9]{6,40}$/.test(k)) return new Response(JSON.stringify({ error: "연동 코드가 이상해요" }), { status: 400, headers });
  let put = null;
  if (request.method === "POST") {
    try {
      const text = await request.text();
      const b = text.length < 30000 ? JSON.parse(text) : null;
      if (b && typeof b.t === "number" && b.v && typeof b.v === "object") put = { t: b.t, v: b.v };
    } catch {}
  }
  const store = env.READS.get(env.READS.idFromName(k));
  return new Response(JSON.stringify((await store.prefs(put)) || {}), { headers: { ...headers, "Cache-Control": "no-store" } });
}

export class ReadStore extends DurableObject {
  async prefs(put) {
    const cur = await this.ctx.storage.get("prefs");
    if (put && !(cur && cur.t >= put.t)) { await this.ctx.storage.put("prefs", put); return put; }
    return cur || null;
  }

  // items: [[주소, 번호]...] 오래된 것부터. seq: 지금까지 붙인 마지막 번호
  async sync(add, since = 0) {
    let items = await this.ctx.storage.get("items"), seq = (await this.ctx.storage.get("seq")) || 0;
    if (!items) { // 예전 모양(주소 목록만)에서 옮기기
      items = ((await this.ctx.storage.get("urls")) || []).map(u => [u, ++seq]);
    }
    if (add.length) {
      const fresh = new Set(add);
      items = items.filter(([u]) => !fresh.has(u));
      for (const u of fresh) items.push([u, ++seq]);
      items = items.slice(-READ_MAX);
      await this.ctx.storage.put({ items, seq });
      await this.ctx.storage.delete("urls");
    }
    // 이 기기가 아는 번호가 서버보다 크면(코드를 다시 만든 경우 등) 처음부터 다 준다
    const from = since > seq ? 0 : since;
    return { urls: items.filter(([, n]) => n > from).map(([u]) => u), seq };
  }
}
