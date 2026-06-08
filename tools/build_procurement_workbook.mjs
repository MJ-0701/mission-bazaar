import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/mj/TF/mission-bazaar-kiosk-tf/outputs/bazaar_procurement_20260602";
const outputPath = `${outputDir}/선교바자회_먹거리_도매최저가_구매표.xlsx`;

const urls = {
  water: "https://prod.danawa.com/info/?pcode=3513737",
  ice: "",
  cup: "https://m.xn--hj2bm1hza.com/product/detail.html?cate_no=29&display_group=1&product_no=74",
  straw: "https://ptory.co.kr/",
  blueberry: "https://ohcoffee.co.kr/product/%EC%95%84%EC%9E%84%EC%9A%94-%EB%B8%94%EB%A3%A8%EB%B2%A0%EB%A6%AC-%EA%B3%BC%EC%9D%BC-%EB%B2%A0%EC%9D%B4%EC%8A%A4-1kg/4098/",
  sparkling: "https://prod.danawa.com/info/?pcode=15979616",
  coldbrew: "https://comad.co.kr/product/%EC%BD%9C%EB%93%9C%EB%B8%8C%EB%A3%A8-1l/109/",
  grapefruitBase: "https://mall.hyungkuk.com/m/product.html?GfDT=bmt%2FW1Q%3D&branduid=3521889&mcode=&scode=&xcode=",
  grapefruitBaseCompare: "https://prod.danawa.com/info/?pcode=32605376",
  driedGrapefruit: "https://geniealert.co.kr/goods/detail/6220889639?itemId=19233545133&vendorItemId=86350005701",
  bread: "https://fallcent.com/product/?item_id=537673989&product_id=5048795501",
  container: "https://www.foodspring.co.kr/goods/detail/721359",
  eggSalad: "https://www.thingoolmarket.com/goods/goods_view.php?goodsNo=1000029634",
  strawberryJam: "https://www.foodspring.co.kr/",
  creamCheese: "https://www.sfoodmall.co.kr/goods/goods_view.php?goodsNo=1000000782",
  appleJam: "https://prod.danawa.com/info/?pcode=32704193",
  whippedCream: "https://discountcoffee.co.kr/product/%ED%8F%AC%EB%AA%A8%EB%82%98-%ED%9C%98%ED%95%91%EC%8A%A4%ED%94%84%EB%A0%88%EC%9D%B4-500g-%ED%9C%98%ED%95%91%ED%81%AC%EB%A6%BC/4328/",
  cinnamon: "https://www.ssg.com/item/itemView.ssg?itemId=1000037187457",
  raspberryJam: "https://www.thebaket.com/goods/goods_view.php?goodsNo=1000000281",
};

