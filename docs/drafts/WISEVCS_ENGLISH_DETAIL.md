# WISEVCS 영문 카드와 상세 원고

기준일: **2026-11-13 KST**. 최신 [한국어 Notion 원문](https://app.notion.com/p/4164c6db16758142be7dea1961187d63)을 기준으로 작성했습니다. A는 같은 DB 행에 넣을 영문 카드 필드, B는 별도 영문 상세 본문, C는 공개 본문에서 제외할 대조 사항입니다. 실제 이미지 참조는 저장소 밖 복사용 본문에서만 사용하며 이 문서에는 번호와 캡션을 표시합니다.

## A. 영문 카드

**NameEn**

WISEVCS — Operator Trip Requests & Real-Time Operations Frontend

**DescriptionEn**

The company's first project to bring operator trip-request handling from its existing operations program to the web. I built the full frontend and combined WebSocket change notifications with an HTTP-backed cache to update request history.

**RoleEn**

Full frontend development, backend API integration, and WebSocket event handling.

**DetailUrlEn**

[WISEVCS 영문 상세](https://app.notion.com/p/4174c6db167581e185fcd35c03327e1d). 이미지·캡션·읽기 공개·비로그인 열람을 확인한 뒤 입력하며 기존 한국어 상세와 `WorkPeriod`는 유지합니다.

## B. 공개용 영문 본문

> **Bringing operator trip requests to the browser, with real-time updates to request history.**

### 01. Overview

WISEVCS is a web application for operators who find customers, enter addresses and trip requirements, submit trip requests, and check their progress. It was the company's first project to move operator trip-request handling from its existing operations program to the web.

| Item | Scope |
| --- | --- |
| Period | 25 August 2025–22 May 2026 |
| Development team | 1 backend developer and 1 frontend developer (me) |
| My responsibility | Full frontend development, backend API integration, and WebSocket event handling |
| Core technologies | React, JavaScript, WebSocket, STOMP, SockJS, AG Grid, Redux Toolkit, Kakao Maps |

I was responsible for the full frontend: React screens, routing, shared state, business API integration, WebSocket event handling and request-list updates, member forms, and map interactions.

**Image 01**

*The operator request screen brings customer details, origin and destination, and trip requirements together with a map.*

### 02. Problem and Constraints

Moving this workflow to the web required more than customer search, request forms, and member information. Changes to request status on the server also had to reach the screen the operator was using.

During development, unstable server connections led to overlapping socket connection attempts. The request list was also being fetched again over HTTP whenever a WebSocket notification arrived. The frontend needed to incorporate new and changed requests while keeping search and infinite scrolling usable, and reconcile the different formats returned by HTTP queries and real-time messages.

Repeated searches, selections, and data entry also exposed inconsistencies between header and page state, along with interactions between member-modal rendering and form input.

### 03. My Role and System Context

I implemented the full web frontend, coordinating business API and real-time message contracts with the backend developer.

| Area | My contribution |
| --- | --- |
| Trip requests and history | Customer and date searches, new requests, reuse of previous request details, status and history views, and cancellation UI |
| Real-time events | SockJS and STOMP connection handling, event distribution, message parsing, cache merging by request ID, and grid updates |
| Shared state | Login-state checks, header and sidebar, and shared search text, selected customer, and selected request |
| Members and maps | Existing-member lookup and selection, view/create/edit flows, address and map selection, and vehicle-location display |

Queries, request submission, and cancellation use **HTTP APIs**. Server notifications about request changes arrive over **WebSocket**. The frontend connects these two paths within the operator's workflow.

```text
Operator's browser
  ├─ HTTP APIs → customer and request queries / request submission and cancellation
  └─ WebSocket events → message parsing → cache merging by request ID → list updates
```

React and React Router provide screen navigation, while Redux Toolkit holds authentication-related UI state. SockJS, STOMP, and an event bus handle real-time events; AG Grid displays the request list; Axios connects business APIs; and Kakao Maps supports map interactions.

### 04. Implementation and Technical Decisions

#### Case 1. Managing connection attempts and reconnection in a shared module

To address overlapping socket connections after server problems or disconnections, I moved connection handling into a shared module that manages a single client, rather than creating a connection for each screen.

The module checks connected, active, and in-progress states before activation. I configured STOMP reconnection and heartbeat traffic in both directions. When a connection is established again, subscriptions are set up, and connection, disconnection, and error states are distributed as events for the screens.

The list screen subscribes to these shared events and removes its listeners when the user leaves. **Separating the connection lifecycle from the screen lifecycle** gives connection management and screen updates distinct responsibilities.

#### Case 2. Merging an HTTP baseline with WebSocket changes

HTTP queries returned object-based rows, while real-time notifications carried request data in arrays. I added a parser that converts incoming messages into the row structure used by the screen, then applies **inserts, updates, and deletions by request ID**.

The cache stores the HTTP baseline separately from rows received through WebSocket and merges them without duplicating the same request. Additional HTTP pages are fetched when the range requested by the screen is not available in the cache.

Changing search conditions resets the cache, while WebSocket events refresh AG Grid blocks that have already been loaded. This structure brings **real-time changes, search, and infinite scrolling together**, reducing the need to fetch the entire list for every notification.

**Image 02**

*The history view shows requests and their status by customer and date, with follow-up actions for the selected request.*

#### Case 3. Separating rendering responsibilities in member forms and shared state

The common layout manages header search text, the selected customer, and the selected request so that pages share a consistent state. Search resets and navigation use that same state.

The member screen distinguishes view, create, and edit modes. I changed the additional-settings modal structure to avoid recreating its internal component on every input change. Administrative-code queries and customer synchronization run in effects or event handlers rather than in the render body, and request keys suppress repeated requests for the same area.

I also handled prioritizing the search field the user clicked, selecting the intended customer when multiple records share the same name, **container queries based on the actual form width** after the sidebar takes its space, and creating maps after the SDK is ready.

**Image 03**

*The member screen brings basic details and addresses into view, with create, edit, and additional-settings actions.*

**Image 04**

*The customer-selection dialog lets the operator choose an existing customer from search results and apply that record to the member form.*

### 05. Outcomes and Verification

I implemented the operator trip-request workflow as a web frontend and connected WebSocket change notifications to the flow from customer search through request submission and history review.

The core implementation brings **different HTTP and real-time data formats, connection state, list caching, and screen selections** together. This case study focuses on implemented behavior and problems encountered during development; it does not claim unmeasured latency, productivity, or recovery-rate improvements.

### 06. References

The cover is a conceptual illustration of HTTP business requests and WebSocket change notifications. It is not a service screenshot or evidence of live behavior.

The four screenshots show the request-and-map screen, request history, member information, and existing-customer selection. They explain the screen structure; they do not establish that real-time event delivery or reconnection succeeded. A real-time demonstration video and public repository link can be added when available. The original Korean interface is retained.

Read the original case study in Korean: [WISEVCS 운영자 웹 접수·실시간 관제 프론트엔드](https://app.notion.com/p/4164c6db16758142be7dea1961187d63).

## C. 편집자용 대조 — Notion 공개 본문에서 제외

| 항목 | 원문 근거와 유지 범위 |
| --- | --- |
| 회사 최초 | 기존 관제 프로그램의 운영자 접수를 웹으로 전환한 최초 프로젝트. 회사 최초 웹서비스 전체나 관제 프로그램 전체 대체로 확대하지 않음 |
| 기간·인원 | `WorkPeriod` 2025-08-25–2026-05-22, 백엔드 1명·프론트엔드 본인 1명. 새 수정일·촬영일로 바꾸지 않음 |
| 개인 범위 | 프론트엔드 전체와 업무 API·WebSocket 수신 연동. 백엔드 서버·프로토콜 전체 개발로 확대하지 않음 |
| HTTP·WebSocket | 업무 조회·등록·취소는 HTTP, 서버 변경 알림은 WebSocket. WebSocket으로 접수를 전송한다고 서술하지 않음 |
| 사례 1 | 단일 클라이언트와 상태 확인, STOMP 재연결·heartbeat, 화면 이벤트 해제. 중복·누락의 완전 제거 보장은 하지 않음 |
| 사례 2 | 배열 메시지 파싱, ID별 추가·갱신·삭제, HTTP 기준과 push 캐시 병합, 로드 블록 갱신. 처리량·지연 개선 수치 없음 |
| 사례 3 | 공통 상태, 입력 시 컴포넌트 재생성 방지, effect/이벤트 분리, 요청키 중복 억제, container query·SDK 준비 순서 |
| 사진 4장 | 한국어 원문의 최신 QHD 이미지를 순서·파일 그대로 재사용하고 영문 캡션만 추가. Image 01은 출발·도착 깃발과 21점 촬영용 예시 경로를 넣은 최신 사진으로 교체하며 실제 경로 API·주행 검증과 구분. 지도 이미지의 실제 Kakao 표시 유지 |
| 검증 경계 | 기존 구현과 개발 중 문제를 소개. 이번 번역·브라우저 검증을 실서버 접수·재연결·운영 검증으로 표현하지 않음 |

공개 Notion에는 A의 카드 필드와 B 본문만 반영합니다. B의 Image 번호를 실제 이미지 블록으로 치환하고 한국어 복귀 링크는 native mention으로 연결합니다. 영문 상세는 기존 방식의 일반 페이지이며 DB 행·스키마를 늘리지 않습니다. 토큰·관리 ID·임시 서명 URL·편집자 대조는 공개 본문과 이 파일에 넣지 않습니다. 반영·공개·로컬 검증 상태는 [현재 상태](../CURRENT_STATE.md)에 기록합니다.
