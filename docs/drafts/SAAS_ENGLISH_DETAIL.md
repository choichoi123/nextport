# 교통약자 클라우드 SaaS 영문 상세 원고

기준일: **2026-11-12 KST**. 최신 공식 Notion 본문과 속성을 읽어 작성한 공개용 영문 원고입니다. 이 파일 작성 자체로 Notion 반영·공개·사이트 연결을 완료한 것은 아닙니다.

**영문 페이지 제목:** Accessible Mobility Cloud SaaS Operations Service

## 1. 공개용 영문 본문

## Overview

A web project for regional accessible mobility services, covering user-facing pages, administration, manager workflows for drivers and call-center staff, and subscription management.

**Period:** 2023-11-17–2024-06-14

The screenshots below retain the original Korean interface.

## User-Facing Service

The user-facing website includes trip requests and trip history, with dispatch information shown after a request is submitted.

**Image 01.** Main page of the regional accessible mobility service.

**Image 02.** Trip-request interface for accessible mobility services.

**Image 03.** Full-screen view of the trip-request interface.

**Image 04.** Dispatch status in the user's trip history after submitting a request.

**Image 05.** Trip history view.

## Administration

The administration area covers frequently asked questions, account management, and notice authoring with an editor and multiple file attachments.

**Image 06.** Administration: frequently asked questions.

**Image 07.** Administration: account management.

**Image 08.** Administration: notice editor with multiple file attachments.

## Manager Workspace

The manager area brings together sign-in, depot settings, call-center staff management, and driver management. The driver-registration flow includes selecting a registered vehicle and retrieving the selected vehicle and terminal information.

**Image 09.** Manager sign-in screen.

**Image 10.** Manager workspace: depot settings.

**Image 11.** Manager workspace: call-center staff management.

**Image 12.** Manager workspace: driver management, initial view.

**Image 13.** Driver registration: selecting a vehicle from the registered-vehicle list.

**Image 14.** Driver management: selected vehicle and terminal information.

## Subscription Management

The subscription area includes monthly billing information by center, subscription pricing information and changes, and account registration, editing, and deletion.

**Image 15.** Center billing information, with monthly lookup by center.

**Image 16.** Subscription information, including pricing information and changes.

**Image 17.** Subscription-page account management: adding, editing, and deleting accounts.

## Implementation and Technologies

The web implementation includes access-token-based login handling and separate page flows for administrator and general-user roles across the user, administration, manager, and subscription areas.

**Technologies listed in the project materials:** JavaScript, React, Node.js, Kakao Maps, and SaaS.

## 2. 편집자용 원문 대조 — 공개 본문에 복사하지 않음

- 출처: [기존 한국어 상세](https://app.notion.com/p/5e14c6db167583f1becc0152a06b5485)의 최신 공식 조회. 원문 카드·기간은 [영문 카드 문구](ENGLISH_PROJECT_CARDS.md), 작성 경계는 [영문 상세 계획](ENGLISH_PROJECT_DETAILS_PLAN.md)을 따릅니다.
- 참여 기간은 원본 `WorkPeriod`의 **2023-11-17~2024-06-14**를 그대로 사용했습니다. 팀 구성·운영 기간·효율 수치를 추가하지 않았습니다.
- 원문의 사용자 홈페이지·관리자·매니저·구독 영역과 각 사진의 순서를 유지했습니다. 접수 → 이용내역·배차 정보, FAQ·계정·공지 작성, 차고지·상담원·운전원 관리, 센터별 월 요금·구독 계정 관리만 번역했습니다.
- Access Token 로그인 관리와 관리자·일반 사용자별 페이지 구분은 원문 toggle에 있습니다. 이를 백엔드 인증·권한 체계 전체 설계, 보안 검증 완료나 개인 단독 개발로 확대하지 않았습니다.
- `RoleEn`은 현재 빈 값이지만 본문에 구현 작업은 있습니다. 공개 문장은 중립적인 기능·구현 설명이며, 개인 분담과 의사결정·검증 결과가 확인되기 전에는 1인칭 전체 실적으로 바꾸지 않습니다.
- 원문 캡션의 ‘시버스’는 특정 차량 종류로 해석하지 않고 trip-request interface로 옮겼습니다. ‘원전원 관리’는 앞뒤 운전원 등록 흐름에 맞춰 driver management로 표기했습니다.
- 사진 **17장 전부**를 기존 순서로 대응시켰습니다. 이 저장소 문서에는 이미지 번호·영문 캡션만 두었습니다. 정확한 `notion-file-block://` 참조는 저장소 밖 `%LOCALAPPDATA%/nextport/english-details-20261112/content/saas.md`에만 보관하며 만료형 서명 URL은 사용하지 않습니다.
- 이번에 확인한 것은 최신 본문·속성·이미지 블록 참조입니다. 이미지 바이트·비로그인 실제 로드·공개 메타데이터는 Notion 반영 후 별도로 확인해야 합니다.
