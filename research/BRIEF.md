# 성 이슈트반 대성당 실사 재현: 공통 작업 지침

## 목표
부다페스트 성 이슈트반 대성당(Szent István-bazilika) 내부를 three.js로 **실제 건물처럼** 재현한다.
사진을 평면에 그냥 붙이는 것은 실패다. 사진은 (1) 형태와 비례의 근거, (2) 원근을 바로잡거나 곡면에 맞춰 편 텍스처의 원천으로 쓴다.
결과물은 실제 성당 안에 서 있는 것처럼 자연스러워야 한다: 이음매 없음, 왜곡 없음, 밝기와 색온도가 서로 맞음, 사진 속 사람이나 관광객 흔적 없음.

## 자료
- 위키미디어 공용 메타데이터: `<작업 폴더>/research/commons.json` (저장소에는 포함하지 않음)
  - `files[제목] = {w, h, url, mime, lic, artist, desc, cats}` (url 뒤의 `?utm_...` 쿼리는 잘라서 쓸 것)
- 썸네일(330px): `.../scratchpad/research/thumbs/` , 이름→제목 대응: `thumbs/index.json`
- 콘택트 시트: `.../scratchpad/research/sheet_<dome|interior|other>_<n>.jpg` (각 칸 아래 썸네일 이름이 적혀 있음)
- 원본 내려받기 캐시(공유): `.../scratchpad/research/full/` 파일명은 원본 URL의 마지막 경로 그대로. 받기 전에 이미 있는지 확인.
- 원본 대신 큰 썸네일이 필요하면 `https://upload.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<파일>/<폭>px-<파일>` (예: 1280, 2560)
- **요청 예절(중요)**: 위키미디어는 몰아서 요청하면 429를 준다. 다운로드는 한 번에 하나씩, 요청 사이 최소 1.5초, 429면 `Retry-After`만큼 기다렸다 재시도. User-Agent: `szent-istvan-tour/0.1 (personal local three.js project)`. 다른 에이전트도 동시에 받고 있으니 꼭 필요한 파일만 받는다.
- 웹 검색으로 치수나 사실을 확인해도 좋다(확인한 출처는 기록).

## 라이선스
- 쓸 수 있는 것: CC0, Public domain, CC BY, CC BY-SA(버전 무관). GPL 등 그 밖의 라이선스는 쓰지 않는다.
- 사용한 사진은 모두 `public/real/credits/<에이전트이름>.json`에 기록:
  `[{ "title": "File:...", "author": "...", "license": "...", "url": "https://commons.wikimedia.org/wiki/File:...", "usedFor": "..." }]`

## 좌표계와 단위 (모든 결과물 공통)
- 단위 m, y 위쪽. 교차부(돔 바로 아래) 바닥 중심이 원점 (0,0,0).
- 정문(서쪽)이 +z, 주 제단(동쪽)이 -z. 제단을 바라볼 때 오른쪽(남쪽)이 +x.
- 방위각 φ = atan2(dx, -dz): φ=0이 제단 쪽(-z), φ=90°가 +x(남).

## 결과물 위치
- 텍스처: `public/real/<영역>/...` (sRGB JPEG 품질 88 전후, 알파가 필요하면 PNG, 한 변 최대 4096, 보통 2048 이하)
- three.js 모듈: `src/real/<이름>.js`, 형태: `export default async function build(THREE, { base }) { ...; return group; }`
  - `base`는 `/real/` (텍스처 경로 접두사). 원점은 바닥 접점 중심, 정면이 +z, 단위 m.
  - three 0.187. 외부 import는 `three`와 `three/addons/...`만. 모듈 하나 삼각형 30만 개 이하.
- 각자 `research/notes/<에이전트이름>.md`에 무엇을 했는지, 추정 치수와 근거, 남은 한계를 적는다.
- **자기 범위 밖의 파일은 수정하지 않는다.** 개발 서버는 이미 http://127.0.0.1:5180 에서 돌고 있으니 새로 띄우지 않는다.

## 도구
- Python3: PIL 11, numpy 2, scipy 1.13 (OpenCV 없음). 원근 보정은 PIL `Image.transform(..., Image.PERSPECTIVE, coeffs)`나 numpy 호모그래피 + `scipy.ndimage.map_coordinates`.
- 이미지 확인: Read 도구로 PNG/JPG를 직접 보면 된다. 좌표를 잡을 때는 격자나 점을 그려 넣은 확인용 이미지를 만들어 보면서 맞춘다.
- 모듈 미리보기: `http://127.0.0.1:5180/harness.html?m=<모듈이름>&az=30&el=10&dist=1.4`
- 미리보기 스크린샷: `node <작업 폴더>/harness-shot.mjs <모듈이름> <출력폴더> 0,10,1.4 35,15,1.4` (Playwright로 harness.html을 찍는 보조 스크립트, 저장소에는 포함하지 않음)
  (헤드리스 Chrome + GPU, 콘솔 에러도 출력)

## 품질 기준
- 참고 사진과 같은 각도에서 렌더한 결과를 나란히 놓고 비교해, 비례와 색이 어긋나면 고친다.
- 사진의 그림자, 하이라이트, 비네팅이 텍스처에 남아 반복 무늬로 드러나면 안 된다. 타일 텍스처는 이음매가 보이지 않게 만든다.
- 밝기 기준: 크림색 벽 평균이 sRGB 175 전후, 금박은 채도 높은 황금색(평균 R≈200 G≈160 B≈80 근처). 서로 다른 사진에서 온 텍스처의 화이트밸런스를 맞춘다.
