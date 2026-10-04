// 게시판 목록과 파서. Cloudflare Worker(worker/index.js)와 시험 스크립트(worker/test.mjs)가 같이 쓴다.
export const BOARDS = [
  { id: "fm-realestate", name: "부동산", kind: "fmkorea", key: "realestate", url: "https://m.fmkorea.com/realestate" },
  { id: "dc-marvelsnap", name: "마블 스냅 갤러리", kind: "dc", key: "marvelsnap", url: "https://m.dcinside.com/board/marvelsnap" },
  { id: "dc-bh", name: "보호직 갤러리", kind: "dc", key: "bh", url: "https://m.dcinside.com/board/bh" },
  { id: "dc-thesingularity", name: "특이점이 온다 갤러리", kind: "dc", key: "thesingularity", url: "https://m.dcinside.com/board/thesingularity" },
  { id: "mlb-bullpen", name: "불펜", kind: "mlbpark", key: "bullpen", url: "https://mlbpark.donga.com/mp/b.php?b=bullpen" },
  { id: "dc-ai_utilize", name: "AI 활용 갤러리", kind: "dc", key: "ai_utilize", url: "https://m.dcinside.com/board/ai_utilize" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MAX_POSTS = 30;

async function get(url, referer) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...(referer ? { Referer: referer } : {}) } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function clean(html) {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (ENT[e] !== undefined) return ENT[e];
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return m;
    })
    .replace(/\s+/g, " ").trim();
}
const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : ""; };
const pick = (s, re) => { const m = s.match(re); return m ? m[1] : ""; };
const num = s => { const m = String(s || "").match(/\d+/); return m ? +m[0] : 0; };

// 한국 시각 문자열 -> ISO. '2026-10-04 12:30:11', '2026.10.04', '12:30', '10.04'
export function parseTime(s, now = new Date()) {
  s = (s || "").trim();
  const kst = new Date(now.getTime() + 9 * 3600e3); // KST 벽시계를 UTC 필드로
  const iso = (y, mo, d, h = 0, mi = 0, se = 0) =>
    `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}+09:00`;
  let m;
  if ((m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return iso(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if ((m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2})$/))) return iso(2000 + +m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) {
    let t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), +m[1], +m[2], +(m[3] || 0));
    if (t > kst.getTime() + 300e3) t -= 86400e3;
    const d = new Date(t);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  if ((m = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/))) {
    let y = kst.getUTCFullYear();
    if (Date.UTC(y, +m[1] - 1, +m[2]) > kst.getTime()) y--;
    return iso(y, +m[1], +m[2]);
  }
  return "";
}

const rows = (html, startRe) => html.split(startRe).slice(1).map(r => r.split("</tr>")[0]);

