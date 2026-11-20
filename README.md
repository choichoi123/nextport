# nextport

Next.js Pages Router로 만든 개인 포트폴리오입니다. 개발자 소개와 대표 프로젝트를 보여 주는 홈, 검색·분야 필터가 있는 전체 프로젝트 목록, 다크 모드와 Notion 연동을 제공합니다. 기존 홈과 Lottie 애니메이션은 `/archive`에 보관합니다.

## 문서 안내

| 문서 | 역할 |
| --- | --- |
| [작업 규칙](AGENTS.md) | 작업 범위·콘텐츠 원칙·브라우저 접근·검증 기준 |
| [Notion·콘텐츠 기준](docs/NOTION.md) | 운영 DB 출처·연결 설정·필드·소개 양식·변경 절차 |
| [Vercel에서 개인 Notion DB로 전환](docs/VERCEL_NOTION_MIGRATION.md) | 다른 컴퓨터에서 Git·읽기 권한·환경변수 설정, 새 배포·검증·복구를 진행하는 절차 |
| [프로젝트 자료 전달 가이드](docs/PORTFOLIO_HANDOFF_GUIDE.md) | 다른 프로젝트 담당 AI에게 줄 요청문·공개 초안·기술 근거·이미지 전달 템플릿 |
| [현재 상태](docs/CURRENT_STATE.md) | 구현·검증·공개 배포·미확인 사항과 다음 작업 |
| [의존성 보안 수정](docs/DEPENDENCY_SECURITY_PLAN.md) | 치명적 경고의 수정 근거·버전 선택·검증 범위 |
| [화면과 미리보기](docs/PREVIEW.md) | 메인·전체 목록·이전 홈·예시의 경로와 데이터 구분 |
| [검색 결과 정비 계획](docs/drafts/SEARCH_APPEARANCE_REFRESH_PLAN.md) | 검색 문구·사이트명·파비콘·sitemap·robots의 기준과 후속 검증 |
| [100m TOP10 DB 계획](docs/drafts/SPRINT_LEADERBOARD_DB_PLAN.md) | Neon 선택·저장 항목·순위 정책과 단계별 연결 계획 |

## 기술 구성

