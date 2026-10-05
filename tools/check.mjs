// 여러 책 제목을 전자도서관 6곳에서 한 번에 찾아보는 확인용 스크립트 (GitHub Actions "전자책 확인"에서 실행)
import { LIBS, searchLib } from "../worker/ebook.js";
const titles = (process.env.TITLES || "").split("|").map(s => s.trim()).filter(Boolean);
for (const q of titles) {
  const rs = await Promise.all(LIBS.map(l => searchLib(l, q)));
  const line = rs.map(r => `${r.name}:${r.error ? "?" : r.count}`).join(" ");
  console.log(`## ${q} => ${line}`);
  for (const r of rs) for (const it of (r.items || []).slice(0, 2)) console.log(`   ${r.name} | ${it.title} | ${it.author} | ${it.status}`);
}