const purchaseRows = [
  ["음료 공통", "전체 음료", "물", "동원샘물 2L x 12병", "아메리카노+자허블 희석수 약 23L", "24L", 1, 6520, 0, "다나와/G마켓", urls.water, "확인", "배송비 포함 최저가 기준"],
  ["음료 공통", "전체 음료", "얼음", "식용 각얼음 3kg", "250잔 x 약 150g = 37.5kg", "39kg", 13, 3000, 0, "현지 마트/제빙업체", urls.ice, "추정", "택배보다 행사 당일 현지수령 추천"],
  ["음료 공통", "전체 음료", "음료컵", "PET 16온스 투명컵 98파이 1000개", "250잔 사용, 도매 최소 1000개", "250개 사용 / 750개 여분", 1, 48280, 4000, "벼래별", urls.cup, "확인", "뚜껑 제외. 이동 판매면 돔/평뚜껑 1000개 추가 검토"],
  ["음료 공통", "전체 음료", "빨대", "21cm 개별포장 빨대 1000개", "250개 사용, 도매 최소 1000개", "250개 사용 / 750개 여분", 1, 8900, 3000, "포장 전문몰", urls.straw, "추정", "컵과 같은 포장몰에서 묶음 주문하면 배송비 절약 가능"],
  ["에이드", "블루베리에이드", "블루베리청/베이스", "아임요 블루베리 과일 베이스 1kg", "100잔 x 약 40g", "4kg", 4, 8480, 3000, "오커피", urls.blueberry, "확인", "엄밀한 수제청은 단가 상승. 카페용 과일베이스로 최저가 채택"],
  ["에이드", "블루베리에이드", "탄산수", "탐사 스파클링 플레인 1.5L x 12병", "100잔 x 170~180ml", "18L", 1, 13490, 0, "다나와/쿠팡", urls.sparkling, "확인", "1박스가 거의 딱 맞음. 여유 원하면 1박스 추가"],
  ["아메리카노", "아메리카노", "콜드브루 원액", "COMAD 콜드브루 1L", "1병 약 15잔, 70잔 기준", "5L", 5, 10500, 0, "COMAD", urls.coldbrew, "확인", "2병 이상 무료배송 조건 충족"],
  ["자허블", "자몽허니블랙티", "자허블 원액", "흥국 리얼베이스 자몽허니블랙티 1kg", "80잔 x 약 50g", "4kg", 4, 16250, 0, "흥국몰/카페재료몰", urls.grapefruitBase, "부분확인", "상품은 공식몰 확인, 가격은 초안의 2kg 32,500원 기준. 주문 직전 재확인"],
  ["자허블", "자몽허니블랙티", "건자몽 슬라이스", "초이스팜 건자몽 슬라이스 150g", "80잔 장식용 1조각", "300g", 2, 10900, 0, "초이스팜/쿠팡 계열", urls.driedGrapefruit, "부분확인", "비주얼용. 조각 수 부족하면 1팩 추가"],
  ["샌드 공통", "전체 샌드", "모닝빵", "삼립 버터롤 21입 540g", "샌드 250개 필요", "252개", 12, 4435, 0, "가격추적/쿠팡", urls.bread, "확인", "4팩 17,740원 기준 환산"],
  ["샌드 공통", "전체 샌드", "사각용기", "BR 정사각 S 샌드위치 용기+뚜껑 500세트", "250개 사용, 도매 최소 500개", "250개 사용 / 250개 여분", 1, 52650, 0, "식봄", urls.container, "확인", "100개 단위 쿠팡보다 개당 단가 낮음"],
  ["에그마요", "에그마요", "에그샐러드 필링", "풍요한아침 짜먹는 에그 샐러드 1kg", "100개 x 약 45g", "5kg", 5, 10900, 9000, "띵굴마켓", urls.eggSalad, "확인", "냉장/보냉 포장 옵션은 주문 전 확인"],
  ["에그마요", "에그마요", "딸기잼", "우림 딸기잼 3kg", "100개 x 약 10g", "3kg", 1, 14000, 3000, "식자재몰/식봄", urls.strawberryJam, "부분확인", "라즈베리잼보다 저렴해서 채택"],
  ["대크치", "대파크림치즈", "대파크림치즈 필링", "로젠치즈 대파 베이컨 크림치즈 1kg", "80개 x 약 50g", "4kg", 4, 18930, 4000, "에쓰푸드몰", urls.creamCheese, "확인", "직접 제조보다 현장 작업 단순"],
  ["사과와플", "사과와플", "사과잼", "우림 사과잼 3kg", "70개 x 약 20g", "3kg", 1, 10500, 3000, "다나와/식자재몰", urls.appleJam, "확인", "시나몬은 별도 파우더가 더 저렴"],
  ["사과와플", "사과와플", "휘핑크림", "포모나 휘핑스프레이 500g", "70개 x 약 25g + 여유", "2kg", 4, 4850, 2300, "디스카운트커피", urls.whippedCream, "확인", "스프레이형이라 현장 도구 최소화"],
  ["사과와플", "사과와플", "시나몬파우더", "계피가루/시나몬 파우더 500g", "토핑 소량", "500g", 1, 7900, 3000, "SSG/식자재몰", urls.cinnamon, "부분확인", "무가당 파우더. 잼+휘핑이 이미 달음"],
];

