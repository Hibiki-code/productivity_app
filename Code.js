/**
 * Config
 */
const CONFIG = {
  SPREADSHEET_ID: '1-5unPqh1vhRY1thP7iWIasBy-OVh6iAB2yHaljzxL0Q', // Main DB (Habits + Tasks)
  TASK_DB_ID: '1-5unPqh1vhRY1thP7iWIasBy-OVh6iAB2yHaljzxL0Q', // Unified
  SHEET_NAMES: {
    TASKS: 'タスクマスタ', // Updated from 'タスク' to match actual sheet
    HABIT_LOG: '習慣記録',
    HABIT_DETAILS: '習慣の内容説明',
    HABIT_STATS: '習慣の統計データ',
    SLEEP: '睡眠記録',
    DB_GOALS: 'DB_Goals',
    DB_MILESTONES: 'DB_Milestones'
  },
  GEMINI_API_KEY: 'Pending',
  TIMEZONE: 'Asia/Tokyo'
};

function doGet() {
  const template = HtmlService.createTemplateFromFile('index');

  // Server-Side Rendering (SSR) of Initial Data
  // This bypasses google.script.run for the first paint, ensuring data confirms
  try {
    const tasks = getTasks();
    const habits = getHabitStatus(new Date().toDateString()); // Today

    template.initialTasksJson = JSON.stringify(tasks);
    template.initialHabitsJson = JSON.stringify(habits);
    template.ssrError = null;

  } catch (e) {
    console.error("SSR Error", e);
    template.initialTasksJson = '[]';
    template.initialHabitsJson = '{}';
    template.ssrError = 'Server Error: ' + e.toString() + ' Stack: ' + e.stack;
  }

  const html = template.evaluate();
  html.setTitle('Life OS (Refined)');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0');
  return html;
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Helper to handle Sheet Name mismatches (Full-width/Half-width/Spaces)
 */
function getSafeSheet(ss, name) {
  // 1. Try Exact Match
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  // 2. Fuzzy Search & Fix
  const allSheets = ss.getSheets();
  const normalize = (s) => s.trim().replace(/＿/g, '_').toLowerCase();
  const targetNorm = normalize(name);

  for (const s of allSheets) {
    const sName = s.getName();
    if (normalize(sName) === targetNorm) {
      console.warn(`Found fuzzy match: "${sName}" -> Renaming to "${name}"`);
      s.setName(name); // Rename to strict ASCII
      return s;
    }
  }
  return null;
}


/**
 * TASKS API
 */
/**
 * TASKS API
 */
/**
 * Helper to get sheet with fuzzy name matching (ignoring whitespace)
 */
function getSheetByNameFuzzy(db, name) {
  let sheet = db.getSheetByName(name);
  if (sheet) return sheet;

  // Fallback: Fuzzy Search
  const sheets = db.getSheets();
  const targetClean = name.trim();
  for (const s of sheets) {
    if (s.getName().trim() === targetClean) {
      return s;
    }
  }
  return null;
}

function getTasks() {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const sheetName = CONFIG.SHEET_NAMES.TASKS;
  const sheet = getSheetByNameFuzzy(db, sheetName);

  if (!sheet) {

    if (!sheet) {
      const allSheets = sheets.map(s => s.getName());
      console.error(`Sheet '${sheetName}' not found. Available: ${allSheets.join(', ')}`);

      // Return debug task
      return [{
        id: 'debug-error',
        name: `エラー: シート「${sheetName}」が見つかりません`,
        description: `【現在存在するシート一覧】\n${allSheets.join('\n')}\n\nシート名に余分なスペースが含まれている可能性があります。確認してください。`,
        status: '未完了',
        importance: 3
      }];
    }
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const rows = data.slice(1);

  // Headers: [ID, Name, Prio, Time, Due, Detail, Status, Archive]
  // Indices: 0, 1, 2, 3, 4, 5, 6, 7

  return rows.map((row, i) => {
    // Filter out Archived
    const isArchived = row[7];
    if (isArchived === true) return null;

    // Status Logic
    const isDone = (row[6] === true || row[6] === 'TRUE');

    // Date
    let d = row[4];
    if (d instanceof Date) {
      d = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy/MM/dd');
    }

    return {
      id: String(row[0]), // UUID
      row: i + 2, // Keep for debugging, but ID is primary
      name: String(row[1]),
      importance: Number(row[2]) || 0,
      dueDate: d || '',
      estTime: row[3],
      description: row[5] || '',
      status: isDone ? '完了' : '未完了',
      // Highlight Logic
      // Col 8 = DailyHighlight, Col 9 = HighlightDay
      isHighlight: (row[8] === true || row[8] === 'TRUE')
    };
  }).filter(t => t && t.name);
}

function addTask(task) {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  let sheet = db.getSheetByName('タスクマスタ');

  // [タスクID, タスク名, 重要度, 所要時間, 期限, 詳細, 完了/未完了, アーカイブ]
  const id = Utilities.getUuid();
  const now = new Date();

  sheet.appendRow([
    id,
    task.name,
    task.importance, // 0-3
    task.estTime,
    task.dueDate,
    task.description,
    false, // Status: Not Done
    false  // Archive: Active
  ]);

  return 'Added';
}

function updateTaskStatus(taskId, statusStr) {
  // statusStr comes from UI as '完了' or '未完了' (or boolean?)
  // UI logic sends '完了'/'未完了'.
  const isDone = (statusStr === '完了' || statusStr === true);

  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) return 'No Master Sheet';

  // Find Row by UUID (Column A)
  // Use text finder for speed
  const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  const row = cell.getRow();

  // Update Status (Column G = 7)
  masterSheet.getRange(row, 7).setValue(isDone);

  // Check Highlight Status (Log-Centric)
  const today = new Date();
  const todayStr = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy/MM/dd');

  let highlightBonus = false;

  // Update Highlight Log if applicable
  const logSheet = db.getSheetByName('ハイライトログ');
  if (logSheet && isDone) {
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1) {
      const vals = logSheet.getRange(lastRow, 1, 1, 6).getValues()[0];
      // Row: [Date, SetFlag, TargetID, Type, Achieved, Time]
      // Check Date
      let logDate = vals[0];
      if (logDate instanceof Date) logDate = Utilities.formatDate(logDate, CONFIG.TIMEZONE, 'yyyy/MM/dd');

      if (logDate === todayStr && (vals[1] === true || vals[1] === 'TRUE') && String(vals[2]) === String(taskId)) {
        // It's the highlight!
        // Set Achieved = TRUE (Col 5), Time = HH:mm (Col 6)
        const timeStr = Utilities.formatDate(today, CONFIG.TIMEZONE, 'HH:mm');
        logSheet.getRange(lastRow, 5).setValue(true);
        logSheet.getRange(lastRow, 6).setValue(timeStr);
        highlightBonus = true;
      }
    }
  }

  // Log Entry (TaskLog)
  const taskLogSheet = db.getSheetByName('タスクログ');
  if (taskLogSheet) {
    taskLogSheet.appendRow([
      Utilities.getUuid(),
      taskId,
      new Date(),
      isDone
    ]);
  }

  return { status: 'Updated', highlightBonus: highlightBonus };
}

