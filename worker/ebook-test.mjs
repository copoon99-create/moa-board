// 실제 전자도서관에서 검색이 되는지 확인 (GitHub Actions에서 실행)
import { LIBS, searchLib } from "./ebook.js";
let bad = 0;
for (const q of ["불편한 편의점", "없는책제목zzqx"]) {
  for (const lib of LIBS) {
    const r = await searchLib(lib, q);
    console.log(`${r.error ? "[실패]" : "[ok]"} ${lib.name} "${q}": ${r.count ?? "-"}건 ${r.error || ""}`);
    if (lib.id === "ggl" && q !== "없는책제목zzqx" && !(r.items || []).length) {
      bad++;
      console.log((await (await fetch(lib.url(q), { headers: { Referer: "https://ebook.library.kr/" } })).text()).slice(0, 2500));
    }
    for (const it of r.items || []) console.log("    ", it.title, "|", it.author, "|", it.status, "|", it.url);
    if (lib.id === "semas") {
      // 소상공인 도서관은 아직 확인 중: 결과와 상관없이 실패로 치지 않고 페이지 모양만 보여준다
      if (q !== "없는책제목zzqx") {
        const h = await (await fetch(lib.url(q))).text();
        for (const k of ['id="total"', 'class="tit"', "로그인", "<title>"]) { const i = h.indexOf(k); console.log("  ", k, i, i < 0 ? "" : h.slice(Math.max(0, i - 200), i + 400).replace(/\s+/g, " ")); }
      }
      continue;
    }
    if (r.error || (q === "불편한 편의점" && !r.count)) bad++;
  }
}
if (bad) process.exit(1);
