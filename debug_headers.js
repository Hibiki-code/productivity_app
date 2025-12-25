
function logSheetHeaders() {
  const ss = SpreadsheetApp.openById('1-5unPqh1vhRY1thP7iWIasBy-OVh6iAB2yHaljzxL0Q');
  const sheets = ss.getSheets();
  const report = {};
  sheets.forEach(s => {
    const r = s.getLastRow();
    const c = s.getLastColumn();
    const headers = r > 0 ? s.getRange(1, 1, 1, c).getValues()[0] : [];
    const sample = r > 1 ? s.getRange(r, 1, 1, c).getValues()[0] : [];
    report[s.getName()] = { headers: headers, lastRowSample: sample };
  });
  console.log(JSON.stringify(report, null, 2));
}