function deleteTaskHard(taskId) {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) return 'No Master Sheet';

  const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  masterSheet.deleteRow(cell.getRow());
  return 'Deleted';
}

function unarchiveTask(taskId) {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) return 'No Master Sheet';

  const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  // Archive Column is H (8) - Set to FALSE
  masterSheet.getRange(cell.getRow(), 8).setValue(false);
  return 'Unarchived';
}

function getArchivedTasks() {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const sheet = db.getSheetByName('タスクマスタ');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const rows = data.slice(1);

  // Headers: [ID, Name, Prio, Time, Due, Detail, Status, Archive]
  return rows.map((row, i) => {
    const isArchived = row[7];
    if (isArchived !== true) return null; // Only Archived

    // Status Logic
    const isDone = (row[6] === true || row[6] === 'TRUE');

    let d = row[4];
    if (d instanceof Date) d = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy/MM/dd');

    return {
      id: String(row[0]),
      name: String(row[1]),
      importance: Number(row[2]) || 0,
      dueDate: d || '',
      description: row[5] || '',
      status: isDone ? '完了' : '未完了'
    };
  }).filter(t => t);
}

function archiveTask(taskId) {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = getSheetByNameFuzzy(db, CONFIG.SHEET_NAMES.TASKS);
  if (!masterSheet) return 'No Master Sheet';

  const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  // Archive Column is H (8)
  masterSheet.getRange(cell.getRow(), 8).setValue(true);
  return 'Archived';
}

function updateTaskDetails(task) {
  // task object: { id, name, importance, estTime, dueDate, description }
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) return 'No Master Sheet';

  const finder = masterSheet.getRange("A:A").createTextFinder(task.id).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  const row = cell.getRow();

  // Update Columns: Name(2), Importance(3), Time(4), Due(5), Desc(6)
  if (task.name) masterSheet.getRange(row, 2).setValue(task.name);
  if (task.importance !== undefined) masterSheet.getRange(row, 3).setValue(task.importance);
  if (task.estTime !== undefined) masterSheet.getRange(row, 4).setValue(task.estTime);
  if (task.dueDate !== undefined) masterSheet.getRange(row, 5).setValue(task.dueDate);
  if (task.description !== undefined) masterSheet.getRange(row, 6).setValue(task.description);

  return 'Updated Details';
}

function updateTaskPriority(taskId, priority) {
  const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const masterSheet = db.getSheetByName('タスクマスタ');
  if (!masterSheet) return 'No Master Sheet';

  // Find Row by UUID (Column A)
  const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return 'Task Not Found';

  const row = cell.getRow();

  // Priority is Column C (3)
  masterSheet.getRange(row, 3).setValue(priority);
  return 'Updated';
}

/**
 * DAILY HIGHLIGHT (V3 - Log Centric)
 */
function ensureTodayHighlightLog(db) {
  let sheet = db.getSheetByName('ハイライトログ');
  if (!sheet) {
    sheet = db.insertSheet('ハイライトログ');
    // Headers: [Date, SetFlag, TargetID, TargetType, AchievedFlag, AchievedTime]
    sheet.appendRow(['日付', '設定フラグ', 'ターゲットID', 'ターゲットタイプ', '達成フラグ', '達成時刻']);
  }

  const today = new Date();
  const todayStr = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy/MM/dd');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    // Empty
    sheet.appendRow([todayStr, false, '', '', false, '']);
    return sheet.getLastRow(); // 2
  }

  const lastDateRaw = sheet.getRange(lastRow, 1).getValue();
  let lastDate = lastDateRaw;
  if (lastDateRaw instanceof Date) lastDate = Utilities.formatDate(lastDateRaw, CONFIG.TIMEZONE, 'yyyy/MM/dd');

  if (lastDate !== todayStr) {
    // New Day
    sheet.appendRow([todayStr, false, '', '', false, '']);
    return sheet.getLastRow();
  }

  return lastRow; // Today exists
}

