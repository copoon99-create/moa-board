# 모아게시판

자주 보는 게시판 6곳의 최근 글을 한 화면에 모아 보는 페이지.

- `scrape.py`: 게시판 목록을 긁어 `posts.json` 에 저장. 게시판을 바꾸려면 파일 위쪽 `BOARDS` 를 고친다.
- `.github/workflows/scrape.yml`: 30분마다 `scrape.py` 를 실행하고 결과를 커밋.
- `index.html`: GitHub Pages 로 공개되는 페이지. `posts.json` 을 읽어 시간순으로 보여준다.
