// 전자도서관 통합 검색. 도서관마다 검색 페이지를 읽어서 책이 있는지 알려준다.
//   searchLib(lib, q) -> { id, name, url(검색 결과 페이지), count, items: [{ title, author, url, stock, loan }] }
const UA = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const MAX_ITEMS = 5;

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
const pick = (s, re) => { const m = s.match(re); return m ? m[1] : ""; };
const num = s => { const m = String(s || "").replace(/,/g, "").match(/\d+/); return m ? +m[0] : 0; };
const abs = (base, href) => { try { return new URL(clean(href), base).href; } catch { return base; } };

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", Referer: new URL(url).origin + "/" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

const loanStatus = (stock, loan) => stock ? (loan < stock ? "대출 가능" : "모두 대출 중") + ` (보유 ${stock}, 대출 ${loan})` : "";

// 법무부 전자도서관 (YES24)
export function parseYes24(html, base) {
  const count = num(pick(html, /class="total"[^>]*>\s*전체\s*<em>([\d,]+)/));
  const items = html.split(/<div class="bx clearfix">/).slice(1).map(b => {
    const a = b.match(/<p class="tit">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) return null;
    const stock = num(pick(b, /보유\s*<strong>(\d+)/)), loan = num(pick(b, /대출\s*<strong>(\d+)/));
    return { title: clean(a[2]), author: clean(pick(b, /<p class="writer">([\s\S]*?)<\/p>/)), url: abs(base, a[1]),
      status: loanStatus(stock, loan) };
  }).filter(Boolean);
  return { count: count || items.length, items };
}

// 나라배움터 (교보 T3 모바일)
export function parseKyobo(html, base) {
  const count = num(pick(html, /총\s*<span>([\d,]+)<\/span>/));
  const items = [];
  const re = /hashRedirect\('([^']+)'\)[^>]*>\s*<h3 class="subject">([\s\S]*?)<\/h3>([\s\S]*?)(?=hashRedirect\('|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const rest = m[3];
    // 예: "대출현황 : 대출 3 권 / 보유10권 &nbsp&nbsp 예약현황 : 0권"
    const present = clean(pick(rest, /<p class="book_present">([\s\S]*?)<\/p>/).replace(/&nbsp;?/g, " "));
    const lm = present.match(/대출\s*(\d+)\s*권\s*\/\s*보유\s*(\d+)/);
    items.push({ title: clean(m[2]), author: clean(pick(rest, /<p class="author">([\s\S]*?)<\/p>/)), url: abs(base, m[1]),
      status: lm ? loanStatus(+lm[2], +lm[1]) : present });
  }
  return { count: count || items.length, items };
}

// 수원시 전자도서관 (교보 elibrary-front)
export function parseElibrary(html, base) {
  const count = num(pick(html, /name="total" id="total" value="(\d+)"/));
  const items = [];
  const re = /<li class="tit">\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/li>\s*<li class="writer">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) items.push({ title: clean(m[1]), author: clean(m[2].replace(/<span>/g, " | ")), url: base, status: "" });
  return { count: count || items.length, items };
}

// 경기도교육청 전자도서관
export function parseGoe(html, base) {
  const count = num(pick(html, /id="book_totalDataCount"[^>]*>([\d,]+)/));
  const items = [];
  const re = /data-book_idx="(\d+)" data-type="(\w+)" class="name goDetail">([\s\S]*?)<\/a>\s*<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const info = clean(m[4]);
    items.push({ title: clean(m[3]), author: [pick(info, /저자 : (.*?)\s*│/), pick(info, /출판사 : (.*?)\s*│/)].filter(Boolean).join(" | "),
      url: abs(base, `/elib/module/elib/book/view.do?menu_idx=94&type=${m[2]}&book_idx=${m[1]}`), status: "" });
  }
  return { count: count || items.length, items };
}

// 경기도서관 전자책 (ebook.library.kr). 화면은 자바스크립트로 그리고 아래 API에서 JSON을 받아온다.
export function parseGgl(text, base) {
  const j = JSON.parse(text);
  if (j.httpStatus && j.httpStatus !== "OK") throw new Error(j.message || "검색 실패");
  const d = j.data || {}, res = (d.contents && d.contents.result) || {};
  const items = (res.rows || []).map(r => r.fields || {}).map(f => ({
    title: f.TITLE || "", author: [f.AUTHOR, f.PUBLISHER].filter(Boolean).join(" | "),
    url: base, status: loanStatus(+f.COPYS || 0, +f.LOAN_CNT || 0),
  })).filter(it => it.title);
  return { count: +d.totalElements || +res.total_count || items.length, items };
}

export const LIBS = [
  {
    id: "moj", name: "법무부", home: "https://moj.yes24library.com/default.asp",
    url: q => "https://moj.yes24library.com/search/?srch_order=total&src_key=" + encodeURIComponent(q),
    parse: parseYes24,
  },
  {
    id: "suwon", name: "수원시", home: "https://ebook.suwonlib.go.kr/elibrary-front/",
    url: q => "https://ebook.suwonlib.go.kr/elibrary-front/search/searchList.ink?schClst=all&schDvsn=000&orderByKey=&schTxt=" + encodeURIComponent(q),
    parse: parseElibrary,
  },
  {
    id: "nhi", name: "나라배움터", home: "https://ebook-nhi.mlss.co.kr/Kyobo_T3_Mobile/Web/Main/Ebook_Main.asp",
    url: q => "https://ebook-nhi.mlss.co.kr/Kyobo_T3_Mobile/Web/Main/Ebook_List.asp?sortType=3&keyword=" + encodeURIComponent(q),
    parse: parseKyobo,
  },
  {
    id: "goe", name: "경기교육청", home: "https://lib.goe.go.kr/elib/index.do",
    url: q => "https://lib.goe.go.kr/elib/module/elib/search/index.do?menu_idx=94&viewPage=1&type=&com_code=&search_text=" + encodeURIComponent(q),
    parse: parseGoe,
  },
  {
    id: "ggl", name: "경기도서관", home: "https://ebook.library.kr/",
    page: q => "https://ebook.library.kr/search?keyword=" + encodeURIComponent(q),
    url: q => "https://ebook.library.kr/api/service/search-engine?contentType=EB&searchType=all&detailQuery=&isbn=&sort=relevance&asc=desc&loanable=false&owner=&withFacet=true&page=1&size=6&keyword="
      + encodeURIComponent(q.replace(/ /g, "")),
    parse: parseGgl,
  },
];

export async function searchLib(lib, q) {
  const url = lib.url(q), page = lib.page ? lib.page(q) : url;
  const out = { id: lib.id, name: lib.name, url: page };
  try {
    const r = lib.parse(await get(url), page);
    out.count = r.count;
    out.items = r.items.slice(0, MAX_ITEMS);
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}