function setDailyHighlight(taskId) {
  try {
    const db = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
    const masterSheet = getSheetByNameFuzzy(db, CONFIG.SHEET_NAMES.TASKS);
    if (!masterSheet) return 'No Master Sheet';

    // 1. Ensure Log Row
    const logRow = ensureTodayHighlightLog(db);
    const logS = db.getSheetByName('ハイライトログ');

    // 2. Update Log
    // [Date, SetFlag, TargetID, Type, Achieved, Time]
    // Cols: 1, 2, 3, 4, 5, 6
    logS.getRange(logRow, 2).setValue(true);      // SetFlag
    logS.getRange(logRow, 3).setValue(taskId);    // TargetID
    logS.getRange(logRow, 4).setValue('Task');    // Type
    logS.getRange(logRow, 5).setValue(false);     // AchievedFlag
    logS.getRange(logRow, 6).setValue('');        // Time

    // 3. Update Cache in TaskMaster (TodayHighlight Col 9)
    // Optimization: Bulk read 9th column
    const lastRow = masterSheet.getLastRow();
    if (lastRow > 1) {
      // Bulk Clear
      masterSheet.getRange(2, 9, lastRow - 1, 1).setValue(false);
    }

    // Set New
    const finder = masterSheet.getRange("A:A").createTextFinder(taskId).matchEntireCell(true);
    const cell = finder.findNext();
    if (cell) {
      masterSheet.getRange(cell.getRow(), 9).setValue(true);
    }

    return 'Highlight Set: ' + taskId;

  } catch (e) {
    console.error("Highlight Error", e);
    return 'Error: ' + e.message;
  }
}


/**
 * HABITS API (Optimized for Legacy Sheet '習慣記録１')
 */

/**
 * HABITS API (Optimized for Legacy Sheet '習慣記録１')
 */
function getHabitStatus(dateStr) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 0. Ensure Sections Exist (Auto-Migration)
  let sections = getHabitSections();
  if (sections.length === 0) {
    setupHabitSectionsDB();
    sections = getHabitSections();
  }

  // 1. Get Habit Definitions from 'DB_Habits'
  const defSheet = ss.getSheetByName('DB_Habits');
  if (!defSheet) return { habits: [], sections: [] }; // Safety

  const defData = defSheet.getDataRange().getValues();
  const rawHeaders = defData.shift();

  // Headers: [id, title, icon, section, benefit, isActive, createdAt, text_input, time_needed]
  const hMap = {};
  rawHeaders.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);

  // Fallback Indices (Safety Net based on Screenshot)
  // A=0: id, B=1: title, C=2: icon, D=3: section, E=4: benefit, F=5: isActive, G=6: createdAt, H=7: text_input, I=8: time_needed
  const FALLBACK = {
    id: 0,
    title: 1,
    icon: 2,
    section: 3,
    benefit: 4,
    isactive: 5,
    text_input: 7,
    time_needed: 8
  };

  const getVal = (r, key, def) => {
    let idx = hMap[key.toLowerCase()];
    if (idx === undefined) idx = FALLBACK[key.toLowerCase()];
    return (idx !== undefined && r[idx] !== undefined) ? r[idx] : def;
  };

  const habits = defData.map(r => {
    // Correctly map DB_Habits columns to App keys
    const title = getVal(r, 'title', '');
    if (!title) return null;

    // Status check
    const isActiveVal = getVal(r, 'isActive', 'ACTIVE'); // 'ACTIVE' or TRUE
    // User might use 'ACTIVE' string or boolean TRUE. Screenshot shows 'ACTIVE'.
    if (String(isActiveVal).toUpperCase() !== 'ACTIVE' && isActiveVal !== true) return null;

    return {
      id: getVal(r, 'id', ''),
      name: title, // Map 'title' to Internal 'name'
      icon: getVal(r, 'icon', 'water_drop'),
      sectionId: getVal(r, 'section', 'sec_morning'),
      benefit: getVal(r, 'benefit', ''),
      hasTextInput: (getVal(r, 'text_input', false) === true),
      time: getVal(r, 'time_needed', '')
    };
  }).filter(h => h);

  // 2. Get Stats... (unchanged)
  let statMap = {};
  const statSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_STATS);
  if (statSheet) {
    const statData = statSheet.getDataRange().getValues();
    statData.shift();
    statData.forEach(r => {
      statMap[r[0]] = { streak: r[1], rate30: r[2], rateAll: r[3] };
    });
  }

  // 3. Get Logs from HABIT_LOG
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  const logData = logSheet.getDataRange().getValues();
  const logHeaders = logData[0]; // Date, Habit1, Habit2...

  const targetDate = new Date(dateStr);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth(); // 0-11
  const targetDateNum = targetDate.getDate();

  const monthlyLogs = {};
  habits.forEach(h => monthlyLogs[h.name] = {});

  const todaysLog = {};

  // Helper to normalize Date from Sheet (which might be Object or String)
  const normalizeDate = (d) => {
    const dateObj = new Date(d);
    return { year: dateObj.getFullYear(), month: dateObj.getMonth(), date: dateObj.getDate() };
  };

  for (let i = 1; i < logData.length; i++) {
    const rowRaw = logData[i][0];
    if (!rowRaw) continue;

    // Robust String Comparison
    let rowYMD = '';
    try {
      const d = new Date(rowRaw);
      rowYMD = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    } catch (e) {
      continue;
    }

    // Check Date Match
    // Check Date Match (Numeric)
    const rDate = new Date(rowRaw);
    if (rDate.getFullYear() === targetYear && rDate.getMonth() === targetMonth && rDate.getDate() === targetDateNum) {
      console.log('Match found (numeric) for:', dateStr);
      for (let c = 1; c < logHeaders.length; c++) {
        const hName = logHeaders[c];
        const val = logData[i][c];
        const isDone = (val == 1 || val === true || val === 'TRUE');
        todaysLog[hName] = isDone ? 1 : 0;
      }
    }

    // Collect Month Data (Legacy logic optimization)
    // If we want monthly calendar for *current* month view? 
    // Actually the frontend cache handles the calendar mostly. 
    // getHabitStatus is mainly for the List View (Target Date).
    // The previous code collected monthlyLogs for the target month too.
    // We can keep that if valid, but string comparison is safer for the "Target Day".

    // (Optional) Retain monthly collection?
    // The previous logic used 'normalizeDate' for monthly buckets.
    // I will skip monthlyLogs collection in this pass for simplicity unless required?
    // Frontend uses data.monthlyLogs to update calendar cache (Line 1179).
    // So I MUST populate monthlyLogs.

    const dObj = new Date(rowRaw);
    if (dObj.getFullYear() === targetYear && dObj.getMonth() === targetMonth) {
      const day = dObj.getDate();
      for (let c = 1; c < logHeaders.length; c++) {
        const hName = logHeaders[c];
        const val = logData[i][c];
        const isDone = (val == 1 || val === true || val === 'TRUE');
        if (!monthlyLogs[hName]) monthlyLogs[hName] = {};
        monthlyLogs[hName][day] = isDone ? 1 : 0;
      }
    }
  }

  // Merge
  const enrichedHabits = habits.map(h => {
    const s = statMap[h.name] || {};
    return {
      ...h,
      streak: s.streak || 0,
      rate30: s.rate30 || 0,
      status: todaysLog[h.name] || 0
    };
  });

  return {
    habits: enrichedHabits,
    sections: sections,
    log: todaysLog,
    monthlyLogs: monthlyLogs,
    serverDate: { year: targetYear, month: targetMonth + 1 }
  };
}