- Next.js 16.4.6 / React 18.2.0 / JavaScript / Tailwind CSS 3.4.19
- Node.js 22.13 이상인 22계열, npm (`.nvmrc`와 `package.json` 기준)
- 기존 번들링 동작을 유지하도록 개발·빌드는 Webpack을 명시합니다. lint는 ESLint 10과 Next 플러그인을 사용합니다.
- 프로젝트 콘텐츠는 Notion API로 조회하며 빌드 시 생성 및 ISR을 사용합니다.
- 놀이터의 온라인 100m 기록은 별도 Neon PostgreSQL과 게임 전용 서버 API를 사용합니다. 미설정이면 로컬 경기·리플레이를 유지하며 [연결 기준](docs/PREVIEW.md#온라인-top10과-neon-연결)을 따릅니다.
- 한국어를 기본으로 `/en`·`/en/projects` 영어 화면과 헤더 언어 전환을 제공합니다. [번역 범위와 관리 방법](docs/PREVIEW.md#한국어와-english)을 참고합니다.
- 현재 로컬 코드와 공개 배포본의 확인 수준은 현재 상태 문서에서 구분합니다.

## 로컬 실행

저장소 루트에서 실행합니다.

```powershell
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인합니다. 기본 운영 방식은 로컬 Notion 환경변수를 비워 두는 것입니다. 이 상태에서도 홈과 전체 목록을 실행할 수 있으며 실제 프로젝트 목록은 비어 있습니다. 예시 3개는 `/preview`에서만 표시합니다. 현재 실데이터 로컬 실행 위치와 공개 배포 여부는 [현재 상태](docs/CURRENT_STATE.md)를 따릅니다.

다른 앱이 포트를 사용 중이라면 소유자를 확인하고 기존 서버를 보존합니다. 비어 있는 다른 포트를 지정할 수 있습니다.

```powershell
npm run dev -- -p 3001
```

이 예시의 주소는 [http://localhost:3001](http://localhost:3001)입니다.

## 빌드와 검증

다음 순서로 검사합니다. 기존 서버와 설치 모듈을 보존해야 하면 환경 파일을 복사하지 않은 별도 설치 사본에서 검증합니다. 의존성을 변경한 뒤에는 해당 사본에서 `npm ci`로 lock과 설치 버전을 맞춥니다.

```powershell
npm run lint
npm test
npm run build
npm start
```

프로덕션 서버도 다른 포트를 지정할 수 있습니다.

```powershell
npm start -- -p 3001
```

Next 16의 빌드는 lint를 자동 실행하지 않으므로 별도로 검사합니다. `npm test`는 모의 응답을 사용하는 Notion 조회와 달리기 규칙·렌더링·서버 API 등을 검사합니다. 실제 인증된 Notion 조회·Neon 접속·브라우저 조작·공개 배포 검증은 별도로 확인합니다. 화면 확인 도구와 대체 순서는 작업 규칙의 브라우저 접근 절차를 따릅니다.

## Notion 운영

프로젝트 내용은 확인된 Notion DB에서 관리하고 실제 연결 값은 배포 서버 환경변수에서 관리합니다. 로컬에서 실데이터 조회가 필요할 때만 선택적으로 설정합니다. 원본 DB 주소, 환경변수, 연결 권한, 필드 구조와 콘텐츠 반영 절차는 [Notion·콘텐츠 기준](docs/NOTION.md)에 모았습니다.

## 놀이터 온라인 기록

100m 온라인 TOP10은 **Notion과 분리된 Neon PostgreSQL**에 저장합니다. 비로그인 이용자의 익명 쿠키로 경기 시도를 발급하고, 완주 시 서버가 해당 규칙의 유효 입력 이력으로 기록을 재계산합니다. 검증과 잠정 TOP10 진입을 통과한 뒤 **등록 / Register**를 한 번 누르면 DB 트랜잭션에서 최신 순위와 해당 브라우저의 기존 최고를 다시 확인해 저장합니다. 자동 시연·리플레이는 등록 대상이 아닙니다. 현재 `sprint-v2`는 별도 순위표를 사용하며 기존 v1 기록은 보존합니다. 기존 DB를 사용할 때는 [v2 보드 추가 절차](docs/PREVIEW.md#온라인-top10과-neon-연결)를 확인합니다.

- 공개 순위에는 이름·닉네임, 국적, 0.01초 기록, 서버 등록일시와 순위만 제공합니다. 첫 기록·역대 최고 갱신·동점은 서버가 확정하며, 게임 안의 가상 경쟁 순위와 구분합니다.
- 서버 전용 `PLAYGROUND_LEADERBOARD_ENABLED`, `PLAYGROUND_DATABASE_URL`, `PLAYGROUND_SIGNING_SECRET`을 사용합니다. 연결 문자열은 DB 소유자 대신 게임 전용 역할을 사용하고, 비밀값을 `NEXT_PUBLIC_`·Git·페이지 props에 넣지 않습니다. 기본 로컬 값은 비워 두며 기존 Notion 설정은 유지합니다.
- 미설정 상태에서는 미연결 안내와 함께 로컬 경기·리플레이·저장 없는 기록 미리보기를 제공합니다. 이 경기를 나중에 온라인 기록으로 소급 등록하지 않습니다. 미연결·정상 빈 순위·조회 실패·등록 성공을 구분합니다.
- 등록 IP는 공개 응답에 포함하지 않고 관리 목적으로만 보관합니다. 30일 만료 뒤 정리하는 정책이며, 운영 정기 삭제에는 별도 `CRON_SECRET`과 Cron 배포·실행 확인이 필요합니다. [비공개 정리 이력](docs/PREVIEW.md#cron-비공개-실행-이력)은 해당 SQL 적용 후 DB 실행 시각·성공 여부·삭제 건수만 저장합니다. 실제 DB 적용·배포 여부는 현재 상태 문서에서 확인합니다.

SQL·마이그레이션 적용 순서, 역할·환경변수·API·IP 보관은 [Neon 연결 안내](docs/PREVIEW.md#온라인-top10과-neon-연결)를 따릅니다. 개발용 연결과 Vercel 운영 연결·배포는 별도로 관리하며 현재 확인 범위는 [현재 상태](docs/CURRENT_STATE.md)에서 구분합니다.

## 주요 경로

| 경로 | 역할 |
| --- | --- |
| `pages/index.js` | 새 메인·대표 프로젝트의 정적 페이지 생성 |
| `pages/projects.js` | 검색·분야 필터·최근 시작 순/이름순 정렬이 있는 전체 목록 |
| `pages/playground/` | 헤더 놀이터 → 게임 선택 → 100m 경기·큰 플레이 화면과 조작 연습. 비교·자동 시연은 개발용 |
| `lib/playground-*.mjs`, `components/playground/` | 달리기 규칙·선수·리플레이·관절·테마 HUD·음향·온라인 기록 등록과 로컬 미리보기 |
| `pages/api/playground/sprint/`, `lib/server/` | 게임 시도 발급·완주 검증·TOP10 조회/등록·만료 IP 정리와 서버 전용 Neon 접근 |
| `db/playground-sprint.sql`, `db/migrations/` | Neon 전용 역할·비공개 스키마·등록 함수와 IP 보관·역대 최고 마이그레이션 |
| `pages/archive.js` | 이전 홈 보관본, 검색엔진 수집 제외 |
| `pages/preview.js` | 같은 디자인을 확인하는 별도 미리보기, 무설정에서만 예시 사용 |
| `lib/notion.mjs` | Notion 데이터 소스 탐색·조회·오류 처리 |
| `lib/portfolio-preview.mjs` | 공개 실데이터 로더·미리보기 로더·카드 정규화·대표작 선정 |
| `lib/portfolio-catalog.mjs` | 목록 검색·분야·정렬 처리 |
| `lib/portfolio-i18n.mjs`, `lib/portfolio-messages.mjs` | 한영 경로와 공통 화면 문구 |
| `components/portfolio/` | 공통 Shell·홈·프로젝트 카드 |
| `config/portfolio-brand.js` | A·B·C 브랜드 선택과 테마별 로고·파비콘. [전환 방법](docs/PREVIEW.md#로고와-파비콘-전환) |
| `scripts/generate-favicons.mjs` | 개발·빌드 전 활성 브랜드의 기본 ICO와 검색용 PNG 동기화 |
| `lib/portfolio-seo.mjs`, `pages/robots.txt.js`, `pages/sitemap.xml.js` | 사이트명 구조화 데이터와 한영 공개 경로의 수집 안내 |
| `components/projects/project-item.js` | 이전 프로젝트 카드 소스 보존, 현재 목록에서는 사용하지 않음 |
| `components/animation.js` | 브라우저에서만 로드하는 Lottie 애니메이션 |
| `components/layout.js` | 헤더·푸터·방문 및 성능 측정 |
| `styles/portfolio-preview.module.css` | 새 메인·목록·미리보기의 공유 디자인 |
| `styles/portfolio-catalog.module.css` | 전체 목록의 탐색 UI |
| `styles/globals.css` | Tailwind와 이전 화면의 공통 스타일 |
| `tests/notion.test.mjs` | 모의 응답을 사용하는 조회 테스트 |
| `pages/gallery.js` | 메모리에만 저장되는 게시판 데모 |
| `pages/about-me.js` | 자기소개 초안 |

## 홈 애니메이션 오류

기존 Lottie는 `navigator` 유무로 브라우저를 판별합니다. Node.js 22에는 `navigator`가 있지만 `document`는 없어 서버에서 모듈을 직접 불러오면 `document is not defined`가 발생할 수 있습니다. `components/animation.js`에서는 `next/dynamic`의 `ssr: false`로 브라우저에서만 로드합니다. 페이지나 서버 실행 경로에 `react-lottie-player`의 직접 import를 다시 추가하지 않습니다.
