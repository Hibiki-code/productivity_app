function deduplicateHabitLogs() {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
    if (!sheet) return 'Sheet not found';

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return 'No data';

    const headers = data[0];
    const dateMap = {}; // YYYY-MM-DD -> { rowIndex: number, values: [] }
    const rowsToDelete = [];

    // Iterate from TOP to BOTTOM. First occurrence is kept (usually).
    // Actually, we want to merge.
    // Best strategy:
    // 1. Group by Date.
    // 2. If multiple rows for same date, merge them.
    // 3. Keep the first row, update its values. Delete others.

    for (let i = 1; i < data.length; i++) { // Skip Header
        const rowRaw = data[i][0];
        if (!rowRaw) continue;

        let dateKey = '';
        try {
            const d = new Date(rowRaw);
            if (isNaN(d.getTime())) continue; // Skip titles/garbage
            dateKey = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
        } catch (e) { continue; }

        if (!dateMap[dateKey]) {
            dateMap[dateKey] = {
                mainRowIndex: i + 1, // 1-based
                dataIndex: i,
                mergedValues: [...data[i]] // Copy
            };
        } else {
            // Duplicate found! Merge into the main one.
            const entry = dateMap[dateKey];
            const duplicateRow = data[i];

            // Merge logic: If main is empty/0 and duplicate has value, take duplicate.
            for (let c = 1; c < headers.length; c++) {
                const mainVal = entry.mergedValues[c];
                const dupVal = duplicateRow[c];

                // Treat 0 or "" as empty. 1, 2, true are values.
                const isMainSet = (mainVal == 1 || mainVal == 2 || mainVal === true);
                const isDupSet = (dupVal == 1 || dupVal == 2 || dupVal === true);

                if (!isMainSet && isDupSet) {
                    entry.mergedValues[c] = dupVal;
                }
            }
            rowsToDelete.push(i + 1); // Mark for deletion
        }
    }

    // Perform Updates
    // 1. Update map entries
    const updates = Object.values(dateMap);
    for (const entry of updates) {
        if (rowsToDelete.length > 0) { // Only strict need if we actually merged something?
            // Just update every main row to be safe with merged data
            sheet.getRange(entry.mainRowIndex, 1, 1, entry.mergedValues.length).setValues([entry.mergedValues]);
        }
    }

    // 2. Delete Duplicates (Reverse order to keep indices valid)
    rowsToDelete.sort((a, b) => b - a);
    for (const r of rowsToDelete) {
        sheet.deleteRow(r);
    }

    return `Fixed ${rowsToDelete.length} duplicate rows.`;
}