const compareRows = [
  ["물", "동원샘물 2L x 12", "6,520원 무료배송", "탐사수 2L x 12 약 6,890원", "동원샘물", urls.water, "다나와에서 배송비 포함 최저가 확인"],
  ["탄산수", "탐사 스파클링 1.5L x 12", "13,490원", "24개 26,170원", "탐사 12개", urls.sparkling, "100잔 기준 1박스가 최저 필요량"],
  ["블루베리청/베이스", "아임요 블루베리 과일 베이스 1kg", "8,480원", "블루베리청류는 보통 g당 단가 상승", "아임요", urls.blueberry, "카페용 베이스 기준 최저가 후보"],
  ["콜드브루 원액", "COMAD 콜드브루 1L", "10,500원", "코케 올바른커피 12,000원", "COMAD", urls.coldbrew, "2병 이상 무료배송"],
  ["자허블 원액", "흥국 리얼베이스 자몽허니블랙티 1kg", "16,250원/kg 기준", "공식몰 상품 확인, 다나와 가격비교 중지", "흥국", urls.grapefruitBase, "가격은 주문 직전 확인 필요"],
  ["건자몽 슬라이스", "초이스팜 건자몽/건시트러스", "약 10,900원/150g", "소용량 50g은 g당 단가 높음", "초이스팜 계열", urls.driedGrapefruit, "장식용은 최소량만 구매"],
  ["모닝빵", "삼립 버터롤 21입 540g", "4팩 17,740원", "SSG 10g당 101원", "삼립 4팩 묶음", urls.bread, "250개에는 12팩 필요"],
  ["사각용기", "BR 정사각 S 500세트", "52,650원 무료배송", "정담 100개 25,900원 / 더착한팩 100개 34,000원", "식봄 BR 500세트", urls.container, "도매 최소단위가 싸고 여분 250개 발생"],
  ["에그샐러드 필링", "풍요한아침 짜먹는 에그 샐러드 1kg", "10,900원", "SSG 15,560원", "띵굴마켓", urls.eggSalad, "배송비 계단식이라 한 번에 주문"],
  ["딸기잼 vs 라즈베리잼", "우림 딸기잼 3kg", "약 14,000원", "선인 라즈베리잼 3kg은 가격 재확인 필요", "딸기잼", urls.raspberryJam, "맛보다 원가 우선이면 딸기잼"],
  ["대파크림치즈 필링", "로젠치즈 대파 베이컨 크림치즈 1kg", "18,930원", "아이랑 19,670원", "에쓰푸드몰", urls.creamCheese, "배송비 포함해도 최저 후보"],
  ["사과잼", "우림 사과잼 3kg", "10,500원", "기타 3kg 11,160원 이상", "우림", urls.appleJam, "사과시나몬잼보다 사과잼+시나몬 별도 조합이 저렴"],
  ["휘핑크림", "포모나 휘핑스프레이 500g", "4,850원", "쿠팡/가격추적 1개 7,760원", "디스카운트커피", urls.whippedCream, "스프레이형 최저 후보"],
  ["시나몬파우더", "계피가루/시나몬 500g", "약 7,900원", "소용량은 g당 단가 상승", "500g 벌크", urls.cinnamon, "행사 후 남아도 보관 쉬움"],
  ["음료컵/빨대", "PET 16온스 1000개 + 빨대 1000개", "컵 48,280원 + 빨대 약 8,900원", "뚜껑은 선택 추가", "포장 전문몰", urls.cup, "요청 품목 기준 컵+빨대만 포함"],
];

