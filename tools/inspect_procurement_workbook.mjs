import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/mj/Library/Application Support/Claude/local-agent-mode-sessions/2b269bee-eaaf-4b41-8354-89e2f8be222e/6a788ee0-e2eb-4ee5-8862-f7f5d68214e4/local_2d1d868d-8d74-428f-b55a-2a5d2d2d897d/outputs/선교바자회_먹거리_원가구매표.xlsx";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetNames = workbook.worksheets?.items?.map((sheet) => sheet.name)
  ?? workbook.worksheets?.map?.((sheet) => sheet.name)
  ?? workbook.sheetNames
  ?? [];

console.log(JSON.stringify({ sheetNames }, null, 2));

for (const sheetName of sheetNames) {
  const check = await workbook.inspect({
    kind: "table",
    range: `${sheetName}!A1:N80`,
    include: "values,formulas",
    tableMaxRows: 80,
    tableMaxCols: 14,
  });
  console.log(`\n=== ${sheetName} ===`);
  console.log(check.ndjson);
}
