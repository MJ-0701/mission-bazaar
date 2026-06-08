# 선교 바자회 간이 키오스크 TF 설계서

## 1. 목표

선교 바자회 당일 하루 동안 사용할 수 있는 저비용 간이 주문 시스템을 만든다.

고객은 메뉴를 선택하고 개인계좌 또는 QR 송금으로 입금한 뒤, 주문 상태를 확인한다.
운영팀은 주문번호, 픽업자명, 금액을 기준으로 수동 입금 확인을 하고, 준비 및 수령 완료 상태를 관리한다.

결제 PG, 카드 결제 API, 사업자 가맹 연동은 이번 범위에서 제외한다.

## 2. 핵심 운영 방식

1. 고객이 주문 페이지에서 메뉴와 수량을 선택한다.
2. 고객이 픽업자명을 입력한다.
3. 시스템이 주문번호를 발급하고 입금 안내를 보여준다.
4. 고객이 개인계좌 또는 QR 송금으로 입금한다.
5. 고객이 `입금했어요` 버튼을 누른다.
6. 주문 상태가 `PAYMENT_CHECKING`으로 변경된다.
7. 운영팀이 은행앱/송금앱에서 주문번호, 픽업자명, 금액을 확인한다.
8. 입금이 맞으면 관리자가 `PAID`로 변경한다.
9. 메뉴 준비가 완료되면 `READY`로 변경한다.
10. 고객이 수령하면 관리자가 `COMPLETE`로 변경한다.

## 3. 상태값 설계

| 상태값 | 고객 화면 문구 | 운영 의미 | 다음 액션 |
| --- | --- | --- | --- |
| `PAYMENT_PENDING` | 입금 대기 | 주문은 생성됐지만 고객이 입금 완료 버튼을 누르지 않음 | 고객 입금 후 `입금했어요` |
| `PAYMENT_CHECKING` | 입금 확인 중 | 고객이 입금했다고 알림. 운영팀 확인 필요 | 관리자 입금 확인 |
| `PAID` | 입금 확인 완료 / 준비 중 | 입금 확인됨. 준비팀 작업 대상 | 메뉴 준비 |
| `READY` | 준비 완료 | 픽업 가능 | 고객 수령 |
| `COMPLETE` | 수령 완료 | 거래 종료 | 없음 |
| `PAYMENT_ISSUE` | 입금 확인 필요 | 금액 불일치, 주문번호 불명확 등 | 운영팀 수동 조치 |
| `CANCELED` | 주문 취소 | 운영자가 취소 처리 | 없음 |

최소 운영 버전은 `PAYMENT_PENDING -> PAYMENT_CHECKING -> PAID -> COMPLETE`만으로도 가능하다.
다만 현장 혼잡을 줄이려면 `READY`를 포함하는 것을 권장한다.

## 4. 입력 정보

### 고객 주문 폼

필수:

- 주문자명 또는 픽업자명
- 메뉴 및 수량

선택:

- 연락처
- 요청사항

### 입금 안내 문구

고객 화면에는 다음 내용을 명확히 노출한다.

```text
입금할 때 주문번호와 픽업자명을 함께 적어주세요.
예: A027 김민준
```

## 5. 주문번호 규칙

권장 형식:

```text
A001, A002, A003 ...
```

운영 팁:

- 당일 주문이 999건을 넘지 않으면 3자리면 충분하다.
- 메뉴 부스가 여러 개라면 접두어를 나눈다.
  - 음식: `F001`
  - 음료: `D001`
  - 물품: `G001`
- 한 팀에서 통합 운영한다면 단일 접두어 `A`가 가장 단순하다.

## 6. 화면 설계

### 고객용 주문 화면

기능:

- 메뉴 목록
- 품절 표시
- 수량 조절
- 장바구니
- 총액 표시
- 주문자명 입력
- 주문 생성
- 계좌/QR 송금 안내
- `입금했어요` 버튼
- 주문 상태 조회

주문 생성 후 화면:

- 주문번호
- 총액
- 입금 계좌
- QR 송금 이미지 또는 안내
- 주문번호/픽업자명 작성 예시
- 현재 상태

### 운영팀 관리자 화면

기능:

- 전체 주문 목록
- 상태별 필터
- 주문번호 검색
- 픽업자명 검색
- 금액 확인
- 주문 상세 보기
- 상태 변경 버튼

우선순위:

