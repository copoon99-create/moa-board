const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const u = "https://mlbpark.donga.com/mp/b.php?b=bullpen&id=202610050119183988&m=view";
const r = await fetch(u, { headers: { "User-Agent": UA } }); const h = (await r.text()).slice(0, 68000);
for (const m of h.matchAll(/\d{4}[.\-/]\d{2}[.\-/]\d{2}[^<]{0,12}/g)) console.log(m.index, JSON.stringify(h.slice(m.index - 150, m.index + 40)));
const t = h.indexOf("이건희"); console.log("title at", t, JSON.stringify(h.slice(t, t + 1500)));
const r2 = await fetch(u, { headers: { "User-Agent": UA, Range: "bytes=0-30000" } }); console.log("range", r2.status, (await r2.text()).length);