function logHabit(dateStr, habitName, status) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 1. EVENT LOGGING (DB_HabitLogs) - Transaction Log
  let dbSheet = ss.getSheetByName('DB_HabitLogs');
  if (!dbSheet) {
    dbSheet = ss.insertSheet('DB_HabitLogs');
    dbSheet.appendRow(['Timestamp', 'DateTarget', 'Habit', 'Status', 'UserAgent']); // Legacy headers or new?
    // Plan said: id, date, habitId, status, value, timestamp
    // Ideally we assume columns if it exists.
    // Let's stick to appending in a robust way or matching headers.
    // For now, let's keep the existing format I made earlier: Timestamp, DateTarget, Habit, Status, UserAgent
    // To be perfectly aligned with plan, we should look up ID.
  }

  // Lookup ID from DB_Habits
  const dbHabits = ss.getSheetByName('DB_Habits').getDataRange().getValues();
  let habitId = '';
  // DB_Habits new schema: id(0), title(1)
  // Assuming Fallback if header search fails: title is idx 1
  const hHeaders = dbHabits[0].map(h => String(h).trim().toLowerCase());
  let titleIdx = hHeaders.indexOf('title');
  const idIdx = hHeaders.indexOf('id');

  if (titleIdx === -1) titleIdx = 1; // Fallback
  // idIdx usually 0

  if (titleIdx > -1 && idIdx > -1) {
    for (let i = 1; i < dbHabits.length; i++) {
      if (dbHabits[i][titleIdx] === habitName) {
        habitId = dbHabits[i][idIdx];
        break;
      }
    }
  }

  // 2. Validate/Align Headers with [id, date, habitId, status, value, updatedAt]
  // We assume the sheet is already set up correctly by migration or prior manual creation.
  // Schema: id, date, habitId, status, value, updatedAt

  if (dbSheet.getLastRow() === 0) {
    dbSheet.appendRow(['id', 'date', 'habitId', 'status', 'value', 'updatedAt']);
  }

  // Prepare Row
  const logId = Utilities.getUuid();
  const value = status ? 1 : 0;
  const statusStr = status ? 'DONE' : 'SKIPPED'; // Or 'NONE'? Matrix uses 1/0. Let's use 'DONE' for consistency with schema.

  dbSheet.appendRow([logId, dateStr, habitId, statusStr, value, new Date()]);


  // 2. MATRIX UPDATE (習慣記録１)
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  const data = sheet.getDataRange().getValues();
  let headers = data.length > 0 ? data[0] : [];

  // Dynamic Column Creation/Fix
  let colIndex = headers.indexOf(habitName);
  if (colIndex === -1) {
    if (headers.length === 0) {
      headers = ['Date']; // Init
      sheet.appendRow(['Date']);
    }
    colIndex = headers.length;
    sheet.getRange(1, colIndex + 1).setValue(habitName); // Add Header
    headers.push(habitName);
  }

  const targetYMD = Utilities.formatDate(new Date(dateStr), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  let rowIndex = -1;
  // Search from bottom up optimization
  for (let i = data.length - 1; i >= 1; i--) {
    const rowDateRaw = data[i][0];
    if (!rowDateRaw) continue;
    const rowYMD = Utilities.formatDate(new Date(rowDateRaw), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    if (rowYMD === targetYMD) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    sheet.appendRow([targetYMD]);
    rowIndex = sheet.getLastRow();
  }

  sheet.getRange(rowIndex, colIndex + 1).setValue(status ? 1 : 0);

  // 3. STATS UPDATE (Lightweight)
  updateSingleHabitStreak(habitName);

  return 'Updated';
}

function logHabitText(dateStr, habitName, text) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logName = '日記記録'; // New Sheet Name
  let sheet = ss.getSheetByName(logName);

  if (!sheet) {
    sheet = ss.insertSheet(logName);
    sheet.appendRow(['日付']); // Header Init
  }

  // 1. Ensure Column Exists (Habit Name)
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let colIndex = headers.indexOf(habitName);

  if (colIndex === -1) {
    if (lastCol === 0) {
      // Should not happen if we appended '日付'
      sheet.appendRow(['日付', habitName]);
      colIndex = 1;
    } else {
      colIndex = lastCol; // New is at index = length of old array (which is 1-based size) -> Wait.
      // headers length is lastCol.
      // We write to lastCol + 1. Index in headers array would be headers.length.
      sheet.getRange(1, lastCol + 1).setValue(habitName);
    }
  }

  // 2. Ensure Row Exists (Date)
  // Use TextFinder for date (A:A)
  const targetYMD = Utilities.formatDate(new Date(dateStr), CONFIG.TIMEZONE, 'yyyy/MM/dd');
  // Note: Standard sheet date format might be yyyy/MM/dd or yyyy-MM-dd.
  // The Matrix usually uses what matches the User Locale. 
  // Let's search by string first.

  // Optimization: Check last row first (common case: today)
  const lastRow = sheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const lastDateRaw = sheet.getRange(lastRow, 1).getValue();
    let lastDateStr = '';
    if (lastDateRaw instanceof Date) lastDateStr = Utilities.formatDate(lastDateRaw, CONFIG.TIMEZONE, 'yyyy/MM/dd');
    else lastDateStr = String(lastDateRaw);

    if (lastDateStr === targetYMD) rowIndex = lastRow;
  }

  if (rowIndex === -1) {
    // Search whole column
    const dates = sheet.getRange("A:A").getValues().map(r => {
      if (r[0] instanceof Date) return Utilities.formatDate(r[0], CONFIG.TIMEZONE, 'yyyy/MM/dd');
      return String(r[0]);
    });
    // IndexOf + 1 (1-based)
    rowIndex = dates.indexOf(targetYMD) + 1;
  }

  if (rowIndex === 0) { // Not found (indexOf -1 -> 0)
    sheet.appendRow([targetYMD]);
    rowIndex = sheet.getLastRow();
  }

  // 3. Write Data (Intersection)
  // colIndex is 0-based index in headers array. 
  // Column number is colIndex + 1.
  sheet.getRange(rowIndex, colIndex + 1).setValue(text);

  return 'Logged Text';
}

