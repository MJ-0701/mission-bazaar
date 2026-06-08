# Migration Prep: Web App + DB

Apps Script + Google Sheets 버전은 임시 운영판으로 유지하고, 본 이관은 별도 웹앱과 DB로 진행한다.

## Target Stack

- Frontend/API: Next.js on Vercel
- DB: Supabase Postgres
- Realtime: Supabase Realtime subscriptions
- Optional export: Google Sheets는 운영 DB가 아니라 백업/정산 export 대상으로만 사용

## Why This Stack

- 현재 도메인은 주문, 팀별 주문 섹션, 메뉴, 상태 이력처럼 관계형 모델이 자연스럽다.
- 관리자 화면은 필터, 검색, 집계, 팀 권한이 필요해서 SQL이 맞다.
- 고객/픽업/관리자 화면은 polling 대신 realtime subscription으로 상태 변경을 받을 수 있다.
- 서버 API에서 admin PIN과 customer token을 검증하면 DB service key를 클라이언트에 노출하지 않는다.

## Migration Scope

포함:

- 고객 주문 생성
- 입금했어요 처리
- 고객 픽업 상태 확인
- 운영팀별 관리자 화면
- master 관리자 통합 화면
- 메뉴 품절 관리
- 팀별 주문 상태 변경
- 운영 백업용 CSV/Sheets export

제외:

- PG/카드 결제
- 자동 입금 대사
- 회원 로그인

## Source Of Truth

이관 후 source of truth는 Supabase Postgres다.

Google Sheets는 다음 용도로만 둔다.

- 당일 마감 export
- 장애 시 수동 백업
- 운영팀이 보기 편한 별도 보고서

## Key Product Rules

- 한 주문에는 여러 팀의 메뉴가 담길 수 있다.
- 주문번호는 한 주문 기준으로 하나만 발급한다. 예: `A002`
- 조리/운영은 팀별로 분리된다.
- 따라서 상태 변경 단위는 `order_sections`다.
- 고객 픽업 화면은 같은 주문번호가 팀별로 나뉘어 보여도 된다.
- 동일 고객 판별은 `pickupName + phone`의 정규화 키다.
- 결제 계좌는 팀 공통이다.

## Recommended Implementation Order

1. Supabase 프로젝트 생성
2. `schema.sql` 적용
3. `seed.example.sql`을 복사해서 운영 메뉴/계좌/QR 값으로 수정 후 적용
4. Next.js 앱 생성
5. `.env.local`을 `env.example` 기준으로 작성
6. API routes 구현
7. 고객 주문 화면 이식
8. 픽업 화면 이식
9. 관리자 PIN/session 구현
10. 관리자 주문판/메뉴 품절 관리 이식
11. Realtime subscription 연결
12. Sheets export 구현
13. Apps Script 버전과 side-by-side 테스트
14. QR 링크를 새 웹앱 URL로 교체

## Open Decisions

- 배포 도메인
- Supabase region
- 운영 PIN 최종값
- 실제 계좌/QR 이미지
- 마감 export 형식: CSV, Google Sheets append, or both
