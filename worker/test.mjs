// 실제 게시판에서 파서가 동작하는지 확인 (GitHub Actions에서 실행)
import { collect } from "./boards.js";
const d = await collect();
let ok = 0;
for (const b of d.boards) {
  console.log(`${b.error ? "[실패]" : "[ok]"} ${b.name}: ${b.posts.length}개 ${b.error || ""}`);
  for (const p of b.posts.slice(0, 2)) console.log("    ", p.time, `[${p.comments}]`, p.author, "|", p.title.slice(0, 40), "|", p.url);
  if (b.posts.length) ok++;
}
if (d.boards.some(b => b.id === "mlb-bullpen" && !b.posts.length)) {
  const html = await (await fetch("https://mlbpark.donga.com/mp/b.php?b=bullpen&m=list", { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36" } })).text();
  const i = html.indexOf("tbl_type01");
  console.log("엠팍 HTML 길이", html.length, "표 위치", i);
  console.log(html.slice(Math.max(0, i - 200), i + 2500));
}
if (ok < 4) process.exit(1);
