# Vercel에서 개인 Notion DB로 전환하기

기준일: **2026-11-12 KST**. 대상은 [choichoi123/nextport](https://github.com/choichoi123/nextport)의 `master`와 개인 워크스페이스에 복제한 포트폴리오 DB입니다.

**최신 코드를 Vercel에 연결하고, 개인 DB를 읽을 수 있는 토큰과 DB ID를 서버 환경변수에 설정한 뒤 새로 배포하면 됩니다.** 다른 컴퓨터에서도 같은 Vercel 프로젝트·GitHub 저장소·개인 Notion 워크스페이스에 접근할 수 있으면 진행할 수 있습니다. 이 컴퓨터의 브라우저 로그인이나 Temp 폴더를 옮길 필요는 없습니다.

이 안내는 사용자가 다른 컴퓨터에서 수행할 절차입니다. 실제 Vercel 설정·공개 범위·배포의 현재 완료 여부는 [현재 상태](CURRENT_STATE.md)를 따릅니다. 메뉴 이름은 계정 언어와 Vercel UI에 따라 조금 다를 수 있습니다.

`<NOTION_DATABASE_ID>`·`<NOTION_DATA_SOURCE_ID>` 등은 실제 값이 아닌 예시 표기입니다. [비공개 관리 자료 안내](NOTION.md#공개-문서와-비공개-관리-자료)에 따라 실제 ID와 관리용 URL을 확인하고, 예시 문구를 Vercel에 그대로 입력하지 않습니다. 다른 컴퓨터에 관리 파일이 없으면 접근 가능한 Notion 관리 화면과 허용된 Vercel 설정에서 확인합니다.

## 전환할 대상

| 항목 | 사용할 값 또는 확인할 대상 |
| --- | --- |
| Git 저장소 | `choichoi123/nextport` |
| 대상 Vercel 프로젝트 | [choichoi123s-projects / nextport-03gr](https://vercel.com/choichoi123s-projects/nextport-03gr) |
| 운영 브랜치 | `master` |
| 새 화면까지 포함한 기준 커밋 | [`d240a62`](https://github.com/choichoi123/nextport/commit/d240a62e0fa7f394cd6fc3e667f470f5fe0ac0c7). 후속 수정이 있으면 이 커밋을 포함하는 최신 `master` |
| 기존 공개 주소 | [nextport-roan.vercel.app](https://nextport-roan.vercel.app/). 이 도메인이 연결된 기존 Vercel 프로젝트를 먼저 찾습니다. |
| 복제본 상위 페이지 | 🟢 포트폴리오 · 현재 관리본 (`<NOTION_PARENT_PAGE_ID>`) |
| 사용할 DB | 프로젝트 목록 · 현재 관리본 (`<NOTION_DATABASE_ID>`) |
| 사용할 DB ID | `<NOTION_DATABASE_ID>` |
| 같은 DB의 데이터 소스 ID | `<NOTION_DATA_SOURCE_ID>` |
| 이전 회사 DB ID | `<LEGACY_NOTION_DATABASE_ID>`. 이번 전환의 대상이 아닙니다. |

상위 페이지 ID인 `<NOTION_PARENT_PAGE_ID>`와 URL의 `?v=` 뒤 보기 ID는 DB ID로 입력하지 않습니다. DB와 데이터 소스의 구분·필드 이름은 [Notion 연결 계약](NOTION.md)을 유지합니다. 기존 복제본에 내용이 정리되어 있으므로 다시 복제할 필요도 없습니다. 다시 복제하면 프로젝트 페이지 ID가 달라져 대표작 선택 기준도 재검토해야 합니다.

## 다른 컴퓨터에서 준비할 것

1. [Vercel 대시보드](https://vercel.com/dashboard)에 기존 배포 프로젝트를 관리하는 계정으로 로그인합니다. 상단 팀 선택까지 확인합니다.
2. GitHub에서 `choichoi123/nextport`에 접근하고 Vercel 앱의 저장소 접근을 허용할 수 있는 계정으로 로그인합니다.
3. Notion에서 **개인 복제 DB가 있는 워크스페이스**로 전환합니다. 같은 이름의 DB가 여러 개 있으므로 위 주소로 대상을 확인합니다.
4. Vercel의 기존 성공 배포 주소·커밋, 연결 저장소, 운영 브랜치, Node 버전, 도메인과 환경변수 적용 범위를 확인해 둡니다. 이전 토큰 원문을 보유하고 있다면 복원용으로 암호 관리자 등 비공개 장소에 보관합니다. Secret 유형은 저장 후 다시 읽을 수 없으므로 원문이 없으면 예전 변수의 정확한 복원이 어려울 수 있습니다. 이 경우에도 기존 정상 배포는 보존합니다. Git·메신저·공유 문서에는 토큰을 기록하지 않습니다.

대시보드로 설정할 때는 다른 컴퓨터에 Node.js·Git·프로젝트 사본을 설치하지 않아도 됩니다. 이 저장소의 빈 `.env.local`을 채우거나 `vercel env pull`로 운영 설정을 내려받는 과정도 필요하지 않습니다.

기존 Vercel 프로젝트가 보이지 않으면 로그인 계정과 팀을 먼저 확인합니다. 기존 프로젝트를 찾기 전에 새 프로젝트를 만들거나 기존 도메인·Git 연결을 해제하지 않습니다.

## Notion 읽기 연결 준비

사이트는 방문자의 Notion 로그인으로 DB를 읽지 않습니다. Vercel 서버가 내부 연결의 API 토큰으로 읽습니다. 따라서 이전 회사 DB의 토큰을 그대로 두고 개인 DB ID만 바꾸면 접근에 실패할 수 있습니다.

### 운영용 연결 만들기

현재 사이트가 사용하는 읽기 전용 연결은 `nextport-preview`이며, 실제 사용 방식은 [Notion 운영 기준](NOTION.md#운영-방식과-변경-경계)을 따릅니다. 아래 신규 연결 생성 절차는 운영 키를 별도로 분리할 때 사용합니다. 별도 이름인 **`nextport-production`**으로 만들면 운영 키와 미리보기 키를 각각 관리할 수 있습니다. 이미 유효한 연결을 사용 중이면 DB를 편집할 때마다 연결을 다시 만들거나 토큰을 재발급할 필요는 없습니다.

1. 개인 워크스페이스 소유 계정으로 [Notion Developer portal](https://app.notion.com/developers)을 엽니다.
2. `Build → Internal connections`에서 `Create a new connection`을 선택합니다.
3. 이름을 `nextport-production`으로 입력하고 **개인 복제 DB가 있는 워크스페이스**를 선택합니다.
4. `Configuration`에서 **`Read content`만 허용**합니다. 사이트에는 콘텐츠 수정·삽입, 댓글·사용자 정보·에이전트 권한이 필요하지 않습니다.
5. 같은 화면에서 API 토큰을 확인합니다. 나중에 Vercel의 `NOTION_TOKEN` 값에 붙여 넣을 값입니다.

내부 연결은 특정 워크스페이스에 속하며, 토큰 생성과 페이지 접근 허용은 별도입니다. [Notion 내부 연결 안내](https://developers.notion.com/guides/connections-and-tokens/internal-connections), [권한 설명](https://developers.notion.com/reference/capabilities)

### 복제 DB 접근 허용

위 연결의 `Content access → Edit access`에서 **복제본 프로젝트 DB**를 선택합니다. DB가 선택되지 않는 UI라면 위 표의 복제본 상위 페이지를 선택하고 그 하위 DB가 접근 범위에 포함되는지 확인합니다. 상위 페이지 접근을 허용하면 하위 페이지에도 권한이 이어집니다.

다른 방법은 대상 DB를 전체 페이지로 열어 `••• → Connections → Add connection`에서 `nextport-production`을 추가하는 것입니다. 같은 이름의 예전 DB나 연결된 보기만 선택하지 않도록 주소를 확인합니다. [Notion 페이지 접근 허용 절차](https://developers.notion.com/guides/connections-and-tokens/internal-connections#granting-page-access)

토큰은 Developer portal에서 Vercel로 직접 옮깁니다. 기존 컴퓨터의 Temp 폴더, 브라우저 프로필·쿠키, 미리보기용 `.env.local`을 복사하지 않습니다.

## 상세 페이지 공개 여부 결정

**API로 카드를 표시할 권한과 방문자가 Notion 상세를 열 수 있는 권한은 다릅니다.** DB가 비공개여도 연결에 읽기 권한이 있으면 Vercel은 카드를 생성할 수 있습니다. 다만 현재 사이트는 상세 본문을 자체 렌더링하지 않고 해당 Notion 프로젝트 페이지로 이동합니다.

포트폴리오 방문자에게 상세를 공개할 때는 다음 순서로 진행합니다.

1. 공개할 각 프로젝트의 본문·이미지·링크·하위 페이지를 확인합니다.
2. 링크로 읽기만 제공할 때는 해당 페이지의 `Share → General access`에서 `Anyone on the web with link` · `Can view`(한국어 UI: ‘링크가 있는 웹의 모든 사용자’ · ‘읽기 허용’)를 설정합니다. Notion Sites의 `Publish`는 별도 게시 기능이 필요할 때 공개 범위와 함께 검토합니다. 공개 열람 권한과 편집 권한을 구분합니다.
3. 상위 페이지나 DB 전체를 공개하면 하위 내용도 공개될 수 있으므로, 공개할 프로젝트만 필요한 범위로 설정합니다. 검색엔진 노출과 템플릿 복제 허용도 별도 선택입니다.
4. 로그아웃된 별도 브라우저나 시크릿 창에서 **사이트 카드에 실제로 연결된 주소**를 클릭해 봅니다. 본문·사진·캡션까지 열리고 편집은 허용되지 않는지 확인합니다.

[Notion 공개 설정과 하위 페이지 안내](https://www.notion.com/help/public-pages-and-web-publishing)

현재 코드는 API의 `page.url`을 상세 링크로 사용합니다. Notion이 제공하는 `public_url`을 우선 선택하는 처리는 없습니다. Publish 화면의 공개 주소는 열리는데 카드 주소는 로그인만 요구한다면, 배포 완료로 처리하지 말고 두 주소를 비교해 상세 링크 선택 코드의 보완을 요청합니다. [Notion 페이지 객체의 URL 필드](https://developers.notion.com/reference/page)

또한 현재 조회 코드는 DB의 프로젝트를 전부 읽으며 Notion 화면의 보기 필터를 사용하지 않습니다. 공개하면 안 되는 항목을 보기 필터로 숨기는 것만으로 사이트에서 제외할 수는 없습니다.

## Vercel 프로젝트와 빌드 설정

기존 공개 주소를 유지하려면 **그 도메인이 연결된 기존 Vercel 프로젝트**에서 작업합니다. 프로젝트 이름만 보고 판단하지 말고 `Settings → Domains`와 현재 Production 배포를 확인합니다.

프로젝트의 `Settings → Build and Deployment` 등 빌드 설정 화면에서 다음 값을 확인합니다. UI에 따라 일부 항목은 `General`에 있을 수 있습니다.

| 설정 | 이 저장소의 값 |
| --- | --- |
| Framework Preset | `Next.js` |
| Root Directory | 저장소 루트. 하위 폴더를 지정하지 않습니다. |
| Node.js Version | `22.x` (`package.json`의 `engines.node`와 일치) |
| Install Command | 기본 자동 감지. 명시해야 한다면 `npm ci` |
| Build Command | 기본 Next.js 빌드 또는 `npm run build` |
| Output Directory | Next.js 자동 감지 기본값. `out`으로 변경하지 않습니다. |

이 프로젝트는 서버의 Notion 조회와 ISR을 사용합니다. 정적 파일 전용 호스팅 설정이나 `next export`로 바꾸지 않습니다. Node 버전은 현재 Vercel 지원 범위와 함께 확인합니다. [Vercel Node.js 버전 설정](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

## 서버 환경변수 입력

프로젝트 사이드바의 **`Environment Variables`**에서 설정합니다. UI에 따라 `Settings → Environment Variables`에 있을 수 있습니다. **Git 연결·배포 생성 전에 아래 값을 준비**하면 의도하지 않은 설정으로 배포되는 일을 줄일 수 있습니다. [Vercel 변수 관리 화면](https://vercel.com/docs/environment-variables/managing-environment-variables)

### 기본 설정

| 이름 Key | 값 Value | 적용 대상 |
| --- | --- | --- |
| `NOTION_TOKEN` | 위에서 준비한 개인 워크스페이스 연결의 API 토큰 | 실제 배포할 환경 |
| `NOTION_DATABASE_ID` | 비공개 관리 자료의 실제 현재 관리본 DB ID (`<NOTION_DATABASE_ID>`에 대응) | 같은 환경 |
| `NOTION_DATA_SOURCE_ID` | **설정하지 않음. 예전 값이 있으면 해당 환경에서 삭제** | 같은 환경 |

Vercel의 입력칸에는 값만 넣습니다. `NOTION_DATABASE_ID=` 같은 접두어, 따옴표, 줄바꿈은 붙이지 않습니다. 토큰에는 `NEXT_PUBLIC_`를 붙이지 않으며 **Secret 유형**으로 저장합니다. 이전 UI의 Sensitive 설정을 사용하는 경우에도 값을 가린 상태로 관리합니다.

**`NOTION_DATA_SOURCE_ID`가 있으면 코드가 `NOTION_DATABASE_ID` 탐색을 건너뜁니다.** 예전 소스 ID를 남기면 DB ID를 바꿔도 그 소스를 계속 조회합니다. 위 기본 설정은 새 DB의 단일 소스를 자동 탐색하게 하는 방식입니다.

데이터 소스를 명시할 필요가 생기면 비공개 관리 자료에서 `<NOTION_DATA_SOURCE_ID>`에 대응하는 실제 데이터 소스 ID를 확인해 입력합니다. 이때도 개인 DB에 접근 가능한 토큰이 필요합니다. 두 ID를 함께 입력하더라도 코드가 서로 같은 DB인지 검증해 주지는 않습니다.

### 환경 선택

| 환경 | 사용할 시점 |
| --- | --- |
| `Production` | 실제 공개 사이트 전환에 필수 |
| `Preview` | 운영 전 별도 브랜치의 배포로 확인할 때 설정 |
| `Development` | 이번 대시보드 전환에는 필요 없음. 로컬 무설정 운영을 유지합니다. |

Production만 바꿀 때 기존 Preview 값까지 덮지 않도록 적용 범위를 나눕니다. Preview를 사용할 경우 브랜치별 같은 이름의 변수가 공통 Preview 값을 덮는지도 확인합니다. 프로젝트·팀의 공유 변수에서 같은 이름을 공급한다면 그 적용값도 확인합니다. [Vercel 환경별 변수](https://vercel.com/docs/environment-variables), [공유 환경변수](https://vercel.com/docs/environment-variables/shared-environment-variables)

**환경변수를 저장해도 이미 실행 중인 배포는 바뀌지 않습니다. 새 값으로 빌드한 새 배포가 필요합니다.** [Vercel 환경변수 변경 반영](https://vercel.com/docs/environment-variables#troubleshooting-environment-variables)

## Git 연결과 배포할 커밋 확인

1. `Settings → Git → Connected Git Repository`에서 `choichoi123/nextport`인지 확인합니다. 이미 맞게 연결되어 있으면 그대로 둡니다.
2. 연결이 없으면 GitHub 연결·저장소 선택에서 해당 저장소를 연결합니다. 목록에 없으면 GitHub의 Vercel 앱에 이 저장소 접근이 허용되어 있는지 확인합니다. 다른 저장소가 연결되어 있다면 앞서 기록한 설정·도메인을 대조한 뒤 대상 프로젝트가 맞는지 먼저 판단합니다.
3. `Settings → Environments → Production → Branch Tracking`에서 운영 브랜치를 **`master`**로 지정합니다. 이전 UI에서는 Git 설정 안에 `Production Branch`가 있을 수 있습니다.
4. [GitHub master 이력](https://github.com/choichoi123/nextport/commits/master/)과 Vercel의 배포 Source를 비교합니다. 최소한 `d240a62`까지의 네 커밋이 포함된 코드여야 새 메인·목록·Notion 조회 방식이 함께 적용됩니다.

Git 연결이나 운영 브랜치 변경 과정에서 배포가 시작될 수 있습니다. 먼저 빌드·환경변수 설정을 끝내고, 이후 `Deployments`에서 실제 배포 대상과 상태를 확인합니다. 연결 뒤 과거 push가 자동 재실행될 것이라고 가정하지 않습니다. [Vercel Git 연결 설정](https://vercel.com/docs/project-configuration/git-settings), [운영 브랜치 설정](https://vercel.com/docs/git#customizing-the-production-branch)

### 운영 전에 Preview로 확인하려면

운영 도메인을 바꾸기 전 별도 검토가 필요하면 GitHub에서 최신 `master`를 기준으로 `codex/notion-db-check` 같은 **운영 브랜치가 아닌 브랜치**를 만들고 그 브랜치를 배포합니다. Preview 환경변수를 먼저 위 DB로 설정하고, 배포 상세의 Target이 `Preview`인지 확인합니다. 이 과정만으로 기존 Production 배포가 교체되는 것은 아닙니다.

Preview에서 아래 검증을 통과하면 Production 변수도 준비하고 **`master`를 Production 대상으로 새로 빌드**합니다. `Promote to Production`을 사용하는 대안도 있으며, 현재 공식 안내에서 Preview 승격은 Production 환경변수로 전체 재빌드합니다. 이때도 Preview의 검사 결과만으로 완료 처리하지 않고 새 Production 결과를 다시 확인합니다. [Vercel Preview 승격](https://vercel.com/docs/deployments/promoting-a-deployment#promote-a-deployment-from-preview-to-production)

### 최신 코드로 배포하기

1. 프로젝트의 `Deployments → Create Deployment`를 엽니다.
2. Git reference에 `master` 또는 배포할 최신 전체 커밋 SHA를 입력합니다. 현재 기준 전체 SHA는 `d240a62e0fa7f394cd6fc3e667f470f5fe0ac0c7`이며, 후속 수정이 있으면 최신값을 사용합니다.
3. 브랜치 선택이 나타나면 `master`를 선택하고 대상 환경이 **Production**인지 확인합니다. Preview 검토 중이라면 해당 별도 브랜치와 Preview를 선택합니다.
4. Build Logs에서 실제 체크아웃 커밋, Node 버전, 빌드 결과를 확인하고 `Ready`가 될 때까지 기다립니다. Production 도메인이 배정되면 실제 방문자에게 새 배포가 제공됩니다.

과거 배포의 `Redeploy`는 그 배포의 소스 커밋을 다시 빌드합니다. 예전 화면의 배포를 골라 재배포하면 최신 Git 코드를 자동으로 가져오는 절차가 아닙니다. 최신 소스의 배포임을 확인한 경우에만 해당 배포의 `Redeploy`를 사용합니다. [Git reference로 배포 만들기](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference), [재배포 안내](https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project)

기존 프로젝트를 끝내 사용할 수 없어 새 프로젝트를 만드는 경우에는 `Add New → Project`에서 같은 저장소를 Import하고 위 빌드·변수를 배포 전에 입력합니다. 새 프로젝트의 기본 주소는 기존 `nextport-roan.vercel.app`과 다릅니다. 기존 프로젝트의 정상화와 도메인 이전은 구분하며, 이전 프로젝트를 삭제해 주소를 확보하려고 시도하지 않습니다.

## 배포 후 확인

`Ready`는 빌드·배포 상태입니다. 아래 내용까지 확인해야 복제 DB 전환을 완료했다고 판단할 수 있습니다. 개수와 프로젝트별 내용은 **2026-11-11 정리 결과**를 기준으로 하며 이후 DB를 편집했다면 그 변경도 반영해 비교합니다.

| 확인 위치 | 기대 결과 |
| --- | --- |
| Vercel 배포 상세 | 저장소·커밋·Target Production·도메인이 의도한 대상과 일치 |
| `/` | 새 소개·연락 동선, 대표작 **부산 WISEOP → 파주 바우처 → 이케이시스** |
| `/projects` | 전체 **7개**, 파주 검색 결과 1개, 검색·필터·정렬 정상 |
| 파주 카드 | 기간 `2026.02–2026.05`, 본인의 프론트엔드 역할, 타워가 있는 구성 표지 |
| 프로젝트 표지 | 7개 실제 Notion 커버 로드. 목록 하단의 지연 로딩 이미지도 확인 |
| 파주 상세 | `2026-02-10~2026-05-29`, 정적 웹 구조·iOS 12 대응 설명·탑승정보 사진과 캡션, 본문 사진 6개 |
| 비로그인 상세 링크 | 사이트에서 클릭한 Notion 본문·사진이 로그인 없이 열림 |
| `/archive` | 이전 홈 보관본이 열림. 메인 교체 때문에 이전 소스를 삭제한 상태가 아님 |
| 모바일·테마·연락 | 약 360px 화면과 데스크톱, 라이트/다크에서 넘침·깨짐 없음. 연락·외부 링크 대상 확인 |

내용만 맞는 것에 더해 **DB 출처**를 확인하려면 배포 환경의 DB/소스 설정을 다시 대조하고 카드의 Notion 페이지 ID를 확인합니다. 대표 프로젝트의 개인 복제본 ID는 다음과 같습니다.

| 프로젝트 | 개인 복제본 페이지 ID |
| --- | --- |
| 부산 WISEOP | `4144c6db16758078a2c5d4f55a1ba51c` |
| 파주 바우처 | `4154c6db167580b8afebcdc51b0c949f` |
| 이케이시스 | `fba4c6db16758282868481b2e939c83b` |

운영 토큰을 개발자 도구·브라우저 콘솔에 넣어 API를 시험할 필요는 없습니다. 진단이 필요하면 서버에서 안전하게 조회하고 제목·개수·부모 DB 일치 여부를 확인합니다. 실제 연결 ID·토큰·전체 비공개 응답을 공개 로그나 스크린샷으로 공유하지 않습니다.

## 수정 내용이 바로 보이지 않을 때

홈·전체 목록은 `getStaticProps`와 `revalidate: 1`을 사용합니다. **1초마다 자동 동기화한다는 뜻은 아닙니다.** 재검증 가능 시간이 지난 뒤 방문 요청이 와야 재생성이 시작되므로, Notion 저장 직후 첫 방문에는 이전 화면이 잠시 보일 수 있습니다. 잠시 후 다시 방문하고 필요하면 새로고침합니다. 재생성에 실패하면 이전 정상 페이지가 유지될 수 있으므로 서버 로그도 확인합니다. [Next.js Pages Router ISR](https://nextjs.org/docs/pages/guides/incremental-static-regeneration)

일반적인 제목·설명·기간·표지 편집에는 Git push가 필요하지 않습니다. 다만 **토큰·DB/소스 ID·코드를 바꾼 경우에는 새 배포가 필요**합니다.

Notion 업로드 이미지 주소는 만료될 수 있습니다. DB의 커버를 다시 읽어 새 주소를 얻어야 하며 서명 URL을 환경변수나 코드에 고정하지 않습니다. 현재 공통 카드는 일반 이미지 요소를 사용하므로 예전 `next.config.js`의 `images.domains`를 늘리는 것이 기본 해결책은 아닙니다. [Notion 파일 URL 안내](https://developers.notion.com/reference/file-object)

## 문제별 확인 방법

| 증상 | 확인과 조치 |
| --- | --- |
| 빌드는 성공했는데 프로젝트가 0개 | 세 Notion 변수가 모두 비면 정상적으로 빈 목록을 빌드합니다. Production 적용 여부·입력값·새 배포 여부를 확인합니다. |
| `/preview`에서만 예시 3개 표시 | 연결값이 없는 예시 모드일 수 있습니다. 실DB 인증 성공의 증거로 보지 않습니다. |
| 설정이 불완전하다는 빌드 오류 | 토큰과 DB ID 또는 소스 ID가 같은 환경에 있는지 확인합니다. |
| 새 DB ID인데 예전 항목 표시 | 남아 있는 `NOTION_DATA_SOURCE_ID`, 브랜치별 변수, 배포 커밋·도메인·캐시를 확인합니다. |
| Notion HTTP 401 | 개인 워크스페이스 연결의 유효한 토큰인지, 복사 누락·줄바꿈이 없는지 확인합니다. |
| Notion HTTP 403 | `Read content` 권한을 확인합니다. |
| Notion HTTP 404 | DB·소스 ID, 워크스페이스, 연결의 페이지 접근을 확인합니다. 접근이 없는 DB도 404가 날 수 있습니다. |
| Notion HTTP 400 | `Name` 제목 속성 및 ID 종류를 확인합니다. DB 이름이 같다는 이유로 속성 이름을 바꾸지 않습니다. |
| 데이터 소스가 여러 개라는 오류 | 해당 DB의 프로젝트 소스를 확인한 뒤 정확한 `NOTION_DATA_SOURCE_ID`를 지정하고 새로 배포합니다. |
| Notion HTTP 429·시간 초과 | 잠시 후 다시 시도하고 Notion 상태·서버 로그를 확인합니다. 현재 요청별 제한 시간은 10초입니다. |
| 카드만 열리고 상세는 로그인 요구 | API 설정과 별개로 Notion 웹 공개 범위·카드의 실제 링크를 확인합니다. |
| 기간 미정 | Notion `WorkPeriod`를 확인합니다. 파주는 확정 날짜가 있으므로 다른 DB·옛 배포를 보고 있는지도 확인합니다. |
| 표지가 스케치로 표시 | 커버 누락 또는 이미지 요청 실패 시 대체 스케치가 나옵니다. 실제 업로드 커버의 로드 여부·만료·재생성을 확인합니다. |
| Git push 뒤 배포가 없음 | 저장소·운영 브랜치·GitHub 앱 접근·배포 중지/건너뛰기·커밋 작성자 권한 관련 메시지를 확인합니다. 과거 push는 Create Deployment로 대상 커밋을 지정할 수 있습니다. |
| `Ready`인데 기존 사이트 유지 | 현재 Production 도메인이 어느 배포에 배정되어 있는지 확인합니다. Preview의 성공이나 오래된 서버 화면과 구분합니다. |

Notion 오류의 의미는 [공식 상태 코드](https://developers.notion.com/reference/status-codes)를 참고합니다. 빌드 오류를 공유할 때는 마지막 실패 원인과 커밋·Target만 보내고 환경변수 값은 가립니다.

현재 저장소는 **Next.js 13.2.4**이며, 2026년 5월 공식 보안 공지는 Next.js 13.x를 영향 버전에 포함합니다. 배포가 성공해도 구버전 보안 검토가 끝난 것은 아니므로 공개 운영 전 버전 갱신을 별도로 검토합니다. 실제 영향은 사용하는 기능과 개별 취약점 조건도 확인해야 합니다. [공식 보안 릴리스](https://vercel.com/changelog/next-js-may-2026-security-release)

Vercel에서 취약한 프레임워크 버전이라며 새 배포를 막는다면 DB 설정 실패와 구분하고, 실제 오류에 지정된 보안 수정 버전을 확인해 별도 코드 수정·테스트·빌드 후 재시도합니다. 버전 검사 우회 설정으로 해결하지 않습니다. 기존 로컬 빌드 성공만으로 현재 Vercel 배포 허용 여부를 보장하지 않습니다.

## 문제가 생겼을 때 복구

**새 배포 실패:** 기존 Production 도메인이 이전 정상 배포를 계속 가리키는지 확인합니다. 실패한 새 배포를 해결하기 위해 이전 배포·회사 DB를 삭제하거나 토큰을 먼저 폐기하지 않습니다.

**새 배포가 공개됐지만 문제가 있음:** 프로젝트 Overview의 Production 배포에서 `Instant Rollback`을 선택하고, 복구할 배포와 영향을 받을 도메인을 확인한 뒤 실행합니다. Hobby에서는 직전 Production 배포만 선택할 수 있으며 요금제에 따라 선택 범위가 다릅니다.

롤백은 이전 빌드·그 배포의 환경값으로 도메인을 돌리는 작업입니다. Notion 본문·공개 설정·프로젝트 설정 화면에 저장한 새 변수까지 과거로 되돌리는 작업은 아닙니다. 다음 배포도 예전 DB를 읽게 하려면 프로젝트 환경변수를 별도로 복원해야 합니다. 이전 회사 연결이 이미 유효하지 않다면 옛 배포로 돌아가도 조회·이미지가 계속 정상이라는 보장은 없습니다.

롤백 후에는 자동 Production 도메인 배정이 중지될 수 있습니다. 수정한 배포를 다시 공개할 때 Production 타일의 `Manage`에서 검토한 배포를 승격해 롤백 상태를 해제하고 자동 배정 복귀를 확인합니다. [Vercel 롤백과 해제 절차](https://vercel.com/docs/instant-rollback)

환경변수만 원복해 재배포하는 경우에도 **그 코드가 해당 DB와 Notion API 버전에 호환되는지** 먼저 확인합니다. 이전 DB·토큰 삭제나 폐기는 새 연결과 운영 화면의 안정화 확인 뒤 별도로 판단합니다.

## 전환 후 기록할 내용

작업 결과는 [현재 상태](CURRENT_STATE.md)의 배포 관련 상태를 갱신해 남깁니다. 같은 실행 기록을 여러 문서에 반복하지 않습니다.

- 실제 확인 날짜, Vercel 프로젝트·팀, Production 도메인, 배포 ID 또는 주소, 소스 커밋
- 개인 DB 별칭·소스 선택 방식, 운영 연결 이름, 적용한 환경. **실제 DB·소스 ID와 관리용 URL은 비공개 관리 자료에만 기록하고 토큰 원문은 그 자료에도 넣지 않음**
- 홈 대표작 순서·목록 개수·표지·기간·비로그인 상세 접근의 실제 확인 결과
- 보안 버전 수정 여부, 남은 오류·미확인 항목과 롤백 유무

다른 컴퓨터의 담당 AI에게는 이 설명서와 [AGENTS](../AGENTS.md)·[현재 상태](CURRENT_STATE.md)를 먼저 읽게 한 뒤, 접근 가능한 계정·프로젝트부터 확인하도록 요청하면 됩니다. 사용자 브라우저의 기존 탭·창은 닫지 않는 규칙도 그대로 적용합니다.
