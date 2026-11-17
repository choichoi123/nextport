# 검색 결과 문구·파비콘 정비 계획

기준일: **2026-11-17 KST**. 사용자가 제공한 네이버·Google 검색 결과와 당시 공개 배포 응답을 대조한 조사·제안입니다. 아래 조사 이후 사용자가 로컬 구현을 승인했으며, 구현·검증 결과와 미반영 범위는 [현재 상태](../CURRENT_STATE.md#검색-설정-로컬-구현과-검증)에서 관리합니다. 이 계획서의 공개 배포 관찰을 로컬 변경의 배포 완료로 해석하지 않습니다.

## 확인한 사실과 판단

공개 기준 주소는 `https://nextport-roan.vercel.app`입니다. 실제 공개 HTTP 응답과 로컬 소스를 확인했고, 검색 서비스의 로그인된 관리 화면·마지막 수집일은 확인하지 않았습니다. 검색 결과 자체는 사용자 첨부 화면을 기준으로 판단했습니다.

| 대상 | 현재 배포에서 확인한 내용 | 판단 |
| --- | --- | --- |
| 한국어 홈 `/` | 200. 제목은 `최지훈 \| 사용자와 업무를 연결하는 웹 개발자`, 설명은 이동지원 앱·지도·관제 웹과 역할·기술 선택 소개 | 첨부 화면의 옛 소개와 다릅니다. 이전 수집본이 남았을 가능성이 높지만 마지막 수집일은 미확인입니다. |
| 영어 홈·한영 목록 | `/en`, `/projects`, `/en/projects` 모두 200. 언어별 최신 제목·설명, canonical·언어 대체 링크 제공 | 한영 메타가 옛 버전으로 돌아간 증거는 없습니다. |
| 홈·목록의 파비콘 선언 | 서버 HTML부터 B안 PNG를 한 개 선언. 배포 파일은 로컬과 바이트가 같습니다. | JavaScript 실행 후에만 새 파비콘이 생기는 구조가 아닙니다. |
| 기본 `/favicon.ico` | 200. **옛 CJH 이미지**이며 로컬 기본 ICO와 바이트가 같습니다. | 우리 서버에 실제 옛 브랜드가 남아 있습니다. 검색 캐시만의 문제로 단정할 수 없습니다. |
| OG | 딥그린 B JIHOON PNG, 1200×630, 200. 로컬과 바이트가 같습니다. | 현재 공유 이미지 자체는 최신입니다. |
| 이전 홈 `/archive` | 200, `noindex, nofollow`. 옛 소개·OG·기본 ICO 참조가 남음 | 보관 화면입니다. 현재 루트 홈에서 옛 문구가 노출되는 근거로 혼동하지 않습니다. |
| 수집 보조 설정 | `/robots.txt`, `/sitemap.xml`은 404. 홈에 `WebSite` JSON-LD 없음 | 보완 후보입니다. 부재만으로 이전 검색 결과의 원인이라고 판단하지 않습니다. |

한국어 루트 HTML에는 첨부 화면의 `최지훈 포트폴리오!!`, `주어진 일을 끝까지하는`, `자신의 본질` 문구가 없고, 보관 홈에는 남아 있습니다. 활성 화면과 보관본의 경로는 구분되어 있습니다.

현재 B 파비콘 원본은 **1254×1254, 990,980바이트**입니다. 크기 자체가 기준 미달은 아니지만 작은 아이콘 용도로 별도 축소·최적화할 여지가 있습니다. 기본 ICO는 **256×256의 옛 CJH 이미지**입니다.

## 검색 문구 제안

한국어 홈의 권장 조합은 다음과 같습니다. 추상적인 자기평가 대신 실제 다룬 서비스와 개인 기여를 소개합니다. 프로젝트 개수·기간처럼 Notion에서 바뀌는 값은 메타에 고정하지 않습니다.

| 항목 | 권장 문구 |
| --- | --- |
| 사이트명 | 최지훈 포트폴리오 |
| 대체 사이트명 | Jihoon Choi Portfolio, JIHOON |
| 한국어 홈 제목 | 최지훈 포트폴리오 \| 웹 개발자 |
| 한국어 홈 설명 | 교통약자 이동지원 앱과 지도·관제 웹을 개발한 최지훈의 포트폴리오입니다. WebSocket·API 연동과 업무 흐름 개선 사례, 직접 맡은 역할과 기술 선택을 소개합니다. |
| 영어 홈 제목 | Jihoon Choi Portfolio \| Web Developer |
| 영어 홈 설명 | Web projects for accessible mobility, maps, and dispatch. Explore Jihoon Choi's frontend contributions, WebSocket and API integration, and implementation decisions. |
| 한국어 목록 제목 | 전체 프로젝트 \| 웹 개발자 최지훈 |
| 한국어 목록 설명 | 이동지원 앱, 지도·관제 웹, 설계 도구와 기업 홈페이지 프로젝트를 살펴보세요. 프로젝트별 문제, 직접 맡은 역할과 구현 과정, 기술 선택을 정리했습니다. |
| 영어 목록 제목 | Projects \| Jihoon Choi, Web Developer |
| 영어 목록 설명 | Explore mobility apps, map and dispatch interfaces, design tools, and websites, with each project's challenges, Jihoon Choi's role, and implementation decisions. |

홈 제목은 이름·포트폴리오·직무를 우선하고, 상세 경험은 설명에 배치합니다. 같은 페이지의 title·description과 OG·Twitter 문구를 일치시킵니다. 현재 홈의 주요 소개와 표현을 맞추되 검색 문구 변경을 전체 화면 재설계로 확대하지 않습니다.

Google의 작은 `Vercel` 표시는 페이지 제목 위의 **사이트명 영역**으로 보입니다. 현재 `og:site_name`은 이미 개인 이름이지만, 홈의 `WebSite` 구조화 데이터가 없습니다. 기본 사이트명을 `최지훈 포트폴리오`로 제안하고 영어 이름을 대체 이름에 넣어 보완합니다. 도메인 하나에 사이트명 하나를 지원하므로 `/en`에서 별개의 사이트명이 선택된다고 약속하지 않습니다. Vercel 프로젝트 이름이 직접 원인인지는 확인되지 않았습니다.

## 구현 우선순위와 변경 범위

| 순서 | 계획 | 예상 변경 대상 |
| --- | --- | --- |
| 1 | B안 모양을 유지한 작은 정사각 PNG와 다중 크기 ICO를 준비하고 기본 `/favicon.ico`도 같은 브랜드로 맞춤 | `public/favicon.ico`, `public/images/brand/` |
| 1 | 아이콘 링크를 절대 URL·명시적 크기로 정리. 같은 rel 중복 없이 서버 HTML부터 제공 | `components/portfolio/portfolio-brand.js`, `config/portfolio-brand.js` |
| 1 | 위 한영 문구와 홈의 `WebSite` JSON-LD를 반영. 실제 도메인·사이트명·대체 이름만 사용 | `lib/portfolio-messages.mjs`, `components/portfolio/portfolio-shell.js`, 필요 시 기존 도메인 설정 |
| 2 | 공개 사이트의 한영 홈·목록 4개를 담은 sitemap과 수집 가능한 robots 제공 | `public/robots.txt`, `public/sitemap.xml` 또는 기존 Pages Router의 최소 경로 구현 |
| 2 | 보관 홈의 검색 제외를 유지하고 아이콘은 새 공통 브랜드와 통일. `/about-me`·`/gallery`의 검색 대상 유지 여부는 별도 정리 | `pages/archive.js`, 필요 시 기존 보조 페이지 |
| 3 | 배포 검증 후 Google URL 검사·색인 생성 요청, 네이버 웹페이지 수집 요청과 sitemap 등록 확인 | 각 서비스의 소유권 확인된 관리 화면 |

아이콘은 예를 들어 PNG 96·192px과 ICO 16·32·48·256px을 준비할 수 있습니다. 이는 구현 제안이며 검색엔진이 해당 크기 조합을 의무로 요구한다는 뜻은 아닙니다. 원본 이미지와 A·C안 전환 기능을 보존하고, `activeBrand` 변경 시 기본 ICO도 같은 안으로 내보내도록 연결합니다. 검색용 아이콘 URL을 매번 날짜·쿼리로 바꾸지는 않습니다.

robots 파일을 갱신 명령으로 사용하지 않습니다. 보관·미리보기의 `noindex`를 검색엔진이 읽을 수 있도록 해당 HTML 수집 자체를 무조건 막지 않습니다. sitemap에는 관리용 Notion URL·ID, 비공개 표준 맵 상세, 미리보기·보관 화면·검색 필터 조합을 넣지 않습니다. 기존 Notion 연동·프로젝트 내용·공개 범위는 변경하지 않습니다.

## 확인 방법과 완료 기준

1. 로컬에서 한영 홈·목록의 원본 HTML을 검사하여 title·description·canonical·언어 링크·아이콘·JSON-LD를 대조합니다. 아이콘과 OG는 HTTP 상태·형식·크기·실제 모양을 확인합니다.
2. 로컬 브라우저의 데스크톱·모바일, 라이트·다크에서 로고·파비콘과 한영 이동을 확인합니다. 관련 코드 검사와 빌드를 수행하되 Notion 미설정으로 빈 목록인 상태와 실제 DB 연동 성공을 구분합니다.
3. 승인된 배포 후 공개 응답에서도 같은 메타·아이콘·OG·sitemap·robots를 재확인합니다. 기존 Notion 조회와 카드·상세 링크를 별도로 검사합니다.
4. 검색 서비스 관리 화면에서는 마지막 수집일·수집 HTML·아이콘 수집 가능 여부를 확인합니다. 요청 접수, 실제 재수집, 검색 결과 표시 변경을 서로 다른 완료 단계로 기록합니다.

검색 제목·소개는 검색어와 본문에 따라 엔진이 다시 작성할 수 있습니다. 수정 문구가 정확히 그대로 표시되거나 특정 날짜에 갱신된다고 보장하지 않습니다. Google은 재수집에 수일~수주, 네이버도 수집 요청 후 최소 1일~수주가 걸릴 수 있다고 안내합니다. 같은 URL 반복 요청으로 즉시 갱신시키려 하지 않습니다.

## 공식 근거

- [Google 파비콘 기준](https://developers.google.com/search/docs/appearance/favicon-in-search): 정사각 최소 8px, 48px보다 큰 크기 권장. 수집 허용·안정된 URL·대기 필요.
- [네이버 파비콘 기준](https://searchadvisor.naver.com/guide/markup-favicon): 정사각 최소 16px·32px 이상 권장, 절대 href, 같은 rel 한 개 권장. 선언과 기본 ICO의 우선순위 및 문서와 별도 수집 안내.
- [Google 사이트명](https://developers.google.com/search/docs/appearance/site-names): 홈페이지 `WebSite` 데이터와 일관된 사이트명이 주요 신호. 도메인·하위 도메인당 사이트명 하나.
- [Google 제목](https://developers.google.com/search/docs/appearance/title-link), [소개](https://developers.google.com/search/docs/appearance/snippet), [네이버 제목·설명 갱신](https://searchadvisor.naver.com/guide/faq-serpedit): 메타와 본문 등을 자동 분석하여 표시.
- [Google 재수집](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [네이버 수집 요청](https://searchadvisor.naver.com/guide/request-crawl): 즉시 처리·검색 반영 비보장, 불필요한 반복 요청 지양.

## 최초 조사 시점의 경계

조사 결과와 계획만 작성했습니다. 제품 코드·이미지·Notion·환경변수·검색엔진 설정을 변경하지 않았고 commit·push·배포·재수집 요청도 실행하지 않았습니다. 새 브라우저 탭을 만들거나 기존 탭·창을 종료하지 않았습니다. 현재 확인은 공개 HTTP·파일 대조이며 사용자 브라우저에서 새 검색 결과가 갱신된 것을 확인한 검증은 아닙니다.