const recipeRows = [
  ["구분", "메뉴", "현장 조립", "1개/1잔 기준 사용량"],
  ["음료", "블루베리에이드", "컵에 얼음 -> 블루베리청/베이스 -> 탄산수", "베이스 40g, 탄산수 170~180ml"],
  ["음료", "아메리카노", "컵에 얼음 -> 콜드브루 원액 -> 생수", "원액 60~70ml, 물 120~150ml"],
  ["음료", "자몽허니블랙티", "컵에 얼음 -> 자허블 원액 -> 생수 -> 건자몽 1조각", "원액 50g, 물 140~160ml"],
  ["샌드", "에그마요", "모닝빵 절개 -> 에그샐러드 필링 -> 딸기잼 소량", "필링 45g, 잼 10g"],
  ["샌드", "대파크림치즈", "모닝빵 절개 -> 대파크림치즈 필링", "필링 50g"],
  ["샌드", "사과와플", "모닝빵 절개 -> 사과잼 -> 휘핑크림 -> 시나몬", "잼 20g, 휘핑 25g"],
];

const guideRows = [
  ["구매처", "묶어서 살 품목", "이유/주의"],
  ["다나와/가격비교", "물, 탄산수, 사과잼", "배송비 포함 최저가 비교가 쉬움"],
  ["포장 전문몰", "음료컵, 빨대, 사각용기", "1000개/500개 단위가 개당 단가 최저. 남는 수량 표시"],
  ["카페재료몰", "블루베리 베이스, 자허블 원액, 휘핑크림", "원액류는 유통기한과 배송비 확인"],
  ["냉장 식품몰", "에그샐러드, 대파크림치즈", "보냉 포장과 행사 전날/당일 수령 일정 확인"],
  ["현지 조달", "얼음", "택배보다 당일 수령이 안전하고 싸기 쉬움"],
];

function styleTitle(sheet, rangeAddress, title) {
  const [, startCol, endCol] = rangeAddress.match(/^([A-Z]+)\d+:([A-Z]+)\d+$/) ?? [];
  const width = colNumber(endCol) - colNumber(startCol) + 1;
  const range = sheet.getRange(rangeAddress);
  range.writeValues([[title, ...Array(Math.max(width - 1, 0)).fill("")]]);
  sheet.getRange(rangeAddress.split(":")[0]).writeValues([[title]]);
  range.format.fill = { color: "#F7FAF9" };
  range.format.font = { bold: true, color: "#12343B", size: 15 };
  range.format.rowHeightPx = 34;
}

