# Paju Accessible Mobility Voucher — Mobile & Admin Frontend 영문 상세 초안

기준일: **2026-11-12 KST**. 최신 [한국어 Notion 원문](https://app.notion.com/p/4154c6db167580b8afebcdc51b0c949f)과 확정 영문 카드 표현을 기준으로 작성했습니다. 아래 A는 공개용 본문이고 B는 편집자용 대조입니다. 실제 미디어 참조는 저장소 밖 복사용 본문에만 보존하며, 이 문서에서는 번호·영문 캡션으로 표시합니다.

## A. 공개용 영문 본문

### 01. Overview

This frontend project connects mobile journeys for Paju's accessible mobility service with administrative member workflows. Users work through registration, address and pickup-location selection, trip requests, and request history in web screens inside the app. Administrators use web screens to search members, link web accounts with center membership records, and manage approval status.

| Item | Scope |
| --- | --- |
| Period | 10 February–29 May 2026 |
| Team | 1 backend developer and 1 frontend developer |
| My responsibility | All user and admin frontends, including integration with backend APIs |
| Technologies | React, JavaScript, Redux Toolkit, React Router, Axios, Kakao Maps |

Working with the backend developer, I implemented the React screens, navigation and membership-state handling, map-based location selection, and presentation of business API requests and responses. This case study covers the initial development phase.

**Image 01**

*Overview assembled from actual early-development captures of trip requests, address selection, and registration. Phone numbers are masked; the original Korean interface is retained.*

### 02. Problem and Constraints

A trip request needs more than a departure address and destination. It also includes the actual pickup location, purpose, wheelchair use, accompanying passengers, and other conditions.

The mobile flow therefore needed to connect address search, map-based location checks, and trip details on a small screen. Search results, map coordinates, and the values submitted to the server had to remain consistent.

Membership introduced a second distinction: logging in with a web account did not by itself establish a link with the center's member record. The frontend needed to explain the user's current state, while the admin screens supported finding web members, linking them to center records, and managing approval status.

### 03. My Role and System Context

I developed the entire frontend for the user mobile WebView and the administrator web application.

| Area | Frontend scope |
| --- | --- |
| User screens | Registration, login, account recovery, profile information, trip requests, history, and favorite places |
| Maps and location selection | Address search, map selection, and an estimated route, distance, and travel time before a request |
| Admin screens | Login, web-member search, center-member linking, and approval-status management |
| State and API integration | Routing, displayed membership state, server-session and center-link checks, and business API requests and responses |

React and JavaScript provide the screens, with React Router connecting user and admin navigation. Redux Toolkit keeps user and admin state separate and connects setting, clearing, and restoring displayed login state after a refresh. Axios is used for existing server APIs, while the Kakao Maps SDK provides map display and location selection.

The React static web build is loaded in the user app's WebView and the administrator's browser, and connected to existing membership, request, and operations APIs. Map interactions run through the web UI and the map SDK.

Membership and request data, final authentication, and authorization remain backend responsibilities. My contribution was the frontend that connects those server states with screens and input flows. Development of the Android/iOS native app, SMS system, and map engine was outside my scope.

### 04. Implementation and Technical Decisions

#### Connecting address search with map selection

The screens let users check a selected address on the map and specify the actual location. When adding a favorite place, the user first chooses an address candidate and then positions the map. Before a trip request, the departure, destination, and estimated route information are presented together.

Server integer coordinates are divided by 360000 to convert them to the latitude/longitude scale used by the map. During selection, reverse geocoding maps the center position back to an address, keeping the chosen coordinates and address together.

The estimated route is drawn only when route-coordinate data exists. Missing route data is not replaced with an arbitrary connecting line presented as a route. Map size and visible bounds are reapplied when screen size or orientation changes.

**Favorite-place address search**

**Image 02**

*An early screen for choosing an address search result before checking its location on the map when adding a favorite place.*

**Favorite-place map selection**

**Image 03**

*An early favorite-place screen for checking an address on the map and specifying its location.*

**Route preview before a request**

**Image 04**

*An early trip-request screen showing the departure and destination with an estimated route, distance, and travel time before submission.*

**Trip details**

The trip-details screen collects purpose, wheelchair use, accompanying passengers, and notes. It connects address and location checks with the conditions required for a request.

**Image 05**

*Trip details in the initial development phase: purpose, wheelchair use, accompanying passengers, and notes.*

#### Separating login from center-member linking

Screen entry checks distinguish login state from whether the user is linked to a center member. Trip requests, request history, and favorite places use both checks.

When entering a protected screen, the frontend checks the server session. If the account is not linked to a center member, it explains the state and returns the user to the home screen. This user flow is separate from the admin login check.

The administrator interface provides member search, status filters, and pagination. It connects selecting web and center members, requesting a link, placing a request on hold, rejecting it, and cancelling that action to restore a pending state with the existing APIs. After feedback is shown, the list is queried again.

These screens connect the user's service state and the administrator's membership workflow to the same server state. Frontend entry checks provide guidance and navigation; the server retains final control of access and approval decisions.

#### Adjusting address and map modals for iOS 12

During initial development, the address and map modals had proportion issues on iOS 12. The implementation adjusted the rendering structure and position/height styles while keeping the existing map-selection flow.

Selection state was separated from the address list, and the map modal was rendered outside that list. Explicit positioning on all four sides, width, height, internal layout, and overflow styles were added, alongside WebKit height and scroll adjustments.

The changes are documented in the code record dated 28 May 2026. The evidence establishes the code changes, not separate device reproduction or post-fix QA across all older devices.

### 05. Outcomes and Verification

The implemented frontend connects registration, address selection, trip requests, and history for users with the administrator's membership screens. The core contribution is connecting mobile input, map selection, and state-dependent navigation to the existing APIs.

The initial-development source contains coordinate conversion, address selection, conditional route display, and login and center-link checking. The retained development and test captures show address-candidate selection, map positioning, route previews, and the request-history UI. The iOS 12 modal work is supported by the initial-phase code record; separate device reproduction and post-fix QA results are not established by that record.

**Image 06**

*The request-history screen showing status and request information in the development and test environment. Contact numbers are masked.*

### 06. References

The images are actual screens from the March 2026 development and test phase. The institution name, logo, addresses, and original Korean UI are retained; personal and center phone numbers remain masked.

These materials illustrate the frontend at that stage. They do not establish the current production deployment or successful SMS verification, completed registration, request submission, dispatch, or cancellation.

## B. 편집자용 대조 — Notion 공개 본문에서 제외

| 대조 항목 | 한국어 원문 근거 | 영문 반영 |
| --- | --- | --- |
| 정체성과 기간 | 개요의 참여 표·현재 WorkPeriod | 2026-02-10~2026-05-29, 백엔드 1명·프론트엔드 1명, 초기 개발 범위 유지 |
| 개인 책임 | 03절 전체 프론트엔드·상태·서버 연동 설명 | 이용자·관리자 프론트 전체와 API 통합을 명시. 최종 데이터·인증·인가는 백엔드, 네이티브 앱·SMS·지도 엔진은 제외 |
| 주소·지도 사례 | 04절 첫 사례 | 360000 좌표 스케일, 역지오코딩, 경로 데이터가 있을 때만 선 표시, 화면 크기·회전 대응 유지 |
| 회원 연동 사례 | 04절 두 번째 사례 | 로그인과 센터 연동을 구분하고 관리자 처리 후 재조회. 프론트 안내와 서버 최종 판정 구분 |
| iOS 12 | 04절 세 번째 사례·05절 | 2026-05-28 코드 기록 근거. 별도 실기기 재현·수정 후 QA 및 모든 구형 기기 검증으로 확대하지 않음 |
| 자료 수준 | 06절·기존 캡션 | 2026년 3월 개발·테스트 화면, 전화번호 가림, 현재 운영·실제 전송/배차 성공의 증거가 아님 |

### 이미지 대응

| 원문 순서 | 영문 위치 | 캡션이 보존하는 의미 |
| --- | --- | --- |
| 1 | 개요 | 접수·주소 선택·가입의 실제 캡처 기반 개요 |
| 2 | 주소·지도 입력 사례 | 자주가는곳 주소 후보 선택 |
| 3 | 주소·지도 입력 사례 | 주소의 지도 확인과 장소 지정 |
| 4 | 주소·지도 입력 사례 | 접수 전 예상 경로·거리·시간 |
| 5 | 주소·지도 입력 사례 | 이용목적·휠체어·동승자·비고 |
| 6 | 결과와 검증 | 개발·테스트 당시 접수 상태·요청 정보, 연락처 가림 |

### 확인 사항

- 사진 6장의 순서와 기존 가림을 유지하고 영문 캡션만 작성했습니다. 실제 화면 자체는 번역·재생성하지 않았습니다.
- 9월 관리자·OTP 개선 등 후속 유지보수는 넣지 않았습니다. 코드 기록을 이 초안에서 새로 실행한 테스트나 실기기 QA로 표현하지 않습니다.
- 원문과 사진 참조를 대조한 문서 작업입니다. 이미지 다운로드·브라우저 로드·운영 동작 확인은 별도입니다.