export function parseDc(html, key) {
  const posts = [];
  for (const tr of rows(html, /<tr\s+class="ub-content/)) {
    const head = tr.slice(0, tr.indexOf(">"));
    const no = clean(pick(tr, /<td class="gall_num"[^>]*>([\s\S]*?)<\/td>/));
    const subj = clean(pick(tr, /<td class="gall_subject"[^>]*>([\s\S]*?)<\/td>/));
    if (!/^\d+$/.test(no) || /notice/.test(attr(head, "data-type")) || /icon_notice/.test(tr) || ["공지", "설문", "AD"].includes(subj)) continue;
    const tit = pick(tr, /<td class="gall_tit[^"]*"[^>]*>([\s\S]*?)<\/td>/);
    const a = tit.match(/<a\b[^>]*href="[^"]*no=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = clean(a[1].replace(/<em[\s\S]*?<\/em>/g, "").replace(/<span class="reply_num">[\s\S]*?<\/span>/g, ""));
    const wTag = pick(tr, /(<td class="gall_writer[^>]*>)/);
    const dTag = pick(tr, /(<td class="gall_date[^>]*>)/);
    posts.push({
      title,
      url: `https://m.dcinside.com/board/${key}/${no}`,
      author: clean(attr(wTag, "data-nick")),
      time: parseTime(attr(dTag, "title") || clean(pick(tr, /<td class="gall_date[^>]*>([\s\S]*?)<\/td>/))),
      comments: num(pick(tr, /<span class="reply_num">([\s\S]*?)<\/span>/)),
    });
  }
  return posts;
}

async function dc(b) {
  for (const base of ["https://gall.dcinside.com/mgallery/board/lists/", "https://gall.dcinside.com/board/lists/", "https://gall.dcinside.com/mini/board/lists/"]) {
    let html;
    try { html = await get(base + "?id=" + encodeURIComponent(b.key)); } catch (e) { continue; }
    const posts = parseDc(html, b.key);
    if (posts.length) return posts;
  }
  throw new Error("디시 목록을 찾지 못함");
}

export function parseMlbpark(html) {
  const posts = [];
  const body = html.split(/<table[^>]*class="tbl_type01"/)[1] || "";
  for (const tr of rows(body, /<tr[\s>]/)) {
    const first = clean(pick(tr, /<td[^>]*>([\s\S]*?)<\/td>/));
    if (!/^\d+$/.test(first)) continue;
    const aTag = pick(tr, /(<a\b[^>]*class="txt"[^>]*>)/);
    if (!aTag) continue;
    const href = attr(aTag, "href").replace(/&amp;/g, "&");
    posts.push({
      title: clean(attr(aTag, "alt")) || clean(pick(tr, /<a\b[^>]*class="txt"[^>]*>([\s\S]*?)<\/a>/)),
      url: new URL(href, "https://mlbpark.donga.com/").href,
      author: clean(pick(tr, /<span class="nick"[^>]*>([\s\S]*?)<\/span>/)),
      time: parseTime(clean(pick(tr, /<span class="date"[^>]*>([\s\S]*?)<\/span>/))),
      comments: num(pick(tr, /<span class="replycnt"[^>]*>([\s\S]*?)<\/span>/)),
    });
  }
  return posts;
}

async function mlbpark(b) {
  const posts = parseMlbpark(await get(`https://mlbpark.donga.com/mp/b.php?b=${b.key}&m=list`));
  if (!posts.length) throw new Error("엠팍 목록을 찾지 못함");
  return posts;
}

export function parseFmkorea(html) {
  const posts = [];
  const body = html.split(/<table[^>]*class="bd_lst/)[1] || "";
  for (const tr of rows(body, /<tr\b/)) {
    if (/^[^>]*class="[^"]*notice/.test(tr)) continue;
    const td = pick(tr, /<td class="title[^"]*"[^>]*>([\s\S]*?)<\/td>/);
    const a = td.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    posts.push({
      title: clean(a[2]),
      url: new URL(a[1].replace(/&amp;/g, "&"), "https://m.fmkorea.com/").href,
      author: clean(pick(tr, /<td class="author"[^>]*>([\s\S]*?)<\/td>/)),
      time: parseTime(clean(pick(tr, /<td class="time"[^>]*>([\s\S]*?)<\/td>/))),
      comments: num(pick(td, /class="replyNum"[^>]*>([\s\S]*?)<\/a>/)),
    });
  }
  return posts;
}

async function fmkorea(b) {
  const posts = parseFmkorea(await get(`https://www.fmkorea.com/index.php?mid=${b.key}`, "https://www.fmkorea.com/"));
  if (!posts.length) throw new Error("펨코 목록을 찾지 못함");
  return posts;
}

const PARSERS = { dc, mlbpark, fmkorea };

// 모든 게시판을 동시에 읽는다. 실패한 게시판은 error만 채워서 돌려준다.
export async function collect() {
  const updatedAt = new Date().toISOString();
  const boards = await Promise.all(BOARDS.map(async b => {
    const entry = { id: b.id, name: b.name, url: b.url, updatedAt };
    try {
      entry.posts = (await PARSERS[b.kind](b)).filter(p => p.title).slice(0, MAX_POSTS);
    } catch (e) {
      entry.posts = [];
      entry.error = String(e.message || e).slice(0, 200);
    }
    return entry;
  }));
  return { updatedAt, boards };
}