function getHabitTextLogs(habitName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logName = '日記記録'; // Matrix Sheet
  const sheet = ss.getSheetByName(logName);

  if (!sheet) return [];

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIndex = headers.indexOf(habitName); // 0-based index in headers

  if (colIndex === -1) return [];

  // Read Column Data (Column index is colIndex + 1)
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Bulk Read: Date(Col 1) and Target(Col X)
  // Optimization: Read entire range or just two columns?
  // Reading two non-adjacent columns is tricky. Read DataRange is simplest.
  const data = sheet.getDataRange().getValues(); // [Row][Col]

  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const val = row[colIndex];
    if (val && String(val).trim() !== '') {
      // Found Log
      let dStr = '';
      if (row[0] instanceof Date) {
        dStr = Utilities.formatDate(row[0], CONFIG.TIMEZONE, 'yyyy/MM/dd');
      } else {
        dStr = String(row[0]);
      }

      results.push({
        date: dStr,
        text: String(val)
      });
    }
  }

  // Sort DESC
  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  return results;
}

function getHabitCalendar(habitName, year, month) {
  // Use getHabitStatus logic but for specific month?
  // User wants optimized load.
  // We can reuse the logic in getHabitStatus or just do a quick scan.
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIndex = headers.indexOf(habitName);

  if (colIndex === -1) return {};

  const result = {};
  for (let i = 1; i < data.length; i++) {
    const d = new Date(data[i][0]);
    if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
      const val = data[i][colIndex];
      result[d.getDate()] = (val === 1 || val === true || val === 'TRUE') ? 1 : 0;
    }
  }
  return result;
}

// -----------------------------------------------------------------------------
// OPTIMIZED STATS UPDATE
// -----------------------------------------------------------------------------


