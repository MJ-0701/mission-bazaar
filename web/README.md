# Mission Bazaar Kiosk Web

Apps Script + Google Sheets 버전에서 Next.js + Supabase Postgres로 이관하기 위한 새 웹앱이다.

## 현재 구현

- 고객 주문 화면: `/`
- 고객 픽업 화면: `/pickup?orderNo=A001&token=...`
- 관리자 화면: `/admin`
- API routes:
  - `GET /api/public/bootstrap`
  - `POST /api/orders`
  - `POST /api/orders/:orderNo/payment-checking`
  - `GET /api/pickup`
  - `POST /api/pickup/complete`
  - `POST /api/admin/login`
  - `POST /api/admin/logout`
  - `GET /api/admin/dashboard`
  - `POST /api/admin/status`
  - `POST /api/admin/menus`

Supabase 환경변수가 없으면 로컬 데모 스토어로 동작한다.

데모 PIN:

- master: `0000`
- 영주팀: `1111`
- 제주팀: `2222`

## Local Run

이 환경에서는 기본 PATH에 `npm`이 없어서 Homebrew Node로 검증했다.

```bash
cd /Users/mj/TF/mission-bazaar-kiosk-tf/web
/opt/homebrew/bin/node node_modules/next/dist/bin/next dev -p 3010
```

브라우저:

```text
http://localhost:3010
```

빌드:

```bash
cd /Users/mj/TF/mission-bazaar-kiosk-tf/web
/opt/homebrew/bin/node node_modules/next/dist/bin/next build --webpack
```

## Supabase 연결 순서

1. Supabase 프로젝트 생성
2. `/Users/mj/TF/mission-bazaar-kiosk-tf/migration/schema.sql` 실행
3. `/Users/mj/TF/mission-bazaar-kiosk-tf/migration/seed.example.sql` 값을 운영 값으로 수정 후 실행
4. `COOKIE_SECRET` 생성
5. PIN 해시 생성

```bash
cd /Users/mj/TF/mission-bazaar-kiosk-tf/web
COOKIE_SECRET='<same-secret-as-env>' EVENT_CODE='mission-bazaar-2026' /opt/homebrew/bin/node scripts/hash-admin-pin.mjs 0000 1111 2222
```

6. `/Users/mj/TF/mission-bazaar-kiosk-tf/migration/admin-pin-template.sql`의 해시 자리 교체 후 실행
7. `.env.local` 작성

```bash
cp .env.example .env.local
```

8. `.env.local`에 Supabase URL, anon key, service role key, `COOKIE_SECRET`, `EVENT_CODE` 입력

## Design Direction

`/Users/mj/IdeaProjects/solon-design`의 system-docs 톤을 참고했다.

- 흰 배경
- 얇은 1px rule
- 6~8px radius
- 과한 shadow/gradient 없음
- 정보 밀도 높은 운영 화면
- 고객 화면에는 관리자 진입 버튼 없음

## Verified

- TypeScript check 통과
- Next production build 통과
- 로컬 데모 플로우 확인:
  - 고객 주문 생성
  - 입금했어요 후 픽업 화면 이동
  - 관리자 master 로그인
  - 영주팀 주문만 입금확인/준비완료
  - 픽업 화면에 준비완료 반영
  - 고객 수령완료 처리