1. `PAYMENT_CHECKING`
2. `PAID`
3. `READY`
4. `PAYMENT_PENDING`
5. `COMPLETE`

상태 변경 버튼:

- 입금확인: `PAYMENT_CHECKING -> PAID`
- 입금문제: `PAYMENT_CHECKING -> PAYMENT_ISSUE`
- 준비완료: `PAID -> READY`
- 수령완료: `READY -> COMPLETE`
- 취소: `PAYMENT_PENDING/PAYMENT_CHECKING -> CANCELED`

### 픽업 화면

선택 기능:

- 준비 완료된 주문번호 목록 표시
- 큰 글씨로 `A027 준비 완료`
- 고객이 멀리서도 볼 수 있도록 단순하게 구성

## 7. 데이터 구조

### Order

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `orderId` | string | 주문번호. 예: `A027` |
| `createdAt` | datetime | 주문 생성 시각 |
| `updatedAt` | datetime | 마지막 변경 시각 |
| `pickupName` | string | 주문자명 또는 픽업자명 |
| `phone` | string | 연락처. 선택 |
| `items` | array | 주문 항목 목록 |
| `totalAmount` | number | 총 결제 금액 |
| `status` | string | 주문 상태 |
| `memo` | string | 요청사항 |
| `adminNote` | string | 운영팀 메모 |

### OrderItem

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `menuId` | string | 메뉴 ID |
| `name` | string | 메뉴명 |
| `price` | number | 단가 |
| `quantity` | number | 수량 |
| `subtotal` | number | 소계 |

### Menu

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `menuId` | string | 메뉴 ID |
| `name` | string | 메뉴명 |
| `price` | number | 가격 |
| `category` | string | 카테고리 |
| `isAvailable` | boolean | 판매 가능 여부 |
| `sortOrder` | number | 노출 순서 |

## 8. Google Sheets 구조

하루 운영 MVP는 Google Sheets를 데이터베이스처럼 사용한다.

### `Orders` 시트

| 컬럼 | 설명 |
| --- | --- |
| `orderId` | 주문번호 |
| `teamId` | 팀 ID. 예: `jeju`, `yeongju` |
| `teamName` | 팀 이름. 예: `제주팀`, `영주팀` |
| `createdAt` | 주문 생성 시각 |
| `updatedAt` | 마지막 변경 시각 |
| `pickupName` | 픽업자명 |
| `phone` | 연락처 |
| `itemsText` | 사람이 읽기 쉬운 주문 내용 |
| `totalAmount` | 총액 |
| `status` | 상태 |
| `memo` | 요청사항 |
| `adminNote` | 운영 메모 |

### `Menus` 시트

| 컬럼 | 설명 |
| --- | --- |
| `menuId` | 메뉴 ID |
| `teamId` | 팀 ID. 예: `jeju`, `yeongju` |
| `teamName` | 팀 이름. 예: `제주팀`, `영주팀` |
| `name` | 메뉴명 |
| `price` | 가격 |
| `category` | 카테고리 |
| `isAvailable` | 판매 가능 여부 |
| `sortOrder` | 정렬 순서 |

## 9. MVP 기술 구성

권장안:

- 고객 화면: 정적 HTML/CSS/JavaScript
- 관리자 화면: HTML/CSS/JavaScript
- 백엔드: Google Apps Script Web App
- 데이터 저장소: Google Sheets
- 호스팅: Apps Script Web App 또는 정적 페이지 호스팅
- 결제: 개인계좌/QR 송금 후 수동 확인

장점:

- 운영비 거의 없음
- 하루 행사에 적합
- 설치 부담 낮음
- Google Sheets로 비개발자도 주문 확인 가능

주의:

- 자동 입금 확인은 하지 않는다.
- 관리자 URL은 외부에 노출되지 않게 관리한다.
- 개인정보는 최소한만 받는다.

## 10. API 설계

Apps Script 기준으로는 `doGet`, `doPost`를 사용한다.
현재 구현은 같은 Web App 안에서 화면을 제공하므로 기본 호출은 `google.script.run`을 사용한다.
외부 정적 페이지에서 호출해야 한다면 `doPost`에 `action` 값을 넣어 같은 서버 함수를 호출할 수 있다.

구현된 주요 서버 함수:

