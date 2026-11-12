# SET-AI 영문 상세 초안

기준일: **2026-11-12 KST**. 공식 Notion 연결에서 최신 한국어 본문과 속성을 읽어 작성한 로컬 초안입니다. 이 문서 작성으로 Notion 본문·속성·공개 범위·사이트 연결을 변경하지 않았습니다.

## 1. 제목과 작성 범위

**영문 페이지 제목:** SET-AI — AI-Based Systems Engineering Tool

기존 `NameEn`·`DescriptionEn`을 출발점으로 사용했습니다. 체계공학 도구의 목적·개념 설계 시연과 원문 toggle의 세 기술 작업을 설명하고 본문 이미지 5장을 모두 대응시켰습니다. 2절의 이미지 번호와 영문 캡션은 배치 표식이며, 실제 이미지 참조가 아닙니다. 기존 첨부의 정확한 재사용 참조는 저장소 밖 Notion용 원고에만 보관합니다.

## 2. 공개용 영문 본문

### Overview

SET-AI is an AI-based systems engineering tool developed to support the systems engineering (SE) process, a standard methodology for developing defense systems. The project included a conceptual design demonstration for a military satellite communications system.

| Item | Details |
| --- | --- |
| Project period | 2020-09-14–2021-05-31 |
| Product | Software supporting the systems engineering process |
| Demonstration | Conceptual design of a military satellite communications system |

> **Image 01** — SET-AI main interface.

> **Image 02** — SET-AI project interface.

### Diagram Features and Implementation

#### Automatic Item Layout

The Action Diagram workspace includes an automatic layout algorithm for the light-green Item elements. When multiple Items are created, the algorithm arranges them to fit the overall diagram.

> **Image 03** — Creating an Action Diagram and its flow diagram in SET-AI.

#### Action Diagram to N2 Chart Conversion

An Action Diagram can be converted through its context menu using the N2 Chart conversion command. Actions appear along the diagonal, while Items are placed at the intersections between the corresponding Action rows and columns.

> **Image 04** — Converting an Action Diagram to an N2 Chart.

#### Action Diagram to IDEF0 Diagram Conversion

In the IDEF0 Diagram view, Actions are arranged diagonally, as in the N2 Chart view. Blue and red arrows represent Items, and the Performer is shown at the bottom.

The arrow-layout work separates incoming and outgoing directions and distributes the arrows to avoid overlaps.

> **Image 05** — Converting an Action Diagram to an IDEF0 Diagram.

### Technology

React, JavaScript, Node.js, Express, MongoDB, Google Cloud Platform (GCP), and mxGraph.

### References

- [Project repository](https://github.com/SET-AI/SELAB_V1)

## 3. 편집자용 원문 대조

이 절부터는 공개 본문에 복사하지 않습니다.

| 한국어 근거 | 영문 반영 | 판단 |
| --- | --- | --- |
| 국방체계의 표준 개발 방법론인 체계공학 프로세스를 지원하는 도구 개발 | Overview의 목적 설명 | 확정된 영문 카드 설명과 일치 |
| 군위성통신시스템에 대한 개념설계 시연 | conceptual design demonstration for a military satellite communications system | 시연을 운영 배포·군 시스템 운영 실적으로 바꾸지 않음 |
| Item(연두색)의 자동 정렬 알고리즘 개발, 여러 Item을 전체 다이어그램과 조화롭게 배치 | Automatic Item Layout | 자동 배치 동작을 설명하고 최적화 수치·복잡도·효율 성과는 추가하지 않음 |
| 우클릭 후 N2 Chart 전환, Action 대각선·Item 교차 위치 | Action Diagram to N2 Chart Conversion | 조작과 배치 규칙을 보존 |
| IDEF0의 Action 대각선, Item 화살표, 하단 Performer, 입출력 방향·겹침 방지·균등 배치 | Action Diagram to IDEF0 Diagram Conversion | 화살표 배치 작업의 의미를 보존하며 공식 표준 적합성 검증으로 확대하지 않음 |
| React, JavaScript, NodeJs, Express, MongoDB, Google Cloud Platform(GCP), Mxgraph | Technology의 통용 표기 | 기술별 개인 담당·도입 이유는 추가하지 않음 |
| WorkPeriod 시작·종료 | 2020-09-14–2021-05-31 | 조회한 원래 날짜를 그대로 사용 |

## 4. 이미지 순서와 캡션 대조

본문 이미지는 기존 순서 5장을 모두 대응시킵니다. 프로젝트 커버는 본문 이미지 수에 포함하지 않습니다.

| 번호 | 원문 캡션 | 영문 캡션 | 영문 배치 |
| --- | --- | --- | --- |
| 01 | SET-AI의 메인 화면 | SET-AI main interface. | Overview, 첫 번째 |
| 02 | SET-AI의 프로젝트 화면 | SET-AI project interface. | Overview, 두 번째 |
| 03 | SET-AI의 Action Diagram 생성 및 다이어그램 흐름도 생성 장면 | Creating an Action Diagram and its flow diagram in SET-AI. | Automatic Item Layout |
| 04 | SET-AI의 Action Daigram to N2 Chart 화면 | Converting an Action Diagram to an N2 Chart. | Action Diagram to N2 Chart Conversion |
| 05 | SET-AI의 Action Diagram to IDEF0 Diagram 화면 | Converting an Action Diagram to an IDEF0 Diagram. | Action Diagram to IDEF0 Diagram Conversion |

이미지는 원문에 첨부된 애플리케이션 화면을 재사용하며 새 영어 UI나 구성 이미지로 재생성하지 않습니다. 캡션은 원문 캡션의 의미를 번역한 것으로, 별도의 이미지 시각 검사나 현재 운영 상태 확인을 뜻하지 않습니다. 원문 캡션의 Daigram 오탈자는 영문에서 Diagram으로 정리했습니다.

## 5. 확인 사항과 검증 범위

- 원문의 세 기능 개발 설명은 구현 작업의 근거입니다. 빈 RoleEn을 역할 근거가 전혀 없다는 뜻으로 해석하지 않되, 개인·팀의 전체 분담이 확정되지 않아 공개 본문에서 1인 전체 개발로 주장하지 않았습니다.
- 제품 명칭의 AI는 유지했지만 개인의 AI 모델 설계·학습·성능 검증·예측 엔진 개발은 추정하지 않았습니다. 팀 규모·실운영·측정 성과도 추가하지 않았습니다.
- GitHub 주소는 해당 프로젝트의 기존 속성 값만 사용했습니다. 원문 YouTube 속성은 비어 있으므로 다른 프로젝트의 영상을 가져오지 않았습니다. 이번에 저장소 코드를 별도로 검증하지 않았습니다.
- 공식 fetch에 보이는 본문 이미지 5개와 원고의 이미지 번호·영문 캡션을 대조했습니다. 응답에 별도 생략 블록 메타데이터는 보고되지 않았습니다. 실제 첨부 로드·Notion 저장 후 재조회·비로그인 공개 열람 검증은 수행하지 않았습니다.
