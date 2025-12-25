function debugHeaders() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const report = {};
  sheets.forEach(s => {
    const r = s.getLastRow();
    const c = s.getLastColumn();
    const headers = r > 0 ? s.getRange(1, 1, 1, Math.max(1, c)).getValues()[0] : [];
    const sample = r > 1 ? s.getRange(r, 1, 1, Math.max(1, c)).getValues()[0] : [];
    report[s.getName()] = { headers: headers, lastRowSample: sample };
  });
  console.log(JSON.stringify(report, null, 2));
  return JSON.stringify(report);
}