- `createOrder(payload)`
- `markPaymentChecking({ orderId, orderToken })`
- `getOrderPublic({ orderId, orderToken })`
- `getAdminBootstrap({ pin })`
- `refreshAdminOrders({ pin })`
- `adminUpdateOrderStatus({ pin, orderId, status, adminNote })`
- `adminUpdateMenuAvailability({ pin, menuId, isAvailable })`
- `getPickupOrders()`

### 주문 생성

```http
POST /orders
```

요청:

```json
{
  "pickupName": "김민준",
  "phone": "010-0000-0000",
  "items": [
    {
      "menuId": "food-001",
      "quantity": 2
    }
  ],
  "memo": "맵지 않게 해주세요"
}
```

응답:

```json
{
  "orderId": "A027",
  "totalAmount": 12000,
  "status": "PAYMENT_PENDING"
}
```

### 입금했어요

```http
POST /orders/{orderId}/payment-checking
```

결과:

```json
{
  "orderId": "A027",
  "status": "PAYMENT_CHECKING"
}
```

### 주문 상태 조회

```http
GET /orders/{orderId}
```

응답:

```json
{
  "orderId": "A027",
  "status": "READY",
  "statusLabel": "준비 완료",
  "totalAmount": 12000
}
```

### 관리자 상태 변경

```http
POST /admin/orders/{orderId}/status
```

요청:

```json
{
  "status": "PAID",
  "adminNote": "주문번호 A027, 12,000원 확인"
}
```

## 11. 운영 역할

권장 역할 분리:

- 주문 안내 담당: 고객이 QR 접속/입금 방법을 이해하도록 돕는다.
- 입금 확인 담당: 은행앱/송금앱 입금내역을 보고 `PAYMENT_CHECKING` 주문을 확인한다.
- 준비 담당: `PAID` 주문만 준비한다.
- 픽업 담당: `READY` 주문을 고객에게 전달하고 `COMPLETE` 처리한다.

소규모 운영이면 입금 확인과 픽업 담당을 한 사람이 겸해도 된다.

## 12. 현장 예외 처리

### 주문번호가 불명확할 때

1. 주문 목록에서 금액과 주문시간 확인
2. 필요하면 고객에게 주문번호를 보여달라고 요청
3. 픽업자명과 주문 내용을 확인
4. 확인되면 `PAID`
5. 불명확하면 `PAYMENT_ISSUE`

### 금액이 부족할 때

1. `PAYMENT_ISSUE` 처리
2. 운영 메모에 부족 금액 기록
3. 고객 추가 입금 후 `PAID`

### 품절 발생

1. 메뉴의 `isAvailable`을 `FALSE`로 변경
2. 고객 화면에서 품절 처리
3. 이미 들어온 주문은 운영팀이 개별 안내

### 현금 결제

관리자 화면에서 현금결제 확인용 버튼을 둘 수 있다.

권장 메모:

```text
현금 결제 확인
```

상태는 바로 `PAID`로 변경한다.

## 13. 보안 및 개인정보

- 연락처는 선택 입력으로 둔다.
- 행사 종료 후 주문 데이터 보관 기간을 정한다.
- 관리자 화면 URL은 운영팀에게만 공유한다.
- 관리자 상태 변경에는 간단한 관리자 비밀번호를 둔다.
- 개인정보가 포함된 시트 공유 권한을 제한한다.

## 14. 구축 순서

1. 메뉴와 가격 확정
2. Google Sheets 생성
3. `Menus`, `Orders` 시트 생성
4. Apps Script API 작성
5. 고객용 주문 페이지 작성
6. 관리자 페이지 작성
7. 주문 생성 테스트
8. 입금확인 상태 변경 테스트
9. 휴대폰 화면 테스트
10. 현장 리허설

## 15. 당일 체크리스트

- 메뉴 품절 처리 방법 확인
- 입금 계좌/QR 코드 확인
- 관리자 화면 접속 링크 확인
- 운영팀 휴대폰 또는 태블릿 준비
- 주문번호로 고객 확인하는 멘트 통일
- 입금 확인 담당 지정
- 픽업 완료 처리 담당 지정
- 행사 종료 후 주문 데이터 백업 또는 삭제 방침 확인

## 16. 1차 MVP 범위

반드시 포함:

- 메뉴 선택
- 수량 선택
- 총액 계산
- 주문번호 발급
- 입금 안내
- `입금했어요` 버튼
- 관리자 주문 목록
- 상태 변경

나중에 추가:

