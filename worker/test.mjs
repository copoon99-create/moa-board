// 실제 게시판에서 파서가 동작하는지 확인 (GitHub Actions에서 실행)
import { collect } from "./boards.js";
const t0 = Date.now();
const d = await collect();
console.log("걸린 시간", Date.now() - t0, "ms");
let ok = 0;
for (const b of d.boards) {
  console.log(`${b.error ? "[실패]" : "[ok]"} ${b.name}: ${b.posts.length}개 ${b.error || ""}`);
  for (const p of b.posts.slice(0, 2)) console.log("    ", p.time, `[${p.comments}]`, p.author, "|", p.title.slice(0, 40), "|", p.url);
  if (b.posts.length) ok++;
}
if (ok < 4) process.exit(1);