function logSleep(dateStr, bedtime, wakeup) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetName = '睡眠記録';
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['日付', '睡眠開始時刻', '睡眠終了時刻', '睡眠時間']);
  }

  // Find Row by Date (Column A)
  const targetYMD = Utilities.formatDate(new Date(dateStr), CONFIG.TIMEZONE, 'yyyy/MM/dd');

  // Optimization: Check last row first
  const lastRow = sheet.getLastRow();
  let rowIndex = -1;

  if (lastRow > 1) {
    const lastDateRaw = sheet.getRange(lastRow, 1).getValue();
    let lastDateStr = '';
    if (lastDateRaw instanceof Date) lastDateStr = Utilities.formatDate(lastDateRaw, CONFIG.TIMEZONE, 'yyyy/MM/dd');
    else lastDateStr = String(lastDateRaw);

    if (lastDateStr === targetYMD) rowIndex = lastRow;
  }

  if (rowIndex === -1) {
    // Search whole column
    const dates = sheet.getRange("A:A").getValues().map(r => {
      if (r[0] instanceof Date) return Utilities.formatDate(r[0], CONFIG.TIMEZONE, 'yyyy/MM/dd');
      return String(r[0]);
    });
    // IndexOf + 1 (1-based)
    rowIndex = dates.indexOf(targetYMD) + 1;
  }

  if (rowIndex === 0) { // Not found
    sheet.appendRow([targetYMD]);
    rowIndex = sheet.getLastRow();
  }

  // Write Times (Col B and C)
  // Bedtime -> Col 2, Wakeup -> Col 3
  if (bedtime) sheet.getRange(rowIndex, 2).setValue(bedtime);
  if (wakeup) sheet.getRange(rowIndex, 3).setValue(wakeup);

  // Col 4 (Duration) is assumed to be a formula. We do not write to it.

  return 'Logged Sleep';
}


function updateSingleHabitStreak(habitName, isDone) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const statSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_STATS);
  if (!statSheet) return;

  const data = statSheet.getDataRange().getValues();
  // Header: Habit, Streak, Rate30, RateAll
  let rowIndex = -1;
  let currentStreak = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === habitName) {
      rowIndex = i + 1;
      currentStreak = Number(data[i][1] || 0);
      break;
    }
  }

  // Simple Heuristic: 
  // If Done -> Streak++ (Optimization: User sees immediate increment)
  // If Not Done -> Streak-- (or 0? Hard to know if it was 100 before and we just unchecked today)
  // Conservative: If unchecked, set to 0 or logic requires reading history.
  // Given "Persistence" request, let's be safer:
  // We will NOT guess. We will read the history for this ONE habit.
  // It is faster than reading ALL habits.

  const streak = calculateSingleStreak(habitName); // Helper

  if (rowIndex === -1) {
    // statSheet.appendRow([habitName, streak, 0, 0]); // Stop appending if user manages row? Or just append 0? 
    // User said "quote current_streak...".
    // If we append a new row, we might break formulas.
    // Safer to DO NOTHING if row missing? Or append only name?
    // Let's assume row exists or user handles it. 
    // But if we MUST append, maybe just append name?
    // statSheet.appendRow([habitName]); 
  } else {
    // statSheet.getRange(rowIndex, 2).setValue(streak); // READ ONLY Mode requested for streak
  }
}

function calculateSingleStreak(habitName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  if (!logSheet) return 0;

  const data = logSheet.getDataRange().getValues();
  if (data.length === 0) return 0;
  const headers = data[0];
  const colIndex = headers.indexOf(habitName);
  if (colIndex === -1) return 0;

  // Extract dates for this habit
  const dates = [];
  const timeZone = CONFIG.TIMEZONE;
  for (let i = 1; i < data.length; i++) {
    const val = data[i][colIndex];
    if (val === 1 || val === true || val === 'TRUE') {
      const d = new Date(data[i][0]);
      if (!isNaN(d.getTime())) {
        dates.push(Utilities.formatDate(d, timeZone, 'yyyy-MM-dd'));
      }
    }
  }
  dates.sort();

  let streak = 0;
  let today = new Date();
  let check = Utilities.formatDate(today, timeZone, 'yyyy-MM-dd');

  // If today not done, check yesterday
  if (dates.indexOf(check) === -1) {
    today.setDate(today.getDate() - 1);
    check = Utilities.formatDate(today, timeZone, 'yyyy-MM-dd');
  }

  while (dates.indexOf(check) !== -1) {
    streak++;
    today.setDate(today.getDate() - 1);
    check = Utilities.formatDate(today, timeZone, 'yyyy-MM-dd');
  }
  return streak;
}

function calculateStats() {
  // Keeping for periodic updates if needed
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  const data = logSheet.getDataRange().getValues();
  const headers = data[0];

  const stats = {};

  for (let c = 1; c < headers.length; c++) {
    const hName = headers[c];
    const dates = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][c] == 1) {
        const d = new Date(data[i][0]);
        if (!isNaN(d.getTime())) dates.push(Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'));
      }
    }
    dates.sort();

    let streak = 0;
    let today = new Date();
    let check = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy-MM-dd');

    if (dates.indexOf(check) === -1) {
      today.setDate(today.getDate() - 1);
      check = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    }

    while (dates.indexOf(check) !== -1) {
      streak++;
      today.setDate(today.getDate() - 1);
      check = Utilities.formatDate(today, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    }
    stats[hName] = { streak: streak };
  }

  const statSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_STATS);
  statSheet.clearContents();
  statSheet.appendRow(['Habit', 'Streak', 'Rate30', 'RateAll']);

  Object.keys(stats).forEach(h => {
    statSheet.appendRow([h, stats[h].streak, 0, 0]);
  });
}

