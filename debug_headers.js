function debugHeaders() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('DB_Habits');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  console.log('DB_Habits Headers:', headers);
  // Also check sample row
  const firstRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  console.log('Row 1 Data:', firstRow);
}
