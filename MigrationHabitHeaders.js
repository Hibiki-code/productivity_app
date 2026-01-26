function migrateHabitLogHeaders() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const dbSheet = ss.getSheetByName('DB_Habits');
    const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);

    if (!dbSheet || !logSheet) return 'Sheet not found';

    // Build Name -> ID Map from DB
    const dbData = dbSheet.getDataRange().getValues();
    const hHeaders = dbData[0].map(h => String(h).trim().toLowerCase());
    const titleIdx = hHeaders.indexOf('title') > -1 ? hHeaders.indexOf('title') : 1;
    const idIdx = hHeaders.indexOf('id') > -1 ? hHeaders.indexOf('id') : 0;

    const nameToId = {};
    for (let i = 1; i < dbData.length; i++) {
        const name = String(dbData[i][titleIdx]);
        const id = dbData[i][idIdx];
        if (name && id) {
            nameToId[name] = id;
        }
    }

    // Process Log Headers
    const logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];

    for (let c = 0; c < logHeaders.length; c++) {
        const header = String(logHeaders[c]);
        // Skip Date
        if (header === 'Date' || header === '') continue;

        // Check if it's a Name
        if (nameToId[header]) {
            // It is a Name! Replace with ID
            const newId = nameToId[header];
            logSheet.getRange(1, c + 1).setValue(newId);
            console.log(`Migrated Header: ${header} -> ${newId}`);
        } else {
            // Check if it is already an ID? 
            // How to check? UUID regex?
            // Or just assume if not in Name Map, it might be an ID or Unknown.
            // If valid ID, it's fine.
            console.log(`Skipping Header: ${header} (Already ID or Unknown)`);
        }
    }
    return 'Migration Complete';
}
