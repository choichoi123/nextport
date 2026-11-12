# Busan WISEOP — Accessible Mobility Operations Web System 영문 상세 초안

기준일: **2026-11-12 KST**. 최신 [한국어 Notion 원문](https://app.notion.com/p/4144c6db16758078a2c5d4f55a1ba51c)과 확정 영문 카드 표현을 기준으로 작성했습니다. 아래 A는 공개용 본문이고 B는 편집자용 대조입니다. 실제 미디어 참조는 저장소 밖 복사용 본문에만 보존하며, 이 문서에서는 번호·영문 캡션으로 표시합니다.

## A. 공개용 영문 본문

> **Connecting demand, vehicles, and repositioning in one operations workflow.**

**Image 01**

*Demand distribution, in-service vehicles, and status summaries in one operations view. Captured in the development environment on 10 November 2026; the original Korean interface is retained.*

### 01. Overview

WISEOP is a web application for accessible mobility operations in Busan. It brings demand forecasts and in-service vehicles together on a map, then connects vehicle repositioning plans with execution requests and progress checks.

The work covered both Duribal and voucher-service operations: actual demand analysis, forecasts and repositioning, vehicle information, academic-calendar and event information, forecast reports, and administration screens. The application provides ordinary work screens alongside a separate operations view. Layout and interaction work focused on the information density, readability, and main actions needed by staff using FHD displays.

| Item | Scope |
| --- | --- |
| Period | 20 August–10 November 2026 |
| Development team | 2 people |
| My responsibility | WISEOP frontend and backend, external system integration, and regression testing |

### 02. Problem and Constraints

Operational staff needed a coherent way to read demand and vehicle data received from external systems and use that information when considering repositioning.

The workflow also had to preserve the meaning of its data and status:

- A delayed response, a failed query, and a request whose outcome is not yet known require different follow-up actions.
- Missing data is different from a real count of zero.
- A current forecast is different from historical analysis.
- An accepted request is different from a completed vehicle task.
- Selected areas, vehicles, and plans need to remain understandable when screen size, theme, or panel layout changes.

### 03. My Role and System Context

I was responsible for the web application's frontend and backend, external integrations, and regression testing. This included screen structure, map visualization, asynchronous state handling, business APIs, external response mapping, user and center validation, request tracing, and report exports.

The forecasting model and the external ADAM and Center servers themselves were outside my development scope.

```text
Operations staff's browser
  → WISEOP screens, authentication/authorization, and business APIs
      ├─ MySQL: administration data, menus, and user settings
      ├─ ActiveMQ/JMS: integration with external ADAM and Center systems
      └─ Query results: maps, charts, tables, and Excel exports
```

This is a responsibility diagram, not a claim that every operation calls the external systems in this order.

| Technology | Role in the application |
| --- | --- |
| Java 17, Spring Boot, Spring Security | Business APIs and services, external response mapping, login and sessions, center-level access checks |
| Thymeleaf, Alpine.js, JavaScript | Work screens, common UI structure, selections, and asynchronous state |
| Kakao Maps, H3, ECharts | Vehicle and demand-area visualization, demand and operations charts |
| ActiveMQ/JMS, MySQL, Apache POI | External request/response integration, management data and user settings, Excel exports based on the same query results |
| JUnit and JavaScript automated checks | Regression coverage for response contracts, state transitions, failure paths, and screen behavior |

### 04. Implementation and Technical Decisions

#### Reading demand and vehicles together

I combined Kakao Maps with H3 demand areas and provided heat distribution, hexagons, demand bubbles, and count markers. Staff can switch representations depending on whether they need to compare demand volumes or inspect area-level values.

The interaction checks covered vehicle clicks, right-clicks, keyboard controls, and map movement and zoom.

**Image 02**

*Screen-sized bubbles support comparison of relative demand across areas.*

**Image 03**

*Expected trip counts are shown by area. Dense labels are shortened to keep the map readable.*

#### Connecting web APIs with external operations systems

Browser requests pass through authentication, authorization, and center checks before being connected to JMS request/response handling. External responses are mapped into the models used by the screens.

Tracing links the HTTP and messaging request identifiers across request submission, message receipt, and response interpretation. A successful HTTP response is recorded separately from the outcome of the underlying business command.

#### Separating plans from execution

The repositioning flow is organized into demand review, vehicle and destination selection, plan addition, pre-execution checks and submission, and progress or cancellation checks. It distinguishes request acceptance from actual task completion, and provides follow-up actions for rejections and unknown outcomes.

**Image 04**

*Vehicle and destination selection before feasibility checking and command submission. This screen does not prove that a check passed, a plan was added, or repositioning succeeded. The red dashed line is a straight-line guide, not a road route or an ETA.*

**Image 05**

*An actual query result with no vehicles meeting the recommendation conditions. Exclusion reasons remain available; this is not a comparison of recommended candidates or routes.*

#### Separating menu visibility from server authorization

Menu visibility for operator groups is separate from permission to call business APIs. Showing a menu does not grant the corresponding server permission. Server checks distinguish the logged-in center from the center targeted by an operation.

The report screen and Excel export reuse the same query results, keeping a consistent data basis and reducing repeated external queries during export. Shared elements are reused across ordinary and standalone operations screens. Panel layouts and selections are preserved, while feedback from operations staff informed changes to headers, spacing, summary cards, modals, and manual repositioning areas.

#### Case 1. Keeping plans when the request outcome is unknown

**Problem.** A communication response does not always establish whether an external operation was processed. Staff still need their selections and plan intact before deciding what to do next.

**Implementation.** I separated accepted, explicitly rejected, not-sent, and unknown-outcome states, while retaining selections, plans, and request history. Unknown outcomes are not automatically retried. The user first checks the current task, reruns the latest feasibility check, and then requests a single retry where appropriate. Restricted conditions require an explicit confirmation within the allowed workflow. Before cancellation, the previously checked task is compared with the current task again.

**Verification.** State-specific unit and regression checks, together with simulated-screen checks, covered plan retention, command blocking before confirmation, retry branches, cancellation-target changes, and communication failures. This does not amount to a guarantee that duplicate processing is completely eliminated.

#### Case 2. Preventing late responses from replacing the current view

**Problem.** A previous request may finish after a filter change or navigation, leaving the current selection and displayed data out of step.

**Implementation.** Responses are checked against the request generation, query target, center, and whether the screen has been closed. Only valid responses are applied. On failure, the last successful data and selections are retained, with a distinction between older data and the result of the new request. Timers, observers, charts, and event handlers are cleaned up when the screen closes.

**Verification.** Checks covered reversed response order, restoration after failures, and blocking updates after screen closure. Preventing a stale response from being applied is distinct from aborting the server request itself.

#### Case 3. Preserving missing data, zero results, and failed requests

**Problem.** Replacing a value that the server did not provide with zero hides the difference between missing data and a genuine zero count.

**Implementation.** Response mapping and nullable models preserve missing values. The UI distinguishes a missing value, shown as a dash, from an actual zero. A failed query is not turned into an empty result or a normal state.

**Verification.** The checks distinguish omitted fields, null, actual zero, invalid formats, conflicting response keys, and paths that preserve existing data.

### 05. Outcomes and Verification

The application connects demand and vehicle review with repositioning planning and progress checks in one operations workflow. It preserves plans while distinguishing failures, empty results, missing values, and unknown outcomes so that the user can judge the next action.

Project verification combined Java and JavaScript regression checks with actual map interactions. The recorded scope includes key screens and modals at FHD, QHD, tablet, and mobile sizes, along with theme and panel-layout combinations. Changes to external response contracts and feedback from operations staff were reflected in code, screens, and verification records while improving an application already in use.

Automated checks, simulated screens, and actual map interactions provide different kinds of evidence. The screenshots alone do not establish that every latest change was deployed to Busan production or that a real vehicle completed repositioning. No unmeasured efficiency, performance, or forecast-accuracy improvement is claimed.

### 06. References

The screenshots were captured in the development environment on 10 November 2026. Existing masking of driver names and phone numbers is retained, as is the original Korean UI.

Access to the operational service requires authentication. The work period is 20 August–10 November 2026; the start date follows the first WISEOP V1 work record identified in the project documentation.

## B. 편집자용 대조 — Notion 공개 본문에서 제외

| 대조 항목 | 한국어 원문 근거 | 영문 반영 |
| --- | --- | --- |
| 정체성과 기간 | 개요·말미 작업 기간, 현재 WorkPeriod | 부산 이동지원 관제 웹, 2026-08-20~2026-11-10 유지 |
| 개인·외부 책임 | 03절의 개발 인원·담당 범위 및 예측 모델·ADAM·Center 서버 제외 | 개발 2명과 본인의 웹 프론트·백엔드·연동·검증을 명시. 외부 모델·서버 자체 개발 제외 |
| 상태 의미 | 02·04절 및 기술 사례 1~3 | 결과불명은 확정 실패로 번역하지 않고, 접수와 완료·결측과 0건·오래된 응답 방어와 서버 요청 중단을 구분 |
| 검증 수준 | 05절과 자료의 개발 환경 한계 | 기존 자동·모의·지도 조작 기록으로 표현. 실제 재배치 성공·최신 전체 운영 반영·개선 수치를 추가하지 않음 |
| 관련 자료 | 운영 서비스 로그인 필요·개발 화면 안내 | 인증 필요 조건만 설명하고 운영 호스트는 영문 공개 원고에 복사하지 않음 |

### 이미지 대응

| 원문 순서 | 영문 위치 | 캡션이 보존하는 의미 |
| --- | --- | --- |
| 1 | 본문 시작 대표 화면 | 수요·차량·상태를 통합한 개발 화면, 2026-11-10 |
| 2 | 수요·차량 지도 사례 | 화면 크기 기준 버블로 상대 수요 비교 |
| 3 | 수요·차량 지도 사례 | 지역별 예상 건수와 밀집 라벨 축약 |
| 4 | 계획과 실행 구분 사례 | 선택 단계이며 검사·계획·실행 성공 증거가 아님. 점선은 직선 안내 |
| 5 | 계획과 실행 구분 사례 | 추천 조건 통과 차량 0건의 실제 조회 결과. 추천 경로가 있는 화면이 아님 |

### 확인 사항

- 원문 사진 5장을 같은 순서로 유지했습니다. 실제 참조는 저장소 밖 복사용 본문에 보관하고 이 문서에는 이미지 번호와 영문 캡션만 표시합니다.
- 한국어 UI와 기존 허용·가림 범위는 그대로입니다. 새 캡처·영문 UI 이미지·실행 결과를 만들지 않았습니다.
- 이 초안 준비에서는 기존 Notion 원문을 읽고 의미와 참조를 대조했으며, 이미지 다운로드·브라우저 로드·운영 동작을 새로 확인하지 않았습니다.
