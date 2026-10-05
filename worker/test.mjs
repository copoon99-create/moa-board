// 실제 게시판에서 파서가 동작하는지 확인 (GitHub Actions에서 실행)
import { collect, HOT } from "./boards.js";
const t0 = Date.now();
const d = await collect();
console.log("걸린 시간", Date.now() - t0, "ms");
let ok = 0;
for (const b of d.boards) {
  console.log(`${b.error ? "[실패]" : "[ok]"} ${b.name}: ${b.posts.length}개 ${b.error || ""}`);
  for (const p of b.posts.slice(0, 2)) console.log("    ", p.time, `[${p.comments}]`, p.author, "|", p.title.slice(0, 40), "|", p.url);
  if (b.posts.length) ok++;
}
// 인기글
const h = await collect(HOT);
for (const b of h.boards) {
  console.log(`${b.error ? "[실패]" : "[ok]"} ${b.name}: ${b.posts.length}개 ${b.error || ""}`);
  for (const p of b.posts.slice(0, 2)) console.log("    ", p.time, `[${p.comments}]`, p.author, "|", p.title.slice(0, 40), "|", p.url);
}
if (h.boards.filter(b => b.posts.length).length < HOT.length - 1) { console.log("인기글 실패가 많음"); process.exitCode = 1; }
// 디시 모바일 길도 따로 시험
import("./boards.js").then(async m => {
  try {
    const p = await m.dcForTest({ key: "bh" }, { mobileOnly: true });
    console.log("[디시 모바일] 보호직", p.length + "개");
    for (const x of p.slice(0, 3)) console.log("    ", x.time, `[${x.comments}]`, x.author, "|", x.title.slice(0, 40), "|", x.url);
  } catch (e) {
    console.log("[디시 모바일 실패]", e.message);
    const html = await (await fetch("https://m.dcinside.com/board/bh", { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36" } })).text();
    const i = html.indexOf("gall-detail-lst");
    console.log("모바일 HTML", html.length, i); console.log(html.slice(i, i + 2500));
  }
  if (ok < 4) process.exit(1);
});
