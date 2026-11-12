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

## 기술 구성

- Next.js 16.4.6 / React 18.2.0 / JavaScript / Tailwind CSS 3.4.19
- Node.js 22.13 이상인 22계열, npm (`.nvmrc`와 `package.json` 기준)
- 기존 번들링 동작을 유지하도록 개발·빌드는 Webpack을 명시합니다. lint는 ESLint 10과 Next 플러그인을 사용합니다.
- 프로젝트 콘텐츠는 Notion API로 조회하며 빌드 시 생성 및 ISR을 사용합니다.
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

Next 16의 빌드는 lint를 자동 실행하지 않으므로 별도로 검사합니다. `npm test`는 모의 응답으로 Notion 조회·페이지네이션·오류 처리를 검사하며 실제 인증된 Notion 조회나 공개 배포 검증을 대신하지 않습니다. 화면 확인 도구와 대체 순서는 작업 규칙의 브라우저 접근 절차를 따릅니다.

## Notion 운영

프로젝트 내용은 확인된 Notion DB에서 관리하고 실제 연결 값은 배포 서버 환경변수에서 관리합니다. 로컬에서 실데이터 조회가 필요할 때만 선택적으로 설정합니다. 원본 DB 주소, 환경변수, 연결 권한, 필드 구조와 콘텐츠 반영 절차는 [Notion·콘텐츠 기준](docs/NOTION.md)에 모았습니다.

## 주요 경로

| 경로 | 역할 |
| --- | --- |
| `pages/index.js` | 새 메인·대표 프로젝트의 정적 페이지 생성 |
| `pages/projects.js` | 검색·분야 필터·최근 시작 순/이름순 정렬이 있는 전체 목록 |
| `pages/archive.js` | 이전 홈 보관본, 검색엔진 수집 제외 |
| `pages/preview.js` | 같은 디자인을 확인하는 별도 미리보기, 무설정에서만 예시 사용 |
| `lib/notion.mjs` | Notion 데이터 소스 탐색·조회·오류 처리 |
| `lib/portfolio-preview.mjs` | 공개 실데이터 로더·미리보기 로더·카드 정규화·대표작 선정 |
| `lib/portfolio-catalog.mjs` | 목록 검색·분야·정렬 처리 |
| `lib/portfolio-i18n.mjs`, `lib/portfolio-messages.mjs` | 한영 경로와 공통 화면 문구 |
| `components/portfolio/` | 공통 Shell·홈·프로젝트 카드 |
| `config/portfolio-brand.js` | A·B·C 브랜드 선택과 테마별 로고·파비콘. [전환 방법](docs/PREVIEW.md#로고와-파비콘-전환) |
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
