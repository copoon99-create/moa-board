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
    if (r.error || (q === "불편한 편의점" && !r.count)) bad++;
  }
}
if (bad) process.exit(1);