function colNumber(label = "A") {
  return [...label].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function styleHeader(range) {
  range.format.fill = { color: "#E6F0EE" };
  range.format.font = { bold: true, color: "#12343B" };
  range.format.borders = { preset: "all", style: "thin", color: "#B8C7C4" };
  range.format.wrapText = true;
  range.format.rowHeightPx = 30;
}

function styleBody(range) {
  range.format.borders = { preset: "all", style: "thin", color: "#D9E1DF" };
  range.format.wrapText = true;
  range.format.font = { color: "#1F2933", size: 10 };
  range.format.verticalAlignment = "top";
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("요약");
const purchase = workbook.worksheets.add("구매리스트");
const compare = workbook.worksheets.add("가격비교");
const recipe = workbook.worksheets.add("레시피·구성");
const guide = workbook.worksheets.add("구매처 가이드");

for (const sheet of [summary, purchase, compare, recipe, guide]) {
  sheet.showGridLines = false;
}

styleTitle(summary, "A1:F1", "선교 바자회 먹거리 도매 최저가 구매표");
summary.getRange("A3:B11").values = [
  ["가격 확인일", "2026-06-02"],
  ["기준 수량", "음료 250잔 + 샌드 250개 = 총 500개/잔"],
  ["실구매 예산", null],
  ["예상 매출", 1485000],
  ["예상 순익", null],
  ["가격 기준", "쿠폰/회원가 제외 가능한 정상가, 배송비 포함 우선"],
  ["주의", "도매 최소구매 단위 때문에 컵/용기는 여분이 생김"],
  ["주문 전 체크", "냉장품 보냉비, 얼음 당일수령, 자허블 원액 가격 재확인"],
  ["추천 선택", "에그마요 잼은 원가 기준 딸기잼 채택"],
];
summary.getRange("B5").formulas = [[`=SUM('구매리스트'!J5:J${purchaseRows.length + 4})`]];
summary.getRange("B7").formulas = [["=B6-B5"]];
summary.getRange("A3:A11").format.font = { bold: true, color: "#12343B" };
summary.getRange("A3:B11").format.borders = { preset: "all", style: "thin", color: "#D9E1DF" };
summary.getRange("B5:B7").format.font = { bold: true, color: "#0F5132" };
summary.getRange("B5:B7").setNumberFormat('"₩"#,##0');
summary.getRange("B6").setNumberFormat('"₩"#,##0');
summary.getRange("B7").setNumberFormat('"₩"#,##0');
summary.getRange("A13:F13").values = [["구분", "메뉴", "판매가", "수량", "예상 매출", "비고"]];
styleHeader(summary.getRange("A13:F13"));
summary.getRange("A14:F19").values = [
  ["음료", "블루베리에이드", 2800, 100, null, "탄산수 1박스 딱 맞음"],
  ["음료", "아메리카노", 2500, 70, null, "콜드브루 5L"],
  ["음료", "자몽허니블랙티", 3000, 80, null, "원액 가격 재확인"],
  ["샌드", "에그마요", 3000, 100, null, "딸기잼 채택"],
  ["샌드", "대파크림치즈", 3500, 80, null, "시판 필링"],
  ["샌드", "사과와플", 3000, 70, null, "휘핑+시나몬"],
];
summary.getRange("E14:E19").formulas = Array.from({ length: 6 }, (_, i) => [`=C${14 + i}*D${14 + i}`]);
summary.getRange("A14:F19").format.borders = { preset: "all", style: "thin", color: "#D9E1DF" };
summary.getRange("C14:C19").setNumberFormat('"₩"#,##0');
summary.getRange("D14:D19").setNumberFormat('0');
summary.getRange("E14:E19").setNumberFormat('"₩"#,##0');
setWidths(summary, [100, 190, 95, 75, 115, 220]);

styleTitle(purchase, "A1:N1", "구매리스트 · 도매 최저가 후보");
purchase.getRange("A2:N2").merge();
purchase.getRange("A2:N2").values = [["단가와 배송비는 2026-06-02 웹 확인/초안 보완 기준입니다. 주문 직전 가격·재고·배송비를 다시 확인하세요."]];
purchase.getRange("A2:N2").format.fill = { color: "#F7FAF9" };
purchase.getRange("A2:N2").format.font = { color: "#43514E" };
purchase.getRange("A4:N4").values = [[
  "분류", "용도/메뉴", "품목", "채택 상품/규격", "산출 기준", "필요량", "구매수량", "단가", "배송비", "실구매액", "추천 구매처", "링크", "확인", "비고",
]];
styleHeader(purchase.getRange("A4:N4"));
purchase.getRange(`A5:N${purchaseRows.length + 4}`).values = purchaseRows.map((row) => [...row.slice(0, 9), null, ...row.slice(9)]);
purchase.getRange(`J5:J${purchaseRows.length + 4}`).formulas = purchaseRows.map((_, i) => [`=G${i + 5}*H${i + 5}+I${i + 5}`]);
styleBody(purchase.getRange(`A5:N${purchaseRows.length + 4}`));
purchase.getRange(`H5:J${purchaseRows.length + 4}`).setNumberFormat('"₩"#,##0');
purchase.getRange(`G5:G${purchaseRows.length + 4}`).setNumberFormat('0');
purchase.tables.add(`A4:N${purchaseRows.length + 4}`, true, "PurchaseList");
purchase.freezePanes.freezeRows(4);
setWidths(purchase, [95, 120, 120, 230, 210, 150, 75, 85, 85, 100, 120, 260, 75, 260]);

styleTitle(compare, "A1:G1", "가격비교 · 채택 근거");
compare.getRange("A2:G2").merge();
compare.getRange("A2:G2").values = [["최저가 기준은 배송비 포함 가능성을 우선 보되, 냉장/대량/보냉 품목은 실제 주문 조건에 따라 달라질 수 있습니다."]];
compare.getRange("A4:G4").values = [["품목", "채택 후보", "채택가", "비교 후보", "선정", "출처", "비고"]];
styleHeader(compare.getRange("A4:G4"));
compare.getRange(`A5:G${compareRows.length + 4}`).values = compareRows;
styleBody(compare.getRange(`A5:G${compareRows.length + 4}`));
compare.tables.add(`A4:G${compareRows.length + 4}`, true, "PriceCompare");
compare.freezePanes.freezeRows(4);
setWidths(compare, [140, 230, 135, 270, 150, 310, 250]);

styleTitle(recipe, "A1:D1", "레시피·구성");
recipe.getRange(`A3:D${recipeRows.length + 2}`).values = recipeRows;
styleHeader(recipe.getRange("A3:D3"));
styleBody(recipe.getRange(`A4:D${recipeRows.length + 2}`));
recipe.tables.add(`A3:D${recipeRows.length + 2}`, true, "RecipeTable");
recipe.getRange("A11:D15").values = [
  ["운영 메모", null, null, null],
  ["음료와 샌드 라인을 분리하고 컵/용기는 미리 펼쳐두기", null, null, null],
  ["에그샐러드·크림치즈·휘핑은 아이스박스 보냉 필수", null, null, null],
  ["빵은 전날 완전 절개보다 행사 당일 반절개가 덜 마름", null, null, null],
  ["탄산수는 주문 직전 붓기. 미리 부으면 김이 빠짐", null, null, null],
];
recipe.getRange("A11:D11").merge();
recipe.getRange("A11:D11").format.fill = { color: "#F2F6D8" };
recipe.getRange("A11:D11").format.font = { bold: true, color: "#12343B" };
recipe.getRange("A12:D15").merge(true);
recipe.getRange("A12:D15").format.borders = { preset: "all", style: "thin", color: "#D9E1DF" };
setWidths(recipe, [100, 150, 420, 220]);

styleTitle(guide, "A1:C1", "구매처 가이드");
guide.getRange(`A3:C${guideRows.length + 2}`).values = guideRows;
styleHeader(guide.getRange("A3:C3"));
styleBody(guide.getRange(`A4:C${guideRows.length + 2}`));
guide.tables.add(`A3:C${guideRows.length + 2}`, true, "GuideTable");
guide.getRange("A11:C11").merge();
guide.getRange("A11:C11").values = [["핵심 결론: 딸기잼 채택, 자허블 원액은 주문 직전 가격 재확인, 컵/용기는 도매 최소단위로 사면 여분이 생기지만 개당 단가가 낮습니다."]];
guide.getRange("A11:C11").format.fill = { color: "#FFF4D6" };
guide.getRange("A11:C11").format.font = { bold: true, color: "#513C06" };
setWidths(guide, [150, 300, 520]);

for (const sheetName of ["요약", "구매리스트", "가격비교", "레시피·구성", "구매처 가이드"]) {
  const sheet = workbook.worksheets.getItem(sheetName);
  sheet.getUsedRange().format.autofitRows();
}

await fs.mkdir(outputDir, { recursive: true });

for (const sheetName of ["요약", "구매리스트", "가격비교", "레시피·구성", "구매처 가이드"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(`${outputDir}/${sheetName}.png`, bytes);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: "요약!A3:B11",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 4,
});
console.log(summaryCheck.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
