const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MUA = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
async function get(u, ua = UA) { const r = await fetch(u, { headers: { "User-Agent": ua, "Accept-Language": "ko-KR" } }); return [r.status, await r.text()]; }
const [s, html] = await get("https://mlbpark.donga.com/mp/b.php?b=bullpen&m=list");
console.log("bullpen", s, html.length);
const links = new Set([...html.matchAll(/href=["']([^"']*(?:best|hot|like|view|rank|pop)[^"']*)["'][^>]*>([\s\S]{0,80}?)</gi)].map(m => m[1] + " :: " + m[2].replace(/<[^>]*>/g, "").trim()));
for (const l of links) console.log("  ", l);
for (const u of ["https://mlbpark.donga.com/mp/best.php?b=bullpen&m=like", "https://mlbpark.donga.com/mp/best.php?b=bullpen&m=view", "https://mlbpark.donga.com/mp/best.php?b=bullpen&m=reply", "https://mlbpark.donga.com/mp/best.php?b=bullpen"]) {
  const [st, h] = await get(u); const i = h.indexOf("tbl_type01");
  console.log("\n==", u, st, h.length, i); if (i > 0) console.log(h.slice(i, i + 2500));
}
for (const [u, ua] of [["https://gall.dcinside.com/mgallery/board/lists/?id=bh&exception_mode=recommend", UA], ["https://m.dcinside.com/board/bh?recommend=1", MUA]]) {
  const [st, h] = await get(u, ua);
  console.log("\n==", u, st, h.length, "ub-content", h.indexOf("ub-content"), "gall-detail-lst", h.indexOf("gall-detail-lst"));
}
