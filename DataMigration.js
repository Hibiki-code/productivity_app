function migrateHabitHeadersToIds() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId || CONFIG.SPREADSHEET_ID);

  // 1. Load Habit Definitions (Name -> ID Map)
  const defSheet = ss.getSheetByName('DB_Habits');
  if (!defSheet) {
    console.error('DB_Habits not found');
    return;
  }
  const defData = defSheet.getDataRange().getValues();
  const defMap = {}; // Name -> ID
  const headers = defData[0].map(h => String(h).trim().toLowerCase());

  // Find indices
  const idIdx = headers.indexOf('id');
  const titleIdx = headers.indexOf('title');

  if (idIdx === -1 || titleIdx === -1) {
    console.error('DB_Habits missing id or title column');
    return;
  }

  for (let i = 1; i < defData.length; i++) {
    const r = defData[i];
    const id = r[idIdx];
    const title = r[titleIdx];
    if (id && title) {
      defMap[String(title).trim()] = String(id);
    }
  }

  // 2. Load Habit Log (Matrix)
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  if (!logSheet) {
    console.error('HABIT_LOG sheet not found');
    return;
  }

  const logHeadersRaw = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
  const updates = [];

  for (let i = 0; i < logHeadersRaw.length; i++) {
    const header = String(logHeadersRaw[i]).trim();
    if (header === 'Date') continue;

    // Check if it's already an ID (UUID-like or starts with habit_)
    if (header.match(/^[0-9a-f]{8}-/i) || header.startsWith('habit_')) {
      console.log(`Header '${header}' seems to be an ID already.`);
      continue;
    }

    // Look up ID
    const newId = defMap[header];
    if (newId) {
      console.log(`Migrating Header: "${header}" -> "${newId}"`);
      // 1-based index is i + 1
      logSheet.getRange(1, i + 1).setValue(newId);
    } else {
      console.warn(`No ID found for header "${header}". Leaving as is.`);
    }
  }

  return 'Migration Complete';
}
