function migrateHabitDefinitions() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  // 1. Source: 習慣の内容説明
  // Headers: [習慣名, 所要時間, 想定場所・状況, 期待される効果, 開始日, SectionID, Icon]
  const sourceSheet = ss.getSheetByName('習慣の内容説明');
  if (!sourceSheet) return 'Source Sheet Missing';
  const sourceData = sourceSheet.getDataRange().getValues();
  if (sourceData.length < 2) return 'No Source Data';
  const sHeaders = sourceData[0];
  
  // Map Headers to Index
  const getIdx = (name) => sHeaders.indexOf(name);
  const idx = {
    name: getIdx('習慣名'),
    time: getIdx('所要時間'),
    desc: getIdx('期待される効果'), // Use 'Effect' as Description
    section: getIdx('SectionID'),
    icon: getIdx('Icon')
  };
  
  // 2. Target: DB_Habits
  let targetSheet = ss.getSheetByName('DB_Habits');
  if (!targetSheet) {
    targetSheet = ss.insertSheet('DB_Habits');
    targetSheet.appendRow(['id', 'name', 'icon', 'category', 'description', 'createdAt', 'updatedAt', 'status']);
  }
  
  // Map Target Name -> Row Index
  const targetData = targetSheet.getDataRange().getValues();
  const nameToRow = new Map();
  if (targetData.length > 1) {
    targetData.forEach((r, i) => {
        if(i > 0) nameToRow.set(r[1], i + 1); // r[1] is name, i+1 is row number (1-based)
    });
  }
  
  const rowsToAdd = [];
  const now = new Date();
  
  // Iterate Source & SYNC
  for (let i = 1; i < sourceData.length; i++) {
    const row = sourceData[i];
    const name = row[idx.name];
    if (!name) continue;
    
    const icon = idx.icon > -1 ? row[idx.icon] : '';
    const section = idx.section > -1 ? row[idx.section] : 'sec_morning';
    const desc = idx.desc > -1 ? row[idx.desc] : '';

    if (nameToRow.has(name)) {
        // UPDATE Existing
        const rowNum = nameToRow.get(name);
        if (icon) targetSheet.getRange(rowNum, 3).setValue(icon);
        if (section) targetSheet.getRange(rowNum, 4).setValue(section);
        if (desc) targetSheet.getRange(rowNum, 5).setValue(desc);
        targetSheet.getRange(rowNum, 7).setValue(new Date());
        targetSheet.getRange(rowNum, 8).setValue('ACTIVE');
        continue;
    }
    
    // Generate UUID for NEW
    const id = Utilities.getUuid();

    // [id, name, icon, category, description, createdAt, updatedAt, status]
    rowsToAdd.push([
      id,
      name,
      icon || 'water_drop', // Default
      section,
      desc,
      now,
      now,
      'ACTIVE'
    ]);
  }
  
  if (rowsToAdd.length > 0) {
    targetSheet.getRange(targetSheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
    return `Migrated ${rowsToAdd.length} new habits. (Updates also applied)`;
  } else {
    return 'Detailed Sync Complete. All ' + sourceData.length + ' source habits checked/updated.';
  }
}

/**
 * Task Migration (Old Sheet -> New Task DB)
 */
function migrateTasks() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sourceSheet = ss.getSheetByName('タスク'); // Or DB_Tasks
  if (!sourceSheet) return 'No Task Sheet found';
  
  const sData = sourceSheet.getDataRange().getValues();
  if (sData.length < 2) return 'No tasks to migrate';
  
  // Connect to New DB
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  let masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) masterSheet = db.insertSheet('タスクマスタ');
  
  // Master Headers: [タスクID, タスク名, 重要度, 所要時間, 期限, 詳細, 完了/未完了, アーカイブ]
  if (masterSheet.getLastRow() === 0) {
     masterSheet.appendRow(['タスクID', 'タスク名', '重要度', '所要時間', '期限', '詳細', '完了/未完了', 'アーカイブ']);
  }
  
  // Log Headers: [タスクログID, タスクID, 記録日時, 記録時ステータス]
  let logSheet = db.getSheetByName('タスクログ');
  if (!logSheet) {
    logSheet = db.insertSheet('タスクログ');
    logSheet.appendRow(['タスクログID', 'タスクID', '記録日時', '記録時ステータス']);
  }

  const rowsToAdd = [];
  const now = new Date();
  
  for (let i = 1; i < sData.length; i++) {
     const row = sData[i];
     const name = row[0]; // Name
     if (!name) continue;
     
     const statusRaw = String(row[6] || '');
     const isDone = (statusRaw === '完了' || statusRaw === 'TRUE');
     
     const uuid = Utilities.getUuid();
     const prio = row[1] || 0;
     const due = row[2];
     const time = row[4];
     const desc = row[5];
     
     // [ID, Name, Prio, Time, Due, Detail, Status, Archive]
     rowsToAdd.push([
        uuid,
        name,
        prio,
        time,
        due,
        desc,
        isDone, 
        false
     ]);
  }
  
  if (rowsToAdd.length > 0) {
      masterSheet.getRange(masterSheet.getLastRow()+1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
      return `Migrated ${rowsToAdd.length} tasks to New DB (TaskMaster).`;
  }
  return 'No valid tasks found to migrate.';
}
