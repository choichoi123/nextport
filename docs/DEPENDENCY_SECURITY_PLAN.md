# 의존성 보안 경고 영향과 수정 계획

기준일은 **2026-11-12 KST**, 이번 재검토 기준은 `master`의 **`ef2948c`**입니다. 최초 분석은 `abd6fe1`에서 수행했으며 아래 경고 집계와 lock-only 실험은 그때의 기록으로 보존합니다. 과거 결과를 이번 설치·실행·배포 검증으로 재사용하지 않습니다.

**Next 16.4.6·PostCSS 8.5.32·Tailwind 3.4.19를 선택하고 Pages Router·React 18.2·현재 한영 화면과 Notion 계약을 유지합니다.** lint는 ESLint 10.14.0과 `@next/eslint-plugin-next` 16.4.6의 직접 flat config로 구성합니다. 독립 사본에서 검증한 수정안을 로컬 소스에 반영했으며 실행 수치와 한계는 [현재 상태의 보안 수정 기록](CURRENT_STATE.md#의존성-보안-수정과-로컬-검증) 한 곳에서 관리합니다. 커밋·배포는 아직 하지 않았습니다.

시스템 Node **22.23.1**, 기존 실행 서버와 그 `node_modules`는 이번 작업에서 교체하지 않습니다. 로컬 Notion 빈 설정·인증값·운영 연결·DB 내용·공개 범위·로고·파비콘을 패키지 수정의 일부로 변경하지 않습니다. commit·push·Preview·Production 결과는 별도 실행 기록이 있어야 완료로 판단합니다.

## 확인한 경고와 검사 범위

최초 `abd6fe1` 분석 당시 로그인된 GitHub의 [열린 Dependabot 경고](https://github.com/choichoi123/nextport/security/dependabot) 두 페이지에서 46건을 확인하고 치명적 3건의 상세·수정 버전을 읽었습니다. 그중 Next는 29건이었습니다. 아래는 당시 집계이며 이번 후보의 새 감사 결과가 아닙니다. 경고 개수는 침해 횟수나 현재 서비스에서 성립하는 공격 개수를 뜻하지 않습니다. 경고 닫기·무시·자동 수정 PR 생성도 당시 수행하지 않았습니다.

| 패키지 | 치명적 | 높음 | 보통 | 낮음 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: |
| next | 3 | 8 | 14 | 4 | 29 |
| postcss | 0 | 2 | 3 | 0 | 5 |
| nanoid | 0 | 3 | 1 | 0 | 4 |
| brace-expansion | 0 | 1 | 1 | 0 | 2 |
| source-map-js | 0 | 1 | 0 | 0 | 1 |
| braces | 0 | 1 | 0 | 0 | 1 |
| browserslist | 0 | 1 | 0 | 0 | 1 |
| minimatch | 0 | 1 | 0 | 0 | 1 |
| postcss-selector-parser | 0 | 0 | 1 | 0 | 1 |
| picomatch | 0 | 0 | 1 | 0 | 1 |
| **합계** | **3** | **18** | **21** | **4** | **46** |

최초 원본 lock의 `npm audit --package-lock-only --ignore-scripts --json`은 **취약 패키지 12개**, 개발 의존성을 제외하면 **4개(next·내부 postcss·nanoid·source-map-js)**로 집계했습니다. GitHub는 개별 경고, npm은 취약 패키지와 전이 경로를 집계하며 보안 DB의 시점도 다르므로 46과 12를 같은 단위로 비교하지 않습니다. npm에서 추가로 탐지했던 micromatch·yaml도 이번 최종 lock 재검사 범위에 포함합니다.

이번 재검토에서는 `ef2948c`의 소스·lock·설치된 Next 13 이미지 처리 분기와 공식 권고·registry 메타데이터를 다시 읽었습니다. 공격용 입력이나 취약점 재현 요청은 전송하지 않았으며, 실제 침해·토큰 탈취가 있었다는 판정도 아닙니다.

### 현재 보존할 기준

- Pages Router·React 18.2를 사용하며 `ko` 기본·`en` 추가, 자동 언어 감지 비활성화, 한국어 보조 경로로 돌아가는 **redirect 3개**가 있습니다. middleware·proxy·사용자 정의 rewrites·App Router·Server Actions·RSC는 없습니다. 최초 계획의 ‘i18n·redirects 없음’을 현재 사실로 사용하지 않습니다.
- 보안 변경 전 자동 테스트 기준은 **62개**입니다. 이는 직전 기능 배포의 기준이며 이번 후보의 테스트 성공 수치가 아닙니다.
- 프로젝트 7개·대표작 **WISEOP → 파주 → 이케이시스**, 파주 기간 `2026.02–2026.05`, 표지 7개, 한국어 원본과 별도 영문 상세 **7개**의 선택·복귀 계약을 유지합니다.
- 딥그린 OG·한영 메타·한 곳에서 밝은 OG로 전환하는 설정, 미리보기 `noindex`, 언어 전환의 해시·검색어·분야·정렬 유지도 회귀 기준입니다. Notion 데이터를 소스에 새로 하드코딩하지 않습니다.

## 치명적 3건의 실제 영향

| 우선 확인 순서 | GitHub 경고와 취약점 | 성립 조건과 영향 | 현재 프로젝트의 판단 | 개별 수정 최소 버전 |
| --- | --- | --- | --- | --- |
| **1** | [#93 SVG 이미지 처리 RCE](https://github.com/choichoi123/nextport/security/dependabot/93), GHSA-2464-fhr4-w9xw, 9.5 | glibc 기반 Linux의 이미지 최적화에서 취약한 네이티브 이미지 라이브러리를 거치면 원격 코드 실행 가능 | 버전 범위에 포함. 새 카드는 일반 `img`지만 이미지 최적화 서버를 비활성화한 설정은 없음. 운영의 네이티브 처리 경로·보호 상태를 우선 확인 | Next 15.5.28 / 16.4.1, 별도 우회 기준 sharp 0.35.5 이상 |
| **2** | [#85 AVIF 이미지 처리 RCE](https://github.com/choichoi123/nextport/security/dependabot/85), GHSA-2xp9-vwfh-vxw4, 9.5 | AVIF가 sharp → libvips → libheif의 취약한 디코더로 전달되면 원격 코드 실행 가능 | 버전 범위에 포함. Vercel은 중앙 이미지 서비스의 AVIF 완화를 공식 발표했으므로 현재 Vercel 경로의 위험과 자체 호스팅 위험을 구분 | Next 15.5.24 / 16.3.3 |
| **3** | [#7 미들웨어 인증 우회](https://github.com/choichoi123/nextport/security/dependabot/7), GHSA-f82v-jwr5-mffw, CVE-2025-29927, 9.1 | 인증·권한 검사를 middleware에서 수행할 때 우회 가능 | 현재 middleware와 비공개 웹 인증 흐름이 없어 해당 공격의 전제 조건을 찾지 못함. Vercel 자동 보호도 공식 명시됨. 패키지 수정에는 함께 포함 | Next 13.5.9 / 14.2.25 / 15.2.3 |

1·2는 확인과 수정의 우선순위가 높은 이미지 처리 항목이며, 3은 현재 기능 조건에서 직접 노출이 낮은 항목입니다. 실제 패키지 교체는 세 건을 함께 해결하는 한 경로로 진행합니다. 최소 수정 버전은 개별 경고의 기준이며 현재 전체 해결 목표 버전이 아닙니다.

근거는 [SVG 공식 권고](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [AVIF 공식 권고](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [미들웨어 공식 권고](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)입니다. Vercel의 AVIF 완화는 [플랫폼 발표](https://vercel.com/blog/reproducing-disclosing-and-fixing-the-libheif-vulnerability-with-hacktron-and-the-maintainers)에 근거합니다. 이 완화를 SVG 경고에도 그대로 적용된다고 가정하지 않습니다.

### 이미지 경로에서 주의할 점

- 현재 lock에는 sharp가 없습니다. 설치된 Next 13은 sharp를 찾으면 사용하고 없으면 Squoosh로 대체합니다. 로컬 lock만으로 Vercel의 관리 이미지 서비스나 실제 배포의 네이티브 라이브러리 상태를 확정할 수 없습니다.
- `images.formats: ['image/webp']`는 출력 형식 설정입니다. 공격자가 제공하는 입력 AVIF를 디코딩하지 않는다는 증거가 아닙니다.
- SVG 기본 차단과 일반 `img` 사용은 이미지 최적화 엔드포인트 전체가 닫혔다는 증거가 아닙니다. `components/projects/project-item.js`의 `next/legacy/image`는 보존돼 있지만 현재 다른 소스에서 사용하는 경로는 찾지 못했습니다. 컴포넌트 사용 여부와 서버의 이미지 처리 경로를 따로 확인합니다.
- `ef2948c`는 S3 등을 `images.domains`의 호스트 단위로 허용합니다. 이번 선택은 같은 호스트를 `remotePatterns`로 옮기는 것이며 최적화 API의 완전 비활성화로 보고하지 않습니다. 공유 호스트 허용이 현재 DB의 표지만 허용한다는 뜻도 아닙니다. Preview에서 정상 이미지 요청의 결과를 확인하고 실제 네이티브 처리 버전과 대조합니다.
- Next 16.4.6은 위 세 권고의 취약 범위 밖입니다. registry에서 Next의 optional sharp 범위 `^0.35.5`와 sharp 0.35.5의 존재를 확인했습니다. 이것만으로 Windows·Linux 배포의 실제 설치 결과를 확정하지 않으며 `sharp`와 네이티브 이미지 라이브러리의 해결값을 검증합니다. [Next 메타데이터](https://registry.npmjs.org/next/16.4.6), [sharp 메타데이터](https://registry.npmjs.org/sharp/0.35.5)

## 기존 기능과 나머지 경고의 관계

현재는 Pages Router만 사용하며 `app/`, Server Actions·RSC·`use cache`, middleware·proxy와 사용자 정의 rewrites는 없습니다. **i18n과 redirect 3개는 있으므로** 관련 경고의 조건을 현재 설정으로 다시 점검합니다. middleware 인증이 없다는 판단과 i18n이 없다는 판단을 혼동하지 않습니다. 조건을 찾지 못한 경고도 일괄 무시하지 않고 지원 버전 교체에 포함합니다.

`/`·`/projects`·`/preview`와 해당 영어 경로는 `getStaticProps`와 `revalidate: 1`을 사용합니다. 이미지 최적화·캐시 응답·개발 서버 관련 경고를 Pages Router라는 이유로 제외하지 않습니다. 수정 후 ISR과 캐시의 정상·실패 경로를 검증합니다.

PostCSS·nanoid·source-map-js는 Next의 내부 의존성 경로에도 있으므로 루트 PostCSS만 올려서는 충분하지 않습니다. Tailwind·Autoprefixer·glob 도구의 경고는 주로 CSS 빌드·파일 탐색·개발 도구 경로입니다. 현재 방문자가 임의 CSS·glob·YAML을 서버에 업로드해 처리하게 하는 기능은 없지만, CI·개발 환경 보호와 새 lock의 전체 감사에 포함합니다.

## 이번 선택과 과거 격리 실험

Next 13·14는 지원 종료 상태입니다. [공식 지원 정책](https://nextjs.org/support-policy)에 따라 **Active LTS인 Next 16.4.6**을 기본 목표로 잡습니다. Next 15.5.29는 2027-01-31까지 보안 지원되는 중간 대안이며, 16 전환의 회귀 문제가 해결되지 않을 때 별도로 검토합니다. 13.5.9만 적용하면 다른 이미지 RCE와 나머지 경고가 남습니다.

| 항목 | `ef2948c` 기준 | 이번 선택 | 변경 이유 |
| --- | --- | --- | --- |
| Next.js | 13.2.4 | **16.4.6** | 치명적 3건과 Next 경고 29건을 지원 버전에서 처리 |
| 직접 PostCSS | 8.4.21 | **8.5.32** | 루트 CSS 처리 경로 수정 |
| Tailwind CSS | 3.3.1 | **3.4.19** | 3계열을 유지하면서 빌드 전이 의존성 갱신 |
| React / React DOM | 18.2.0 / 18.2.0 | **동일 버전 유지** | Pages Router 및 Lottie·테마 호환 변경 최소화 |
| 기타 직접 의존성 6개 | 현재 lock 값 | 기존 값 유지 | Analytics·Speed Insights·dotenv·next-themes·Lottie wrapper·Autoprefixer의 불필요한 직접 업그레이드 방지 |
| lint CLI | `next lint` 스크립트, ESLint 직접 의존성 없음 | **ESLint 10.14.0** | 제거된 Next CLI 대신 지원 중인 ESLint 사용 |
| Next lint 규칙 | 별도 명시 설정 없음 | **`@next/eslint-plugin-next` 16.4.6 직접 flat config** | React 플러그인 peer 범위와의 충돌을 피하고 Next 규칙을 명시 |
| 시스템 Node | 22.23.1 | **22.23.1 유지** | 기존 서버와 실행 환경을 보존하고 독립 사본에서 검증 |

Next 16.4.6의 peer 범위는 React 18.2를 허용하고 Pages Router는 프로젝트의 React를 사용합니다. 현재 Lottie wrapper의 peer 범위도 React 18을 포함합니다. React 19·App Router·Tailwind 4로 전환하지 않습니다. Next의 Node 요구 조건은 `>=20.9.0`, ESLint 10.14.0은 `^20.19.0 || ^22.13.0 || >=24`이므로 시스템 22.23.1은 두 engine 범위를 만족합니다. 이는 실제 실행 성공을 뜻하지 않습니다. [Next 메타데이터](https://registry.npmjs.org/next/16.4.6), [ESLint 메타데이터](https://registry.npmjs.org/eslint/10.14.0), [Pages Router 설치 안내](https://nextjs.org/docs/pages/getting-started/installation)

### lint 선택 이유와 범위

ESLint 9는 2026-08-06부터 EOL이며 10계열이 Current입니다. Next 공식 문서는 `eslint-config-next`의 ESLint 10 지원과 별개로 일부 포함 플러그인의 peer 범위가 아직 10을 선언하지 않아 충돌할 수 있다고 설명합니다. 조회한 `eslint-plugin-react` 7.37.5도 ESLint 10을 peer 범위에 포함하지 않습니다. 따라서 이번에는 **ESLint 10.14.0 + `@next/eslint-plugin-next` 16.4.6**을 직접 등록하는 flat config를 선택합니다. [ESLint 지원 정책](https://eslint.org/version-support/), [Next ESLint 안내](https://nextjs.org/docs/pages/api-reference/config/eslint), [직접 플러그인 사용](https://nextjs.org/docs/app/api-reference/config/eslint#using-the-plugin-directly), [React 플러그인 메타데이터](https://registry.npmjs.org/eslint-plugin-react/7.37.5)

이 선택은 `eslint-config-next` 전체 구성과 React·Hooks·접근성 플러그인의 모든 검사를 자동으로 제공한다는 뜻이 아닙니다. 적용하는 파일·JSX 파서 옵션·Next 권장 규칙·생성물 제외 범위를 설정에 명시하고 실제 lint 결과를 확인합니다. 기존 테스트와 브라우저 검증을 lint로 대체하지 않습니다.

### lint 개발 경로의 minimatch 보완 선택

ESLint 10.14.0의 `minimatch: ^10.2.6`, `@eslint/config-array` 0.23.5의 `minimatch: ^10.2.4`는 새 GHSA-g3hv-75wg-m249의 범위 `>=7.0.0 <11.0.1`에 포함됩니다. 공식 권고는 공격자가 제어하는 glob의 전처리 증폭에 의한 서비스 거부를 설명하며 수정 버전은 11.0.1입니다. 실행 담당자의 override 전 후보 감사에서는 이 **한 권고가 lint 개발 경로의 3개 aggregate**로 보고됐습니다. 이를 Next production 경로의 취약점 3건이나 서로 다른 새 취약점 3개로 세지 않습니다. [GitHub 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249), [수정 릴리스](https://github.com/isaacs/minimatch/releases/tag/v11.0.1)

EOL ESLint 9로 돌아가거나 전역 force를 사용하지 않고 **ESLint와 `@eslint/config-array` 아래의 두 개발 경로에만 minimatch 11.0.8 scoped override**를 적용하는 안을 선택했습니다. 11.0.8의 Node 범위 `20 || >=22`는 현재 시스템과 맞지만, 부모 패키지가 요청한 10계열을 넘는 선택이므로 호환성을 별도로 검증해야 합니다. 전역 minimatch 일괄 교체나 production 경로 확대로 처리하지 않습니다. [ESLint 메타데이터](https://registry.npmjs.org/eslint/10.14.0), [config-array 메타데이터](https://registry.npmjs.org/@eslint%2fconfig-array/0.23.5), [minimatch 메타데이터](https://registry.npmjs.org/minimatch/11.0.8)

override 전후 lint 대상 파일 집합과 메시지의 동등성, 깨끗한 `npm ci`, 전체·production 감사와 의존성 경로를 비교합니다. Windows 설치의 optional sharp-wasm 관련 `extraneous` 표시도 실제 lock·선택적 전이 관계와 구분해 기록합니다. 감사 결과와 설치 트리 표시를 하나의 성공 수치로 합치지 않습니다. 상위 패키지가 수정 버전을 직접 수용하면 scoped override 제거를 검토합니다.

### 과거 `abd6fe1` lock-only 실험

최초 분석 때 새 Temp 폴더에서 package.json만 복사해 Next·PostCSS·Tailwind 세 직접 패키지를 변경하고 나머지 직접 의존성 8개를 당시 lock 버전으로 고정했습니다. `npm install --package-lock-only --ignore-scripts --no-audit`는 peer 충돌 없이 성공했고 **그 실험의 전체 npm audit은 0건**이었습니다. 당시 원본 manifest·lock은 불변이었고 node_modules 생성이나 설치 스크립트 실행도 없었습니다. 새 lint 의존성을 포함한 이번 최종 조합의 결과는 별도로 확인해야 합니다.

후보는 sharp 0.35.5, Next 내부 PostCSS 8.5.23, nanoid 3.3.20, source-map-js 1.2.2 등을 선택했습니다. 이 결과는 수정 가능한 의존성 조합을 확인한 것이며 **빌드·화면·실제 Notion 연결 성공 또는 GitHub 경고 종료를 확인한 결과가 아닙니다.** 기존 lock의 세 항목만 수동 수정하면 같은 결과가 나온다는 뜻도 아닙니다.

특히 그 실험은 Lottie wrapper 1.5.4를 유지해도 전이 엔진 lottie-web을 5.10.2 → 5.13.0으로 해석했습니다. 이번 실제 설치의 버전이 같다고 가정하지 않습니다. 기존 lock을 출발점으로 불필요한 전이 변경을 줄이고 최종 트리를 감사하며 `/archive` 애니메이션과 CSS를 실제로 검증합니다.

당시 권고했던 Node 22.23.5 갱신도 과거 계획으로 보존합니다. 이번 시스템 Node 교체를 실행했다는 뜻이 아니며 현재 선택은 22.23.1 유지입니다. Node 보안 패치와 Vercel 관리 런타임은 별도 점검 대상으로 남깁니다. [Node 보안 릴리스](https://nodejs.org/en/blog/release/v22.23.5), [Vercel Node 보안 안내](https://vercel.com/kb/bulletin/node-js-security-advisory)

### 검증 기준과 결과 위치

아래는 검증 계약입니다. 이번 실행 결과·실행 위치·미확인 범위는 [현재 상태](CURRENT_STATE.md#의존성-보안-수정과-로컬-검증)를 따르며 같은 실행 기록을 이 문서에 중복하지 않습니다.

| 항목 | 확인 방법 |
| --- | --- |
| 최종 lock의 전체·production npm audit | scoped override를 포함한 설치·lock을 각각 감사 |
| 깨끗한 설치·peer 해결·Windows/Linux 네이티브 버전 | `npm ci`와 실제 로드 버전, 선택적 WASM 표시 및 각 OS의 실행 여부 구분 |
| ESLint 10 직접 flat config 실행 | override 전후 대상 파일·메시지 동등성 비교 |
| 기존 테스트와 추가 회귀 검사 | 기존 62개와 프레임워크 회귀 범위 검사 |
| Webpack 프로덕션 빌드·한영 경로 생성 | 무설정 제품과 검토용 표시 데이터 사본을 구분 |
| 이미지·Lottie·한영 UI·영문 상세·OG·ISR | 실제 브라우저·정상 이미지 요청·모의 ISR 성공과 실패 보존 검사 |
| Linux Preview·Production·Dependabot | 로컬 성공으로 대체하지 않고 사용자 승인 후 별도로 확인 |

## 수정 순서

### 1. 현재 동작과 연결 기준 고정

`ef2948c`의 코드·lock·환경 설정을 기준으로 기존 미커밋 문서와 이번 작업을 구분하고 실행 서버·탭을 보존합니다. 시스템 Node와 기존 서버의 `node_modules`를 교체하지 않고, 별도 경로에서 설치·빌드 산출물을 분리합니다. 로컬에는 실제 Notion 값을 새로 복사하지 않습니다. 관리본 7개·대표작 순서·기간·표지·한영 상세 링크·딥그린 OG와 오류 표시 방식을 비교 기준으로 삼습니다.

### 2. Next와 이미지 처리 경로 수정

분리된 실행 사본에서 Next 16.4.6과 필요한 최소 호환 변경을 적용합니다. Windows와 실제 배포의 Linux 환경에서 sharp와 이미지 처리 의존성의 실제 설치 버전을 확인합니다. 미사용 최적화 경로를 닫는 안과 필요한 경로만 제한해서 유지하는 안을 검토하며, Vercel의 정상 이미지 요청 결과까지 확인합니다.

Pages Router와 현재 JavaScript·컴포넌트·데이터 로더를 유지합니다. `getStaticProps`, `revalidate: 1`, 페이지네이션, 데이터 소스 자동 탐색, 한영 표시 필드와 상세 URL 정규화, 빈 목록·무설정·오류의 구분을 보존합니다. i18n의 `ko` 기본·`en` 추가·`localeDetection: false`와 기존 redirect 3개도 유지합니다. Notion 토큰·관리 ID·DB 권한·공개 범위는 변경하지 않습니다.

### 3. 빌드 도구와 lock 정리

PostCSS 8.5.32·Tailwind 3.4.19와 안전한 전이 버전을 해석하고 diff를 검토합니다. Next 내부 PostCSS도 따로 확인합니다. `npm audit fix --force`, 무검토 major 업그레이드, 근거 없는 overrides로 숫자만 없애는 방식은 사용하지 않습니다.

Next 16은 `next lint`를 제거하고 Turbopack을 기본으로 사용합니다. 이번에는 **`next dev --webpack`·`next build --webpack`**을 선택해 기존 번들러 경로를 유지합니다. `lint`는 **ESLint 10.14.0 CLI + `@next/eslint-plugin-next` 16.4.6 직접 flat config**로 옮기며 `eslint-config-next` 전체 패키지는 이번 선택에 포함하지 않습니다. 최종 lint 의존성을 포함한 lock을 다시 감사하고 과거 0건 실험을 새 결과로 간주하지 않습니다. [Next 16 전환 안내](https://nextjs.org/docs/pages/guides/upgrading/version-16)

이미지 설정은 **기존과 동일한 호스트의 `remotePatterns`**로 옮기고 **`search` 키는 지정하지 않습니다.** `search: ''`는 Notion 업로드 이미지의 서명 쿼리를 거부할 수 있기 때문입니다. 허용 호스트를 새로 늘리지 않으며 프로토콜·포트·경로의 실제 제약은 기존 정상 주소와 대조합니다. 일반 `img` 카드의 직접 표시와 보존된 Next Image 설정을 혼동하지 않습니다. [이미지 설정 안내](https://nextjs.org/docs/pages/api-reference/components/image)

Next 설정의 최상위 **`agentRules: false`**를 선택해 개발 서버가 기존 `AGENTS.md`에 자동 관리 블록을 추가·수정하지 않도록 합니다. 이는 프로젝트 규칙을 없애거나 보안 검사를 우회하는 설정이 아닙니다. [공식 agentRules 안내](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules)

독립 프로젝트의 파일 추적 범위는 `outputFileTracingRoot: __dirname`으로 고정합니다. 부모 사용자 폴더의 다른 lock을 이 프로젝트의 작업 범위로 해석하지 않게 하며 모노레포 전체를 포함하는 변경으로 확대하지 않습니다.

시스템 Node 22.23.1과 기존 서버 모듈은 그대로 두며 독립 설치본의 실행 결과를 검증합니다. Vercel의 Node major·Notion 환경변수도 이번 패키지 수정과 함께 바꾸지 않습니다.

### 4. 회귀 검증 후 Preview와 운영 순서로 확인

| 범위 | 통과 기준 |
| --- | --- |
| 의존성 | 깨끗한 npm ci, Windows·Linux의 실제 설치 트리, 전체·prod npm audit 재검사, 치명적 3건의 수정 범위 충족 |
| 자동 검사 | 수정 전 62개 테스트와 관련 추가 회귀 검사, 새 lint와 Webpack 프로덕션 빌드의 실제 결과 확인 |
| 데이터 상태 | 무설정 홈·목록 0개와 예시 `/preview` 3개 구분, 실제 빈 DB·부분 설정·API 오류를 가짜 정상 데이터로 숨기지 않음 |
| Notion 연동 | 기존 읽기 연결·현재 DB·단일 데이터 소스 자동 탐색, 7개 조회와 한국어 원본·영문 상세 7개의 선택/복귀 유지, 원본 응답·인증값 클라이언트 노출 없음 |
| 홈·목록 | 한영 홈·목록에서 WISEOP → 파주 → 이케이시스, 파주 2026.02–2026.05, 표지 7개 지연 로드·전체 비율, 검색·분야·정렬·0건 초기화·연락 동선 유지 |
| 화면 | 데스크톱·360px·320px, 라이트·다크, 한영 가독성·가로 넘침·키보드 동선과 언어 전환의 query·해시 유지 |
| OG·메타 | 딥그린 PNG·OG/Twitter 메타·언어별 제목/설명/alt·canonical/hreflang/noindex와 `activeImage` 한 곳의 밝은 안 전환 유지 |
| 보관·보조 경로 | `/archive` Lottie 실제 재생·테마·기존 메타, 한영 `/preview`, `/preview/og`, `/gallery`·`/about-me`·404·API와 기존 redirect 3개 확인 |
| ISR·파일 | 격리 응답·테스트 데이터의 표시 속성 변경 후 재생성, 조회 실패 시 기존 성공 페이지 유지, Notion 커버 URL 갱신, 일반 이미지와 필요한 최적화 경로 확인. 실제 DB 쓰기로 검증 범위를 확대하지 않음 |
| 배포·GitHub | Linux Preview에서 위 항목 확인 후 승인 범위의 운영 전환, 실제 커밋·연결·도메인 확인, 최초 46개 목록을 출발점으로 현재 Dependabot 재조회·남은 사유 기록 |

빌드·HTTP·실제 브라우저·인증된 Notion 조회를 구분해 현재 상태에 기록합니다. Preview·운영 배포는 사용자 승인 범위에서 별도로 진행하며 탭·창과 다른 프로젝트의 서버는 닫지 않습니다.

### 5. 복구 기준

설치·빌드·표지·검색·테마·Lottie·Notion 조회·ISR 중 기존 동작이 깨지면 운영 전환을 보류하고 해당 변경만 조정합니다. 이미 운영에 반영한 경우에는 직전 정상 배포를 유지·복구할 수 있도록 보존합니다. Git 과거 이력 재작성, DB 복제·이전, 토큰 재발급·공개 범위 변경을 패키지 복구 수단으로 사용하지 않습니다. 프레임워크 보안 검사를 우회해 배포하지 않습니다.

## 경고 46건별 분류

아래는 **최초 `abd6fe1` 확인 당시** 열린 목록과 초기 분류입니다. 당시의 조건 미사용 판단을 현재 소스 전체에 그대로 적용하지 않으며, 달라진 i18n 등은 이번 재검토에 반영합니다. 경고 무시·종료를 실행한 상태가 아닙니다. N은 Next·이미지·캐시 수정, B는 빌드·전이 의존성 수정 단계에 포함한다는 뜻입니다.

| 번호 | 등급 | 패키지 | 문제와 현재 확인 범위 | 단계 |
| --- | --- | --- | --- | --- |
| [7](https://github.com/choichoi123/nextport/security/dependabot/7) | 치명적 | next | middleware 인증 우회. 현재 middleware 없음, Vercel 보호 명시 | N |
| [93](https://github.com/choichoi123/nextport/security/dependabot/93) | 치명적 | next | SVG 이미지 RCE. 운영 이미지 처리 조건 우선 확인 | N |
| [85](https://github.com/choichoi123/nextport/security/dependabot/85) | 치명적 | next | AVIF 이미지 RCE. Vercel 플랫폼 완화와 자체 호스팅 구분 | N |
| [98](https://github.com/choichoi123/nextport/security/dependabot/98) | 높음 | source-map-js | 소스맵 처리 서비스 거부. Next·CSS 도구 전이 경로 | N+B |
| [71](https://github.com/choichoi123/nextport/security/dependabot/71) | 높음 | next | rewrites SSRF. 현재 사용자 정의 rewrites 없음 | N |
| [69](https://github.com/choichoi123/nextport/security/dependabot/69) | 높음 | next | Server Actions 서비스 거부. 현재 해당 기능 없음 | N |
| [91](https://github.com/choichoi123/nextport/security/dependabot/91) | 높음 | next | Server Actions 서비스 거부. 현재 해당 기능 없음 | N |
| [79](https://github.com/choichoi123/nextport/security/dependabot/79) | 높음 | nanoid | 크기 0의 사용자 정의 생성기 무한 루프. CSS 전이 경로 | N+B |
| [77](https://github.com/choichoi123/nextport/security/dependabot/77) | 높음 | nanoid | 음수 크기의 비보안 생성기 무한 루프. CSS 전이 경로 | N+B |
| [4](https://github.com/choichoi123/nextport/security/dependabot/4) | 높음 | next | 권한 우회. 현재 middleware 인증 흐름 없음 | N |
| [59](https://github.com/choichoi123/nextport/security/dependabot/59) | 높음 | brace-expansion | 괄호 확장 CPU 소진. 개발 파일 탐색 경로 | B |
| [10](https://github.com/choichoi123/nextport/security/dependabot/10) | 높음 | braces | 괄호 확장 자원 소진. Tailwind의 파일 탐색 경로 | B |
| [53](https://github.com/choichoi123/nextport/security/dependabot/53) | 높음 | next | Pages i18n middleware 우회. 초기에는 두 설정 모두 없었으나 현재 i18n 있음·middleware 없음으로 재점검 | N |
| [83](https://github.com/choichoi123/nextport/security/dependabot/83) | 높음 | browserslist | 신뢰하지 않는 통계 파일 처리. 빌드 경로 | B |
| [73](https://github.com/choichoi123/nextport/security/dependabot/73) | 높음 | postcss | CSS 소스맵 주석을 통한 파일 읽기. 루트·Next 내부 확인 | N+B |
| [35](https://github.com/choichoi123/nextport/security/dependabot/35) | 높음 | minimatch | glob 정규식 자원 소진. 개발 파일 탐색 경로 | B |
| [74](https://github.com/choichoi123/nextport/security/dependabot/74) | 높음 | postcss | 소스맵 경로 순회. 루트·Next 내부 확인 | N+B |
| [49](https://github.com/choichoi123/nextport/security/dependabot/49) | 높음 | next | Server Components 서비스 거부. 현재 Pages Router | N |
| [47](https://github.com/choichoi123/nextport/security/dependabot/47) | 높음 | next | Server Components 서비스 거부. 현재 Pages Router | N |
| [32](https://github.com/choichoi123/nextport/security/dependabot/32) | 높음 | next | RSC 요청 역직렬화 서비스 거부. 현재 Pages Router | N |
| [81](https://github.com/choichoi123/nextport/security/dependabot/81) | 높음 | nanoid | 정수 처리 오류. CSS 전이 경로 | N+B |
| [42](https://github.com/choichoi123/nextport/security/dependabot/42) | 보통 | next | 이미지 디스크 캐시 소진. 최적화 경로 점검 | N |
| [26](https://github.com/choichoi123/nextport/security/dependabot/26) | 보통 | next | middleware redirect SSRF. 현재 해당 기능 없음 | N |
| [65](https://github.com/choichoi123/nextport/security/dependabot/65) | 보통 | next | Edge Server Action 과대 입력. 현재 해당 기능 없음 | N |
| [63](https://github.com/choichoi123/nextport/security/dependabot/63) | 보통 | next | 내부 Server Function 경로 노출. 현재 해당 기능 없음 | N |
| [40](https://github.com/choichoi123/nextport/security/dependabot/40) | 보통 | next | rewrites 요청 스머글링. 현재 사용자 정의 rewrites 없음 | N |
| [76](https://github.com/choichoi123/nextport/security/dependabot/76) | 보통 | postcss | 소스맵 파일 읽기 불완전 수정. 루트·Next 내부 확인 | N+B |
| [61](https://github.com/choichoi123/nextport/security/dependabot/61) | 보통 | next | 잘못된 UTF-8 요청 본문의 캐시 혼동. ISR·서버 경로 재검증 | N |
| [22](https://github.com/choichoi123/nextport/security/dependabot/22) | 보통 | next | 이미지 캐시 키 혼동. 최적화 경로 점검 | N |
| [51](https://github.com/choichoi123/nextport/security/dependabot/51) | 보통 | next | beforeInteractive 스크립트 XSS. 현재 해당 스크립트 없음 | N |
| [58](https://github.com/choichoi123/nextport/security/dependabot/58) | 보통 | postcss | CSS 문자열 출력 XSS. 현재 외부 사용자 CSS 처리 없음 | N+B |
| [67](https://github.com/choichoi123/nextport/security/dependabot/67) | 보통 | next | 본문 있는 요청의 캐시 혼동. ISR·서버 경로 재검증 | N |
| [57](https://github.com/choichoi123/nextport/security/dependabot/57) | 보통 | next | 이미지 최적화 서비스 거부. 경로 점검 | N |
| [30](https://github.com/choichoi123/nextport/security/dependabot/30) | 보통 | next | remotePatterns 이미지 처리 서비스 거부. 자체 호스팅 조건 구분 | N |
| [94](https://github.com/choichoi123/nextport/security/dependabot/94) | 보통 | postcss-selector-parser | 선택자 파싱 CPU 소진. 빌드 전이 경로 | B |
| [8](https://github.com/choichoi123/nextport/security/dependabot/8) | 보통 | postcss | CSS 개행 해석 오류. 루트·Next 내부 확인 | N+B |
| [5](https://github.com/choichoi123/nextport/security/dependabot/5) | 보통 | next | Server Actions 서비스 거부. 현재 해당 기능 없음 | N |
| [87](https://github.com/choichoi123/nextport/security/dependabot/87) | 보통 | brace-expansion | 괄호 재작성 CPU 소진. 개발 파일 탐색 경로 | B |
| [45](https://github.com/choichoi123/nextport/security/dependabot/45) | 보통 | picomatch | glob 메서드 주입. 개발 파일 탐색 경로 | B |
| [2](https://github.com/choichoi123/nextport/security/dependabot/2) | 보통 | next | 이미지 최적화 서비스 거부. 경로 점검 | N |
| [3](https://github.com/choichoi123/nextport/security/dependabot/3) | 보통 | nanoid | 비정수 크기에서 예측 가능한 결과. CSS 전이 경로 | N+B |
| [24](https://github.com/choichoi123/nextport/security/dependabot/24) | 보통 | next | 이미지 콘텐츠 주입. 최적화 경로 점검 | N |
| [28](https://github.com/choichoi123/nextport/security/dependabot/28) | 낮음 | next | 캐시 경쟁으로 인한 오염. Pages 캐시 경로 재검증 | N |
| [55](https://github.com/choichoi123/nextport/security/dependabot/55) | 낮음 | next | middleware/proxy redirect 캐시 오염. 해당 흐름은 없으며 일반 redirect 3개와 구분 | N |
| [14](https://github.com/choichoi123/nextport/security/dependabot/14) | 낮음 | next | 개발 서버 origin 검사. 운영 서버와 개발 서버 노출 구분 | N |
| [9](https://github.com/choichoi123/nextport/security/dependabot/9) | 낮음 | next | cache-control 누락. CDN·ISR 응답 재검증 | N |

## 이번 단계의 산출물과 한계

최초 `abd6fe1` 단계에서 완료한 범위는 GitHub 경고 열람, 소스·lock 분석, 공식 공지·지원 정책 확인, 격리된 lock-only 해석·감사와 계획 작성입니다. 당시 실험 원문은 저장소 밖 Temp에 보관했고 실제 관리 ID·인증값·브라우저 프로필을 복사하지 않았습니다.

이번 재검토에서는 기준을 `ef2948c`로 갱신하고 한영 기능·영문 상세·OG, 버전·lint·설정 선택과 보존 범위를 정리했습니다. 실제 로컬 수정·검증 결과는 현재 상태에 기록하며 시스템 Node·기존 서버 모듈·Notion 연결·Git 이력·배포와 구분합니다.

최종 설치·감사·lint·테스트·빌드·화면·인증된 Notion 조회·Preview·운영 전환·Dependabot 경고 상태는 각 확인 범위를 구분합니다. 적용 직전에는 공지와 잠금 버전을 다시 확인하며 과거 감사 0건이나 문서 갱신만으로 취약점 수정 완료를 선언하지 않습니다.