function getSchedule() {
  return []; // Placeholder
}

function getSecretarySuggestions() { return ''; }


/**
 * SECTIONS & SETTINGS API
 */
function setupHabitSectionsDB() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 1. Create Sections Sheet if missing
  let secSheet = ss.getSheetByName('習慣セクション');
  if (!secSheet) {
    secSheet = ss.insertSheet('習慣セクション');
    secSheet.appendRow(['ID', 'Name', 'Order']);
    // Defaults
    const defaults = [
      ['sec_morning', '朝', 1],
      ['sec_afternoon', '昼', 2],
      ['sec_evening', '夜', 3],
      ['sec_other', 'その他', 4]
    ];
    // Write defaults
    secSheet.getRange(2, 1, defaults.length, 3).setValues(defaults);
  }

  // 2. Migrate Habit Definitions
  const defSheet = ss.getSheetByName('習慣の内容説明');
  const lastCol = defSheet.getLastColumn();
  const headers = defSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  let secColIndex = headers.indexOf('SectionID') + 1;
  const timeColIndex = headers.indexOf('所要時間') + 1; // Assuming '所要時間' is col 2 (index 1) which was Time? No, Time is col 2.
  // Wait, headers might be `['習慣名', '所要時間', ...]`
  // Let's rely on standard index 1 (0-based) for Time if header search fails, but header search is better.
  // Original Code: habits = defData.map(r => ({ name: r[0], time: r[1]...

  if (secColIndex === 0) {
    secColIndex = lastCol + 1;
    defSheet.getRange(1, secColIndex).setValue('SectionID');
  }

  const lastRow = defSheet.getLastRow();
  if (lastRow > 1) {
    const range = defSheet.getRange(2, 1, lastRow - 1, Math.max(secColIndex, lastCol));
    const values = range.getValues();
    const updates = [];

    // Mapping Time to ID
    const map = { '朝': 'sec_morning', '昼': 'sec_afternoon', '夜': 'sec_evening' };

    // We only need to update the SectionID column (colIndex relative to range?)
    // Range starts at col 1. So SectionID is at index `secColIndex - 1`.
    // Time is at index 1 (col 2). column 2 is '所要時間'.

    values.forEach((r, i) => {
      const currentSecId = r[secColIndex - 1];
      if (!currentSecId) {
        const timeVal = r[1] || ''; // Col 2
        let newId = map[timeVal.toString().trim()] || 'sec_other';

        // Update cell
        defSheet.getRange(i + 2, secColIndex).setValue(newId);
      }
    });
  }

  return 'Migration Complete';
}

function getHabitSections() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('習慣セクション');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  data.shift(); // Header
  return data.map(r => ({ id: r[0], name: r[1], order: r[2] })).sort((a, b) => a.order - b.order);
}

function saveHabitSection(id, name, order) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('習慣セクション');
  const data = sheet.getDataRange().getValues();

  let found = false;
  // Update
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 2).setValue(name);
      if (order !== null) sheet.getRange(i + 1, 3).setValue(order);
      found = true;
      break;
    }
  }

  // Create
  if (!found) {
    const newId = id || 'sec_' + Date.now();
    const newOrder = order || (data.length);
    sheet.appendRow([newId, name, newOrder]);
  }
  return getHabitSections(); // Return updated list
}

function deleteHabitSection(id) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('習慣セクション');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  // Re-assign orphans to 'sec_other'?
  // For simplicity, we assume frontend handles warnings or we just leave them orphans (will show in Other).
  return getHabitSections();
}

function reorderSections(idList) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('習慣セクション');
  const data = sheet.getDataRange().getValues();

  // idList is ['id1', 'id2'...]
  // We construct a map for O(1) loookup
  const orderMap = {};
  idList.forEach((id, idx) => orderMap[id] = idx + 1);

  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    if (orderMap[id]) {
      sheet.getRange(i + 1, 3).setValue(orderMap[id]);
    }
  }
  return getHabitSections();
}

function saveHabitDefinition(name, newName, sectionId, icon) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('DB_Habits');
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;

  let headers = data[0];
  // Map headers: name, category (section), icon
  // Headers: [id, title, icon, section, benefit, isActive, createdAt, text_input, time_needed]

  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);

  // Fallback
  if (hMap['title'] === undefined) hMap['title'] = 1;
  if (hMap['section'] === undefined) hMap['section'] = 3;
  if (hMap['icon'] === undefined) hMap['icon'] = 2;

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][hMap['title']] === name) {
      const row = i + 1;
      if (newName && newName !== name) sheet.getRange(row, hMap['title'] + 1).setValue(newName);
      if (sectionId) sheet.getRange(row, hMap['section'] + 1).setValue(sectionId);
      if (icon) sheet.getRange(row, hMap['icon'] + 1).setValue(icon);

      // Update At (Only if exists)
      if (hMap['updatedat'] !== undefined) {
        sheet.getRange(row, hMap['updatedat'] + 1).setValue(new Date());
      }
      found = true;
      break;
    }
  }

  if (!found) {
    // Create New? (Frontend calls this 'save', might imply create if not exists?)
    // The UI currently only edits existing from Detail View.
    // But eventually we need Add.
    // For now, if not found, assume it is an Edit of a missing thing? Or ignore.
  }
}