- 픽업 대기 화면
- 메뉴 이미지
- 품절 자동 반영
- 카테고리 필터
- 현금 결제 별도 표시
- 주문 통계

## 17. 구현 산출물

현재 구현은 Google Apps Script Web App 기준이다.

파일:

- `apps-script/Code.gs`: 백엔드, 시트 초기화, 주문 생성, 상태 변경, 관리자 PIN 검증
- `apps-script/Index.html`: 고객 주문 화면
- `apps-script/Admin.html`: 운영팀 관리자 화면
- `apps-script/Pickup.html`: 준비 완료 주문번호 표시 화면
- `apps-script/Styles.html`: 공통 스타일
- `apps-script/appsscript.json`: Apps Script 매니페스트
- `tests/backend.test.js`: 주문번호, 상태 전이, 주문 검증 로직 테스트

구현에 반영된 보완점:

- 주문번호는 `LockService`로 잠근 상태에서 발급한다.
- 주문 항목은 `itemsText`와 `itemsJson`에 주문 시점 가격/수량 스냅샷으로 저장한다.
- 메뉴와 주문은 `teamId`, `teamName`으로 팀을 구분한다.
- 한 주문번호에 여러 팀 메뉴를 함께 담을 수 있고, 시트에는 같은 주문번호의 팀별 조리 행으로 나누어 저장한다.
- 고객 주문 조회는 `orderId`와 `orderToken`이 함께 있어야 가능하다.
- 관리자 상태 변경은 서버에서 PIN과 허용 상태 전이를 검증한다.
- 사용자 입력은 길이 제한과 스프레드시트 수식 주입 방어를 적용한다.
- 품절 여부와 가격은 주문 생성 시 서버가 `Menus` 시트를 기준으로 다시 검증한다.

## 18. 배포 순서

1. Google Apps Script 프로젝트를 만든다.
2. `apps-script` 안의 파일들을 같은 이름으로 Apps Script 프로젝트에 추가한다.
3. 프로젝트 설정에서 스크립트 속성을 설정한다.

| 속성 | 예시 | 설명 |
| --- | --- | --- |
| `BANK_NAME` | `국민은행` | 입금 안내 은행명 |
| `ACCOUNT_NUMBER` | `000000-00-000000` | 입금 계좌 |
| `ACCOUNT_HOLDER` | `홍길동` | 예금주 |
| `ADMIN_PIN` | `1234` | master 관리자 PIN. 전체 주문/전체 메뉴 관리 |
| `JEJU_ADMIN_PIN` | `1111` | 제주팀 관리자 PIN. 제주팀 주문/메뉴만 관리 |
| `YEONGJU_ADMIN_PIN` | `2222` | 영주팀 관리자 PIN. 영주팀 주문/메뉴만 관리 |
| `QR_IMAGE_URL` | `https://...` | 선택. QR 이미지 URL |

팀별 PIN 속성명은 `teamId` 기준도 지원한다. 예를 들어 `teamId`가 `jeju`, `yeongju`라면 `ADMIN_PIN_JEJU`, `ADMIN_PIN_YEONGJU`도 사용할 수 있다.

4. Apps Script 편집기에서 `setupKiosk` 함수를 한 번 실행한다.
5. 실행 로그에 찍힌 `spreadsheetUrl`을 열어 `Menus` 시트의 메뉴와 가격을 행사 기준으로 수정한다.
6. 실행 로그의 `adminPin`을 운영팀에게 공유한다.
7. 배포 > 새 배포 > 웹 앱을 선택한다.
8. 실행 권한은 배포자, 액세스 권한은 링크가 있는 모든 사용자로 설정한다.

운영 URL:

- 고객 화면: 배포 URL
- 관리자 화면: 배포 URL 뒤에 `?page=admin`
- 픽업 화면: 배포 URL 뒤에 `?page=pickup`

주소창에 보이는 `script.googleusercontent.com/.../userCodeAppPanel` 주소는 Apps Script 내부 렌더링 주소이므로 공유하거나 `?page=admin`을 붙이지 않는다.
항상 배포 후 받은 `script.google.com/macros/s/.../exec` 주소를 기준으로 사용한다.

## 19. 로컬 검증

Apps Script 서비스 전체는 로컬에서 실행하지 않는다. 대신 순수 로직은 Node.js로 검증한다.

```bash
node tests/backend.test.js
```
