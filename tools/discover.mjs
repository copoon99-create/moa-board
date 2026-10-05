// 전자도서관 검색 주소를 찾기 위한 임시 조사 스크립트 (GitHub Actions에서 실행)
const UA = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const urls = (process.env.URLS || "").split(/\s+/).filter(Boolean);
for (const u of urls) {
  console.log("\n==========", u);
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" }, redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());
    let html = buf.toString("utf8");
    if (/charset=["']?(euc-kr|ks_c_5601)/i.test(html)) html = new TextDecoder("euc-kr").decode(buf);
    console.log("status", r.status, "final", r.url, "len", html.length);
    for (const f of html.match(/<form[\s\S]*?<\/form>/gi) || []) console.log("FORM:", f.replace(/\s+/g, " ").slice(0, 700));
    const links = [...new Set((html.match(/(?:href|action|src)=["'][^"']*(?:[Ss]earch|srch|Srch|ebook|Ebook|SEARCH)[^"']*["']/g) || []))];
    console.log("LINKS:", links.slice(0, 40).join("\n  "));
    for (const q of (process.env.NEEDLE || "").split("|").filter(Boolean)) { let i = html.indexOf(q), n = 0; while (i >= 0 && n < 4) { console.log("NEEDLE[" + q + "]@", i, html.slice(Math.max(0, i - 250), i + 350).replace(/\s+/g, " ")); i = html.indexOf(q, i + 1); n++; } }
    if (process.env.DUMP) console.log("BODY:", html.replace(/\s+/g, " ").slice(0, +process.env.DUMP));
  } catch (e) { console.log("ERR", e.message); }
}
