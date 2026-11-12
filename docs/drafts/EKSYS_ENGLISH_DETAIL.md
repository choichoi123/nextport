# EKSYS Website Redesign 영문 상세 초안

기준일: **2026-11-12 KST**. 최신 [한국어 Notion 원문](https://app.notion.com/p/fba4c6db16758282868481b2e939c83b)과 확정 영문 카드 표현을 기준으로 작성했습니다. 아래 A는 공개용 본문이고 B는 편집자용 대조입니다. 실제 미디어 참조는 저장소 밖 복사용 본문에만 보존하며, 이 문서에서는 번호·영문 캡션으로 표시합니다.

## A. 공개용 영문 본문

### 01. Overview

The EKSYS company website was redesigned from an earlier static website into a React-based responsive site. The work described in the project covers the homepage's full-page scrolling interaction, company information, product information, and directions.

| Item | Scope |
| --- | --- |
| Period | 15 July–30 August 2024 |
| Project | EKSYS company website redesign |
| Listed technologies | JavaScript, React, Node.js |

### 02. Problem and Constraints

The redesign replaced the earlier static presentation with a responsive website. Its scope combined a distinct scrolling interaction on the homepage with pages for company, product, and location information.

### 03. Site Structure and Implementation Scope

The documented screens include the homepage, company information, product information, and directions. The homepage has a custom full-page scrolling implementation written in JavaScript rather than using fullPage.js.

Company, product, and location pages form the information structure around the homepage.

### 04. Implementation and Technical Decisions

#### A custom full-page homepage

Full-page scrolling was implemented in JavaScript without fullPage.js. The retained recording shows the homepage interaction as part of the responsive redesign.

**Video 01**

*Homepage recording showing the custom full-page scrolling interaction. The original Korean interface is retained.*

#### Company, product, and location information

The following retained screenshots show the company-history page, the main product-information page, and directions. The screenshots keep their original Korean interface.

**Image 01**

*Company overview: the history page in the redesigned Korean website.*

**Image 02**

*Product overview: the main product-information page in the redesigned Korean website.*

**Image 03**

*Directions page in the redesigned Korean website.*

### 05. Outcomes and Verification

The project produced a responsive React website covering the homepage, company information, product information, and directions. The retained screenshots document those page layouts, while the homepage recording demonstrates the custom scrolling interaction.

### 06. References

[Company website](https://www.eksys.co.kr/)

The screenshots and homepage recording retain the original Korean interface.

## B. 편집자용 대조 — Notion 공개 본문에서 제외

| 대조 항목 | 한국어 원문 근거 | 영문 반영 |
| --- | --- | --- |
| 프로젝트 구분 | 본문 첫 소개·현재 Description | 회사 홈페이지 리뉴얼로만 설명. SET-AI 소개와 혼합하지 않음 |
| 기간 | 현재 WorkPeriod | 2024-07-15~2024-08-30 유지. 영상 파일명의 날짜를 참여 기간으로 사용하지 않음 |
| 확인된 구현 | 본문 소개·스크롤 영상·토글 설명 | React 반응형 리뉴얼, 메인 Fullpage Scroll, 회사·제품·오시는 길, fullPage.js 없는 JavaScript 구현을 중립 서술 |
| 개인 기여 | 영상의 직접 개발 메모는 있으나 전체 팀·개인 분담 미상 | 전체 프론트·백엔드·배포를 본인이 모두 담당했다는 문장을 추가하지 않음 |
| 선택 이유·검증 | 원문에 구체적인 대안 평가·테스트 결과가 없음 | 라이선스·성능·번들 크기·비용을 이유로 꾸미지 않고 실제 구현과 자료 수준만 서술 |

### 미확인 사항 — 공개 본문에 복사하지 않음

- 팀 구성과 리뉴얼 전체에서 본인이 담당한 정확한 범위.
- fullPage.js를 사용하지 않은 당시 의사결정 이유.
- 지원 기기·브라우저, 접근성·반응형 QA, 운영 반영·성과를 확인하는 근거.
- 영상 파일에 포함된 촬영일의 의미. 이 날짜는 참여 기간과 구분합니다.

### 이미지와 영상 대응

| 원문 순서 | 영문 위치 | 영문 캡션의 범위 |
| --- | --- | --- |
| 영상 1 | 커스텀 메인 스크롤 사례 | 기존 메인 스크롤 동작 기록. 한국어 UI 유지 |
| 사진 1 | 회사·제품·위치 정보 사례 | 회사소개·연혁 |
| 사진 2 | 회사·제품·위치 정보 사례 | 제품소개 메인 화면 |
| 사진 3 | 회사·제품·위치 정보 사례 | 오시는 길 |

- 원문 사진 3장과 영상 1개를 모두 유지했습니다. 실제 참조는 저장소 밖 복사용 본문에만 보관하고 이 문서에는 번호와 캡션만 표시합니다.
- 영문 공개 본문은 중립적인 프로젝트·구현 설명입니다. 부족한 개인 역할·선택 이유·성과를 채워 넣지 않았습니다.
- 새 이미지·영상·기기 검증·서비스 접속을 수행하지 않았습니다. 공개 후 실제 미디어 로드 확인은 별도입니다.