// ========================================== 
// ROADMAP FEATURES 
// ========================================== 


function getGoalsV2() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

    // Debug: List all sheets
    const allSheets = ss.getSheets().map(s => s.getName());
    console.log('All Sheets:', allSheets);

    // 1. Fetch Goals
    const gSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS); // Use Safe Helper

    if (!gSheet) {
      console.warn('DB_Goals sheet missing entirely');
      return [{
        id: 'error_missing_sheet',
        title: 'DEBUG: DB_Goals Sheet Not Found',
        vision: 'Available: ' + allSheets.join(', '),
        status: 'Error'
      }];
    }

    const gData = gSheet.getDataRange().getValues();
    console.log('getGoals: rows found', gData.length);

    if (gData.length < 2) {
      return [{
        id: 'error_no_data',
        title: 'DEBUG: No Data Rows Found',
        vision: 'Rows: ' + gData.length,
        status: 'Error'
      }];
    }

    const gList = [];

    // Add Verification Card
    /*
    gList.push({
      id: 'debug_verified',
      title: '✅ SYSTEM CONNECTED', 
      status: 'Active'
    });
    */

    for (let i = 1; i < gData.length; i++) {
      const r = gData[i];
      if (!r[0]) continue;
      if (r[8] === 'DELETED') continue;

      // SANITIZE DATA
      let sDate = r[6];
      if (sDate instanceof Date) sDate = Utilities.formatDate(sDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else sDate = String(sDate);

      let eDate = r[7];
      if (eDate instanceof Date) eDate = Utilities.formatDate(eDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else eDate = String(eDate);

      gList.push({
        id: String(r[0]),
        title: String(r[1]),
        vision: String(r[2]),
        metricLabel: String(r[3]),
        metricTarget: Number(r[4]) || 0,
        metricCurrent: Number(r[5]) || 0,
        startDate: sDate,
        endDate: eDate,
        status: String(r[8]),
        // milestones: [] // Skip for now
      });
    }

    console.log("FINAL RETURN V9:", JSON.stringify(gList));
    // 2. Fetch Milestones
    const mSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_MILESTONES);
    if (mSheet) {
      const mData = mSheet.getDataRange().getValues();
      const milestones = [];
      for (let i = 1; i < mData.length; i++) {
        const r = mData[i];
        if (!r[0]) continue;

        let mDate = r[2];
        if (mDate instanceof Date) mDate = Utilities.formatDate(mDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
        else mDate = String(mDate);

        milestones.push({
          id: String(r[0]),
          goalId: String(r[1]),
          date: mDate,
          title: String(r[3]),
          status: String(r[4]),
          notes: String(r[5])
        });
      }

      gList.forEach(g => {
        g.milestones = milestones
          .filter(m => m.goalId === g.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      });
    }

    // Safe Sort
    return gList.sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate) : new Date('9999-12-31');
      const dateB = b.endDate ? new Date(b.endDate) : new Date('9999-12-31');
      return dateA - dateB;
    });

  } catch (e) {
    console.error('getGoals Fatal Error', e);
    return [{
      id: 'fatal_error',
      title: 'FATAL ERROR',
      vision: e.toString() + e.stack,
      status: 'Error'
    }];
  }
}

function saveGoal(goal) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS); // Use Safe Helper

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_GOALS);
    sheet.appendRow(['id', 'title', 'vision', 'metric_label', 'metric_target', 'metric_current', 'start_date', 'end_date', 'status', 'created_at']);
  }

  // id, title, vision, metric_label, metric_target, metric_current, start_date, end_date, status, created_at 

  const now = new Date();

  if (goal.id) {
    // UPDATE 
    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === goal.id) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx > 0) {
      // Update columns 2-9 
      sheet.getRange(rowIdx, 2).setValue(goal.title);
      sheet.getRange(rowIdx, 3).setValue(goal.vision);
      sheet.getRange(rowIdx, 4).setValue(goal.metricLabel);
      sheet.getRange(rowIdx, 5).setValue(goal.metricTarget);
      sheet.getRange(rowIdx, 6).setValue(goal.metricCurrent);
      sheet.getRange(rowIdx, 7).setValue(goal.startDate);
      sheet.getRange(rowIdx, 8).setValue(goal.endDate);
      sheet.getRange(rowIdx, 9).setValue(goal.status || 'Active');
      return 'Updated';
    }
  }

  // CREATE 
  const newId = Utilities.getUuid();
  sheet.appendRow([
    newId,
    goal.title,
    goal.vision,
    goal.metricLabel,
    goal.metricTarget,
    goal.metricCurrent,
    goal.startDate,
    goal.endDate,
    goal.status || 'Active',
    now
  ]);

  return 'Created';
}

function deleteGoal(id) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'Not Found (DB Missing)';
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Soft delete or Hard delete? Using Status 'DELETED' 
      sheet.getRange(i + 1, 9).setValue('DELETED');
      return 'Deleted';
    }
  }
  return 'Not Found';
}
