const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const u = "https://mlbpark.donga.com/mp/b.php?b=bullpen&id=202610050119183988&m=view";
const r = await fetch(u, { headers: { "User-Agent": UA } }); const h = await r.text();
console.log(r.status, h.length);
for (const m of h.matchAll(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/g)) console.log(m.index, JSON.stringify(h.slice(m.index - 200, m.index + 40)));
