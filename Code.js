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
    DB_MILESTONES: 'DB_Milestones',
    DB_WEEKLY_GOALS: 'DB_WeeklyGoals',
    DB_DAILY_MEASUREMENTS: 'DB_DailyMeasurements',
    DB_GOALS_PROGRESS: 'DB_GoalsProgress',
    DB_PROJECT: 'DB_Project',
    DB_SCHEDULE: 'DB_Schedule'
  },
  GEMINI_API_KEY: 'AIzaSyDCw2c4JIZSFBpMaJ8e4b5CtqCIYLwYuFc',
  TIMEZONE: 'Asia/Tokyo'
};

// Force Sync 86
// Force push cleanup
function doGet() {
  const template = HtmlService.createTemplateFromFile('index');

  // Ensure DB Schema Exists
  initAppSchema();

  // Server-Side Rendering (SSR) of Initial Data
  try {
    const tasks = getTasks();
    const habits = getHabitStatus(new Date().toDateString());

    template.initialTasksJson = JSON.stringify(tasks).replace(/</g, '\\u003c');
    template.initialHabitsJson = JSON.stringify(habits).replace(/</g, '\\u003c');
    template.ssrError = 'null';

  } catch (e) {
    console.error("SSR Error", e);
    template.initialTasksJson = '[]';
    template.initialHabitsJson = '{}';
    template.ssrError = JSON.stringify('Server Error: ' + e.toString() + ' Stack: ' + e.stack).replace(/</g, '\\u003c');
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

function initAppSchema() {
  const ss = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const sheetName = CONFIG.SHEET_NAMES.DB_SCHEDULE;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // New Schema: id, created_at, date, startTime, endTime, type, refId, title, isPinned
    sheet.appendRow(['id', 'created_at', 'date', 'startTime', 'endTime', 'type', 'refId', 'title', 'isPinned']);
  } else {
    // Migration Check: Check if Col B (Index 2 in API, 0-indexed in array is 1) is 'date' or 'created_at'
    const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
    if (headers[1] === 'date') {
      // Old Schema detected. Rename 'date' -> 'created_at' AND Insert 'date' column
      sheet.getRange(1, 2).setValue('created_at');
      sheet.insertColumnAfter(2); // Insert new Col 3 (C)
      sheet.getRange(1, 3).setValue('date');
    }
  }

  // Migration Hook: Ensure Habit Headers are IDs
  if (typeof migrateHabitHeadersToIds === 'function') {
    try { migrateHabitHeadersToIds(); } catch (e) { console.warn('Migration warning', e); }
  }
}

// ... (Other functions irrelevant to replace)

// --- AI AGENT ---

function chatWithAgent(message) {
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  // Simple Context
  const schedule = getSmartSchedule(today);
  const scheduleTxt = schedule.map(e => `${e.time} ${e.title} (${e.type})`).join('\n');

  const systemPrompt = `
You are a scheduler assistant. Today is ${today}.
Current Schedule:
${scheduleTxt}

Tools (Response JSON ONLY):
- { "tool": "assignTime", "args": { "title": "TaskName", "time": "HH:mm", "duration": 30 }, "reply": "OK" }

If user says "Schedule [Task] at [Time]", assume 30m if not specified.
Reply field is what you say to user.
`;

  const messages = [
    { role: "user", parts: [{ text: systemPrompt + "\nUser: " + message }] }
  ];

  const responseText = callGeminiAPI(messages);

  try {
    // Robust JSON Parsing: Strip backticks
    const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const action = JSON.parse(jsonMatch[0]);
      if (action.tool === 'assignTime') {
        executeAiAction(action.tool, action.args);
        return action.reply + " (Updated)";
      }
      return action.reply;
    }
  } catch (e) { console.error(e); }

  return responseText;
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
      // s.setName(name); // Rename to strict ASCII? Risk of breaking?
      // For now, return it.
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

// --- CALENDAR ---
function getCalendarEvents(dateStr) {
  try {
    const start = new Date(dateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T23:59:59');

    // Safety check
    if (isNaN(start.getTime())) {
      console.error('Invalid date passed to getCalendarEvents:', dateStr);
      return [];
    }

    let allEvents = [];
    // Fetch from ALL calendars
    const calendars = CalendarApp.getAllCalendars();

    for (const cal of calendars) {
      try {
        const events = cal.getEvents(start, end);
        allEvents = allEvents.concat(events);
      } catch (innerErr) {
        console.warn(`Error fetching calendar ${cal.getName()}:`, innerErr);
      }
    }

    // Deduplicate?
    const mapped = allEvents.map(e => {
      let color = '#7986cb'; // default
      try {
        if (e.getColor()) color = e.getColor(); // Just grab ID for now if we can't map
      } catch (err) { }

      const isAllDay = e.isAllDayEvent();
      let timeStr = '';
      if (!isAllDay) {
        const s = e.getStartTime();
        const f = e.getEndTime();
        const sStr = Utilities.formatDate(s, Session.getScriptTimeZone(), 'HH:mm');
        const fStr = Utilities.formatDate(f, Session.getScriptTimeZone(), 'HH:mm');
        timeStr = `${sStr} - ${fStr}`;
      }

      return {
        id: e.getId(),
        title: e.getTitle(),
        isAllDay: isAllDay,
        time: timeStr,
        location: e.getLocation(),
        desc: e.getDescription(),
        color: e.getColor() || color
      };
    });

    // Unique by ID
    const unique = [];
    const seen = new Set();
    for (const m of mapped) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    }

    return unique;

  } catch (e) {
    console.error('getCalendarEvents Error:', e);
    // Rethrow permission errors so client sees Auth Popup
    if (e.message && (e.message.includes('permission') || e.message.includes('authorization'))) {
      throw e;
    }
    return [];
  }
}

// --- AI SMART SCHEDULING ---
function getSmartSchedule(dateStr) {
  // 1. Get Base Events
  const events = getCalendarEvents(dateStr);
  // Mark regular events
  const combined = events.map(e => ({ ...e, type: 'event' }));

  try {
    // 1.5 Get Pinned Items (DB_Schedule)
    const pinned = getPinnedScheduleItems(dateStr);
    pinned.forEach(p => combined.push(p));

    // Deduplication Sets
    const pinnedTitles = new Set(pinned.map(p => p.title));
    const pinnedRefIds = new Set(pinned.map(p => p.originalId || p.refId || ''));

    // 2. Get Habits (Pending for today)
    const habitData = getHabitStatus(dateStr);

    // Filter: Not done (status === 0) AND Not already pinned
    let pendingHabits = habitData.habits.filter(h => h.status === 0);
    pendingHabits = pendingHabits.filter(h => {
      // Check ID or Title
      if (pinnedRefIds.has(String(h.id))) return false;
      if (pinnedTitles.has(h.name)) return false;
      return true;
    });

    // 3. Get Tasks (Due or High Priority & Not Done)
    const allTasks = getTasks();
    const targetYMD = dateStr.replace(/-/g, '/');

    let pendingTasks = allTasks.filter(t => {
      if (t.status === '完了') return false;

      // Check Pinned
      if (pinnedRefIds.has(String(t.id))) return false;
      if (pinnedTitles.has(t.name)) return false;

      // Priority 1: Due Date <= Today
      if (t.dueDate && t.dueDate <= targetYMD) return true;

      return false; // Only Due tasks for now
    });

    // Sort Tasks: Overdue/Today first, then Priority
    pendingTasks.sort((a, b) => {
      // Due Date
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      // Prio
      return b.importance - a.importance;
    });

    // 4. Calculate Free Slots (Simple Heuristic: 08:00 - 22:00)
    const dayStart = new Date(dateStr + 'T08:00:00');
    const dayEnd = new Date(dateStr + 'T22:00:00'); // End of active day

    // Parse Event Rangs
    const busyRanges = [];
    events.forEach(e => {
      if (e.isAllDay) return; // Ignore all day for slot calc (usually doesn't block time)
      if (!e.time) return;
      // Format "HH:mm - HH:mm"
      const parts = e.time.split(' - ');
      if (parts.length !== 2) return;

      const s = new Date(dateStr + 'T' + parts[0] + ':00');
      const f = new Date(dateStr + 'T' + parts[1] + ':00');
      busyRanges.push({ start: s.getTime(), end: f.getTime() });
    });

    busyRanges.sort((a, b) => a.start - b.start);

    // Find Gaps
    let pointer = dayStart.getTime();
    const gaps = [];

    for (const range of busyRanges) {
      // Overlap adjustment
      if (range.start < pointer) {
        pointer = Math.max(pointer, range.end);
        continue;
      }

      if (range.start > pointer) {
        gaps.push({ start: pointer, end: range.start });
      }
      pointer = Math.max(pointer, range.end);
    }

    // Final gap
    if (dayEnd.getTime() > pointer) {
      gaps.push({ start: pointer, end: dayEnd.getTime() });
    }

    // 5. Fill Gaps
    let habitIdx = 0;
    let taskIdx = 0;

    const formatTime = (ts) => Utilities.formatDate(new Date(ts), CONFIG.TIMEZONE, 'HH:mm');

    for (const gap of gaps) {
      let currentPos = gap.start;
      let remaining = (gap.end - gap.start) / (60 * 1000); // minutes

      // Strategy:
      // - Fill Habits first (Quick wins, 15m)
      // - Fill Tasks next (30m blocks)

      // Loop while we have space in this gap
      while (remaining >= 15 && (habitIdx < pendingHabits.length || taskIdx < pendingTasks.length)) {

        // Try Habit (15m)
        if (habitIdx < pendingHabits.length) {
          const h = pendingHabits[habitIdx];
          const dur = 15;

          if (remaining >= dur) {
            const endPos = currentPos + (dur * 60 * 1000);
            combined.push({
              id: 'auto-habit-' + h.id,
              title: h.name,
              type: 'habit',
              time: `${formatTime(currentPos)} - ${formatTime(endPos)}`,
              isAllDay: false,
              location: 'Smart Suggestion',
              color: '#fff', // Frontend will handle style
              icon: h.icon || 'star', // Pass icon
              originalId: h.id
            });

            currentPos = endPos;
            remaining -= dur;
            habitIdx++;
            continue; // Loop again
          }
        }

        // Try Task (30m)
        if (taskIdx < pendingTasks.length) {
          const t = pendingTasks[taskIdx];
          // Determine duration?
          let dur = 30;
          if (t.estTime) {
            // Parse "1h", "30m" etc?
            // Simple fallback
          }

          if (remaining >= dur) {
            const endPos = currentPos + (dur * 60 * 1000);
            combined.push({
              id: 'auto-task-' + t.id,
              title: t.name,
              type: 'task',
              time: `${formatTime(currentPos)} - ${formatTime(endPos)}`,
              isAllDay: false,
              location: 'Due Task',
              color: '#fff',
              icon: 'check_circle',
              originalId: t.id
            });

            currentPos = endPos;
            remaining -= dur;
            taskIdx++;
            continue;
          } else {
            // Not enough space for task, break to next gap
            break;
          }
        }

        // If we get here, neither fit or empty list
        break;
      }
    }

  } catch (err) {
    console.error('getSmartSchedule Error:', err);
    // Return events only on error
  }

  return combined;
}


function getPinnedScheduleItems(dateStr) {
  const ss = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DB_SCHEDULE);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const items = [];
  // NEW: id(0), created_at(1), date(2), start(3), end(4), type(5), refId(6), title(7), pin(8)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Col 2 is Target Date
    let rowDateStr = '';

    // Robust Date Check for Col 2
    if (row[2]) {
      if (row[2] instanceof Date) {
        rowDateStr = Utilities.formatDate(row[2], CONFIG.TIMEZONE, 'yyyy-MM-dd');
      } else {
        const d = new Date(row[2]);
        if (!isNaN(d.getTime())) {
          rowDateStr = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
        } else {
          rowDateStr = String(row[2]);
        }
      }
    } else {
      // Fallback: Check created_at (Col 1) if migrated and empty?
      if (row[1] instanceof Date) {
        rowDateStr = Utilities.formatDate(row[1], CONFIG.TIMEZONE, 'yyyy-MM-dd');
      }
    }

    if (rowDateStr !== dateStr) continue;

    const sTime = (row[3] instanceof Date) ? Utilities.formatDate(row[3], CONFIG.TIMEZONE, 'HH:mm') : row[3];
    const eTime = (row[4] instanceof Date) ? Utilities.formatDate(row[4], CONFIG.TIMEZONE, 'HH:mm') : row[4];

    if (row.length < 8) continue; // Safety

    items.push({
      id: row[0],
      title: row[7], // Moved from 6
      type: row[5] || 'task', // Moved from 4
      time: `${sTime} - ${eTime}`,
      isAllDay: false,
      color: '#ff7043',
      icon: 'push_pin',
      refId: row[6],         // Moved from 5
      originalId: row[6],
      isPinned: true
    });
  }
  return items;
}

// --- AI AGENT ---

function chatWithAgent(message) {
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  // 1. Schedule Context
  const schedule = getSmartSchedule(today);
  const scheduleTxt = schedule.map(e => `${e.time} : ${e.title} (${e.type})`).join('\n');

  // 2. Task Context (for smart linking)
  const allTasks = getTasks(); // Cached? No, direct read. Optimization: separate function if slow.
  // Filter handy tasks
  const pendingTasks = allTasks.filter(t => t.status !== '完了');
  const taskListTxt = pendingTasks.slice(0, 15).map(t => `- ${t.name}`).join('\n'); // Top 15

  const systemPrompt = `
You are a scheduler assistant. Today is ${today}.

Current Schedule:
${scheduleTxt}

Pending Tasks (Top 15):
${taskListTxt}

Tools (Response JSON ONLY):
- { "tool": "assignTime", "args": { "title": "TaskName", "time": "HH:mm", "duration": 30 }, "reply": "Scheduled..." }
- { "tool": "updateAssignment", "args": { "targetTitle": "TaskTitle", "newTime": "HH:mm", "newDate": "YYYY-MM-DD" }, "reply": "Moved..." }
- { "tool": "removeAssignment", "args": { "targetTitle": "TaskTitle" }, "reply": "Removed..." }
- { "tool": "completeTask", "args": { "targetTitle": "TaskTitle" }, "reply": "Great job! Marked as done." }

Rules:
- If user wants to schedule a specific pending task, use its exact title.
- 'updateAssignment': 'newDate' is optional. If missing, keep same day.
- 'completeTask': Use this when user says "I finished X" or "X is done".
`;

  const messages = [
    { role: "user", parts: [{ text: systemPrompt + "\nUser: " + message }] }
  ];

  const responseText = callGeminiAPI(messages);

  try {
    const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const action = JSON.parse(jsonMatch[0]);
      const res = executeAiAction(action.tool, action.args);
      const reply = action.reply || "処理を完了しました。";
      return reply + (res ? " (Updated)" : "");
    }
  } catch (e) {
    console.error(e);
    return "エラーが発生しました: " + e.message;
  }

  return responseText;
}

// --- DEBUG HELPER ---
function logDebug(msg) {
  const ss = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  let sheet = ss.getSheetByName('DebugLog');
  if (!sheet) {
    sheet = ss.insertSheet('DebugLog');
    sheet.appendRow(['Timestamp', 'Message']);
  }
  sheet.appendRow([new Date(), msg]);
}

function executeAiAction(tool, args) {
  const ss = SpreadsheetApp.openById(CONFIG.TASK_DB_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DB_SCHEDULE);
  if (!sheet) return false;

  const todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  logDebug(`[executeAiAction] Tool: ${tool}, Args: ${JSON.stringify(args)}, Today: ${todayStr}`);

  // Helper: Find Row and Data
  const findRowByTitle = (targetTitle) => {
    const data = sheet.getDataRange().getValues();
    const cleanTarget = String(targetTitle).trim().toLowerCase().replace(/\s+/g, '');

    logDebug(`[Search] Target: "${targetTitle}" -> clean: "${cleanTarget}"`);

    // NEW: id(0), created(1), date(2), start(3), end(4), type(5), refId(6), title(7)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // Date Check (Col 2, fallback Col 1)
      let rowDateStr = '';
      const targetDateVal = row[2] || row[1];

      if (targetDateVal instanceof Date) {
        rowDateStr = Utilities.formatDate(targetDateVal, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      } else {
        const d = new Date(targetDateVal);
        if (!isNaN(d.getTime())) {
          rowDateStr = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
        } else {
          rowDateStr = String(targetDateVal);
        }
      }

      const rowTitle = String(row[7]); // Index 7
      const cleanRowTitle = rowTitle.trim().toLowerCase().replace(/\s+/g, '');

      if (cleanRowTitle.includes(cleanTarget) || cleanTarget.includes(cleanRowTitle)) {
        logDebug(`[Match Check] Row ${i + 1}: Date=${rowDateStr} title="${rowTitle}"`);
      }

      if (rowDateStr === todayStr && cleanRowTitle.includes(cleanTarget)) {
        logDebug(`[Found] Row ${i + 1} matched!`);
        return { row: i + 1, refId: row[6], id: row[0], title: row[7] };
      }
    }
    logDebug(`[Not Found] Scanned ${data.length} rows.`);
    return null;
  };

  // Helper: Find Task ID by Name from Master DB
  const findTaskIdByName = (name) => {
    const tasks = getTasks();
    const hit = tasks.find(t => t.name === name || name.includes(t.name));
    return hit ? hit.id : 'ai';
  };

  if (tool === 'assignTime') {
    const id = Utilities.getUuid();
    const now = new Date();
    const date = new Date();

    const [h, m] = args.time.split(':').map(Number);
    const startD = new Date(date); startD.setHours(h, m, 0);
    const endD = new Date(startD.getTime() + (args.duration || 30) * 60000);
    const endTime = Utilities.formatDate(endD, CONFIG.TIMEZONE, 'HH:mm');

    // Try to link to Real Task
    const refId = findTaskIdByName(args.title);

    // [id, created, date, start, end, type, refId, title, pin]
    sheet.appendRow([id, now, date, args.time, endTime, 'task', refId, args.title, true]);
    return `【新規作成】${args.time}に「${args.title}」を追加しました。`;
  }

  if (tool === 'updateAssignment') {
    const found = findRowByTitle(args.targetTitle);
    if (found) {
      let msg = `【変更】「${found.title}」を`;
      if (args.newTime) {
        const [h, m] = args.newTime.split(':').map(Number);
        let dBase = new Date();

        if (args.newDate) dBase = new Date(args.newDate);

        const startD = new Date(dBase); startD.setHours(h, m, 0);
        const dur = 30 * 60000;
        const endD = new Date(startD.getTime() + dur);
        const endTime = Utilities.formatDate(endD, CONFIG.TIMEZONE, 'HH:mm');

        sheet.getRange(found.row, 4).setValue(args.newTime); // Col 4 (Start)
        sheet.getRange(found.row, 5).setValue(endTime);     // Col 5 (End)
        msg += `${args.newTime}に変更しました。`;
      }
      if (args.newDate) {
        sheet.getRange(found.row, 3).setValue(new Date(args.newDate)); // Col 3 (Date)
        msg += `日付を${args.newDate}に移動しました。`;
      }
      logDebug(`[Update] Success for row ${found.row}`);
      return msg;
    } else {
      // Fallback Upsert
      logDebug("[Upsert] Triggered because target not found.");
      console.log("Update target not found, creating new entry (Upsert): " + args.targetTitle);
      const id = Utilities.getUuid();
      const now = new Date();
      const date = args.newDate ? new Date(args.newDate) : new Date();
      const time = args.newTime || "09:00";

      const [h, m] = time.split(':').map(Number);
      const startD = new Date(date); startD.setHours(h, m, 0);
      const endD = new Date(startD.getTime() + (args.duration || 30) * 60000);
      const endTime = Utilities.formatDate(endD, CONFIG.TIMEZONE, 'HH:mm');

      const refId = findTaskIdByName(args.targetTitle);

      // [id, created, date, start, end, type, refId, title, pin]
      sheet.appendRow([id, now, date, time, endTime, 'task', refId, args.targetTitle, true]);
      return `【新規追加（該当する予定が見つからなかったため）】「${args.targetTitle}」を${time}に追加しました。`;
    }
  }

  if (tool === 'removeAssignment') {
    const found = findRowByTitle(args.targetTitle);
    if (found) {
      sheet.deleteRow(found.row);
      return `【削除】「${found.title}」を削除しました。`;
    }
    return "削除対象が見つかりませんでした。";
  }

  if (tool === 'completeTask') {
    const found = findRowByTitle(args.targetTitle);
    let targetId = null;

    if (found) {
      targetId = found.refId;
    } else {
      targetId = findTaskIdByName(args.targetTitle);
    }

    if (targetId && targetId !== 'ai') {
      const res = updateTaskStatus(targetId, true);
      if (found) sheet.deleteRow(found.row);
      return `【完了】タスク「${args.targetTitle}」を完了にしました。`;
    } else {
      if (found) {
        sheet.deleteRow(found.row);
        return `【完了】予定「${found.title}」を完了として削除しました。`;
      }
    }
    return "完了対象のタスクが見つかりませんでした。";
  }

  return false;
}

// --- GEMINI API ---
function callGeminiAPI(messages) {
  // messages = [{ role: "user", parts: [{ text: "..." }] }, ...]
  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === 'Pending') {
    return "Error: API Key not set.";
  }

  // Fallback to specific version tag
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const payload = {
    contents: messages,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    if (code !== 200) {
      console.error('Gemini API Error:', text);
      return `Error ${code}: ${text}`;
    }

    const json = JSON.parse(text);
    if (json.candidates && json.candidates.length > 0) {
      const content = json.candidates[0].content;
      if (content && content.parts && content.parts.length > 0) {
        return content.parts[0].text;
      }
    }

    return "No response text found.";

  } catch (e) {
    console.error('callGeminiAPI Exception:', e);
    return "Exception: " + e.message;
  }
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
  console.log('Habit Headers:', rawHeaders); // SERVER LOG


  // Headers: [id, title, icon, section, benefit, isActive, createdAt, text_input, time_needed, title_offense]
  const FALLBACK = {
    id: 0,
    title: 1,
    icon: 2,
    section: 3,
    benefit: 4,
    isactive: 5,
    text_input: 7,
    time_needed: 8,
    title_offense: 9
  };

  const hMap = createHeaderMap(rawHeaders);

  const getVal = (r, key, def) => {
    const idx = hMap[key.toLowerCase()]
      || hMap[key.toLowerCase().replace('offense', 'offence')] // Try British spelling
      || FALLBACK[key.toLowerCase()]
      || FALLBACK[key.toLowerCase().replace('offense', 'offence')];
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
      time: getVal(r, 'time_needed', ''),
      offenseTitle: getVal(r, 'title_offense', ''),
      offenseTime: getVal(r, 'time_offense', ''),
      hasGuide: (getVal(r, 'has_guide', false) === true),
      guideText: getVal(r, 'guide_text', '')
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

    // Check Date Match (Numeric)
    const rDate = new Date(rowRaw);
    const rYear = rDate.getFullYear();
    const rMonth = rDate.getMonth();
    const rDay = rDate.getDate();

    if (rYear === targetYear && rMonth === targetMonth && rDay === targetDateNum) {
      // console.log('Match found (numeric) for:', dateStr);
      for (let c = 1; c < logHeaders.length; c++) {
        const hName = logHeaders[c];
        const val = logData[i][c];
        // 2-level System: Return raw value 0, 1, 2
        // Legacy check for boolean true replaced by 1
        let status = 0;
        if (val == 2) status = 2;
        else if (val == 1 || val === true || val === 'TRUE') status = 1;

        todaysLog[hName] = status;
      }
    }

    // Collect Month Data
    if (rYear === targetYear && rMonth === targetMonth) {
      for (let c = 1; c < logHeaders.length; c++) {
        const hName = logHeaders[c];
        const val = logData[i][c];
        let status = 0;
        if (val == 2) status = 2;
        else if (val == 1 || val === true || val === 'TRUE') status = 1;

        if (!monthlyLogs[hName]) monthlyLogs[hName] = {};
        monthlyLogs[hName][rDay] = status;
      }
    }
  }

  // REFACTOR: Map keys from IDs to Names for Frontend? 
  // No, frontend should use IDs. 
  // But wait, monthlyLogs[hName] is using the HEADER as key. 
  // If we migrated headers to IDs, hName IS the ID.
  // So 'monthlyLogs' will be keyed by ID.
  // frontend 'habitCalendarCache' expects keys. 
  // If we change keys to ID, frontend loop `Object.keys(data.monthlyLogs).forEach(hName => ...)`
  // If hName is ID, we need to make sure `habitCalendarCache` uses ID or Name?
  // Frontend `habitCalendarCache` is keyed by NAME in `renderHabits`: `habitCalendarCache[hName][key]`.
  // If backend sends IDs, frontend `hName` variable will hold ID. 
  // We need to verify frontend uses `h.id` or `h.name`. 
  // Frontend uses `currentDetailHabit.name` for lookup. 
  // We should change frontend to use `currentDetailHabit.id`.

  // Merge
  const enrichedHabits = habits.map(h => {
    const s = statMap[h.name] || {};
    return {
      ...h,
      streak: s.streak || 0,
      rate30: s.rate30 || 0,
      status: todaysLog[h.id] || 0
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

  const value = Number(status) || 0;
  // Status check: 2 = ADVANCED, 1 = DONE, 0 = SKIPPED/NONE
  let statusStr = 'SKIPPED';
  if (value === 2) statusStr = 'ADVANCED';
  else if (value === 1) statusStr = 'DONE';

  dbSheet.appendRow([logId, dateStr, habitId, statusStr, value, new Date()]);


  // 2. MATRIX UPDATE (習慣記録１)
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  const data = sheet.getDataRange().getValues();
  let headers = data.length > 0 ? data[0] : [];

  // Dynamic Column Creation/Fix (Using ID)
  let colIndex = headers.indexOf(habitName); // habitName argument should be ID now
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

  sheet.getRange(rowIndex, colIndex + 1).setValue(Number(status) || 0);

  // 3. STATS UPDATE (Lightweight)
  updateSingleHabitStreak(habitName);
  return 'Updated';
}




function logHabitText(dateStr, habitName, text) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logName = '日記記録'; // Targets the Journal Sheet directly
  let sheet = ss.getSheetByName(logName);

  if (!sheet) {
    sheet = ss.insertSheet(logName);
    sheet.appendRow(['日付', '夢日記', '感謝日記']); // Header Init matching likely Defaults
  }

  // 1. Ensure Column Exists (Habit Name)
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let colIndex = headers.indexOf(habitName);

  if (colIndex === -1) {
    // Create new column if not found
    sheet.getRange(1, lastCol + 1).setValue(habitName);
    colIndex = lastCol; // The new index is the old length
  }

  // 2. Ensure Row Exists (Date)
  const targetYMD = Utilities.formatDate(new Date(dateStr), CONFIG.TIMEZONE, 'yyyy/MM/dd'); // Use slash for this sheet as per screenshot

  // Find Row
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  // Search from bottom up for efficiency
  for (let i = data.length - 1; i >= 1; i--) {
    let dVal = data[i][0];
    let dStr = '';
    if (dVal instanceof Date) dStr = Utilities.formatDate(dVal, CONFIG.TIMEZONE, 'yyyy/MM/dd');
    else dStr = String(dVal);

    if (dStr === targetYMD) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }

  if (rowIndex === -1) {
    sheet.appendRow([targetYMD]);
    rowIndex = sheet.getLastRow();
  }

  // 3. Write Data
  sheet.getRange(rowIndex, colIndex + 1).setValue(text);

  return 'Logged Text';
}


function DEPRECATED_logHabitText(dateStr, habitName, text) {
  return; // Disabled
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

function getHabitCalendar(habitName, year, month) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);

  // Header Check
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(habitName); // habitName passed here should be ID if we update caller

  if (colIndex === -1) return {};

  // 1. Initialize Result Keys (Ensure Cache Hits even for empty months)
  const result = {};

  // Helper to get Year/Month from offset
  const getYM = (y, m, offset) => {
    let ty = y, tm = m + offset;
    while (tm > 12) { tm -= 12; ty++; }
    while (tm < 1) { tm += 12; ty--; }
    return { y: ty, m: tm };
  };

  // Pre-fill M-1, M, M+1
  [-1, 0, 1].forEach(offset => {
    const { y, m } = getYM(year, month, offset);
    result[`${y}-${m}`] = {};
  });

  // 2. Robust Search Strategy
  // We want to read ~90-100 rows starting from M-1.
  // If M-1 missing, try M. If M missing, try M+1.

  let startRow = -1;
  const searchOrder = [-1, 0, 1]; // Order of priority to find "Anchor"

  // Search Helper: Tries "yyyy/MM" AND "yyyy-MM"
  const findStartRowForMonth = (y, m) => {
    const slash = `${y}/${String(m).padStart(2, '0')}`;
    const hyphen = `${y}-${String(m).padStart(2, '0')}`;

    // Try Slash
    let finder = sheet.getRange("A:A").createTextFinder(slash);
    let found = finder.findNext();
    if (found) return found.getRow();

    // Try Hyphen
    finder = sheet.getRange("A:A").createTextFinder(hyphen);
    found = finder.findNext();
    if (found) return found.getRow();

    return null;
  };

  for (const offset of searchOrder) {
    const { y, m } = getYM(year, month, offset);
    const row = findStartRowForMonth(y, m);
    if (row) {
      startRow = row;
      // If we found M or M+1 (but missed M-1), we still read from there.
      // But to be safe, if we found M, we *could* try to read 30 rows back?
      // No, safer to just read forward from what we found. 
      // If M-1 is empty, data starts at M. Reading from M covers M and M+1.
      break;
    }
  }

  // If absolutely no logs found for M-1, M, M+1 range
  if (startRow === -1) {
    // Return the empty initialized result. 
    // This is CRITICAL: Frontend will cache these as "empty" and stop spinning.
    return result;
  }

  // 3. Read Data (Approx 100 rows -> ~3 months)
  const maxRows = sheet.getLastRow();
  const numRows = Math.min(100, maxRows - startRow + 1);

  if (numRows <= 0) return result;

  const dates = sheet.getRange(startRow, 1, numRows, 1).getValues();
  const values = sheet.getRange(startRow, colIndex + 1, numRows, 1).getValues();

  for (let i = 0; i < numRows; i++) {
    const rawDate = dates[i][0];
    const val = values[i][0];

    // Parse Date Robustly
    let d;
    if (rawDate instanceof Date) {
      d = rawDate;
    } else if (typeof rawDate === 'string') {
      // Try standard parse
      d = new Date(rawDate);
    }

    if (d && !isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${m}`;

      // Only populate if within our interest window? 
      // No, populate everything found in the buffer.
      // But ensure we initialized the key if it wasn't there (e.g. M+2 read by accident)
      if (!result[key]) result[key] = {};

      result[key][d.getDate()] = (val == 2) ? 2 : ((val == 1 || val === true || val === 'TRUE') ? 1 : 0);
    }
  }

  return result;
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

  // Search Method
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = data.length - 1; i >= 1; i--) {
    let dVal = data[i][0];
    let dStr = '';
    if (dVal instanceof Date) dStr = Utilities.formatDate(dVal, CONFIG.TIMEZONE, 'yyyy/MM/dd');
    else dStr = String(dVal);

    if (dStr === targetYMD) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    sheet.appendRow([targetYMD]);
    rowIndex = sheet.getLastRow();
  }

  // Write Times (Col B=2 and C=3)
  // Ensure we don't overwrite if null (though User provides both usually)
  if (bedtime) sheet.getRange(rowIndex, 2).setValue(bedtime);
  if (wakeup) sheet.getRange(rowIndex, 3).setValue(wakeup);

  // Col 4 is Formula, do not touch.

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
    statSheet.getRange(rowIndex, 2).setValue(streak);
  }
}

function calculateSingleStreak(habitName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HABIT_LOG);
  if (!logSheet) return 0;

  const data = logSheet.getDataRange().getValues();
  if (data.length === 0) return 0;
  const headers = data[0];
  const colIndex = headers.indexOf(habitName); // Expects ID
  if (colIndex === -1) return 0;

  // Extract dates for this habit
  const dates = [];
  const timeZone = CONFIG.TIMEZONE;
  for (let i = 1; i < data.length; i++) {
    const val = data[i][colIndex];
    if (Number(val) >= 1 || val === true || val === 'TRUE') {
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
      if (data[i][c] >= 1 || data[i][c] === true || data[i][c] === 'TRUE') {
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


function saveHabitDefinition(name, newName, sectionId, icon, newTime, newBenefit, newOffenseTitle, newOffenseTime, hasGuide, guideText) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('DB_Habits');
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return;

  let headers = data[0];
  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);

  // Fallback
  if (hMap['title'] === undefined) hMap['title'] = 1;
  if (hMap['section'] === undefined) hMap['section'] = 3;
  if (hMap['icon'] === undefined) hMap['icon'] = 2;

  // Robustness: Ensure new columns exist
  const ensureColumn = (key) => {
    if (hMap[key] === undefined) {
      const newColIdx = headers.length;
      sheet.getRange(1, newColIdx + 1).setValue(key);
      hMap[key] = newColIdx;
      headers.push(key); // Local update
    }
  };

  if (newOffenseTitle !== undefined) ensureColumn('title_offense');
  if (newOffenseTime !== undefined) ensureColumn('time_offense');

  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][hMap['title']] === name) {
      const row = i + 1;
      if (newName && newName !== name) sheet.getRange(row, hMap['title'] + 1).setValue(newName);
      if (sectionId) sheet.getRange(row, hMap['section'] + 1).setValue(sectionId);
      if (icon) sheet.getRange(row, hMap['icon'] + 1).setValue(icon);

      // Expanding for Benefit and Time
      if (hMap['benefit'] !== undefined && newBenefit !== undefined) {
        sheet.getRange(row, hMap['benefit'] + 1).setValue(newBenefit);
      }
      if (hMap['time_needed'] !== undefined && newTime !== undefined) {
        sheet.getRange(row, hMap['time_needed'] + 1).setValue(newTime);
      }

      // Expanding for Offense Title
      if (hMap['title_offense'] !== undefined && newOffenseTitle !== undefined) {
        sheet.getRange(row, hMap['title_offense'] + 1).setValue(newOffenseTitle);
      }
      // Expanding for Offense Time
      if (hMap['time_offense'] !== undefined && newOffenseTime !== undefined) {
        sheet.getRange(row, hMap['time_offense'] + 1).setValue(newOffenseTime);
      }

      // Expanding for Guide
      if (hasGuide !== undefined) {
        ensureColumn('has_guide');
        sheet.getRange(row, hMap['has_guide'] + 1).setValue(hasGuide);
      }
      if (guideText !== undefined) {
        ensureColumn('guide_text');
        sheet.getRange(row, hMap['guide_text'] + 1).setValue(guideText);
      }

      // Update At (Only if exists)
      if (hMap['updatedat'] !== undefined) {
        sheet.getRange(row, hMap['updatedat'] + 1).setValue(new Date());
      }
      found = true;
      break;
    }
  }

  if (!found) {
    // Create New Logic (if we ever implement Create from here)
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

    const headers = gData[0];
    const hMap = {};
    headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);

    // Helper to get val. Returns undefined if col missing.
    const getVal = (row, field) => {
      const idx = hMap[field];
      return idx !== undefined ? row[idx] : undefined;
    };

    const gList = [];

    for (let i = 1; i < gData.length; i++) {
      const r = gData[i];
      // ID check. Try 'id', fallback to 0.
      const idVal = getVal(r, 'id') || r[0];
      if (!idVal) continue;

      const statusVal = getVal(r, 'status');
      // If status column missing, assume Active? Or r[8] legacy fallback?
      // Let's rely on map.
      if (statusVal === 'DELETED') continue;

      // START DATE
      // Try 'start_date', fallback to r[7] if map fail (legacy safety?) No, map is better.
      let sDate = getVal(r, 'start_date');
      if (sDate === undefined && hMap['metric_begining'] === undefined) {
        // If no metric_begining col, maybe legacy order [6]? 
        // But likely headers exist.
      }

      if (sDate instanceof Date) sDate = Utilities.formatDate(sDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else sDate = String(sDate || '');

      // END DATE
      let eDate = getVal(r, 'scheduled_end_date');
      if (eDate === undefined) eDate = getVal(r, 'end_date');

      if (eDate instanceof Date) eDate = Utilities.formatDate(eDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else eDate = String(eDate || '');

      const title = getVal(r, 'title');
      const vision = getVal(r, 'vision');
      const metricLabel = getVal(r, 'metric_label');
      const metricTarget = getVal(r, 'metric_target');
      const metricCurrent = getVal(r, 'metric_current');
      const reviewText = getVal(r, 'review'); // NEW: Reflection text

      let finalStatus = String(statusVal || 'Active');
      if (finalStatus === 'Inactive') finalStatus = 'Pending'; // Legacy mapping

      gList.push({
        id: String(idVal),
        title: String(title || ''),
        vision: String(vision || ''),
        metricLabel: String(metricLabel || ''),
        metricTarget: Number(metricTarget) || 0,
        metricCurrent: Number(metricCurrent) || 0,
        startDate: sDate,
        endDate: eDate,
        projectId: String(getVal(r, 'project_id') || ''),
        status: finalStatus,
        review: String(reviewText || '')
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

function getProjects() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let pSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_PROJECT);

  if (!pSheet) {
    // Auto-Create if missing (as per user request "DB_Goalsにproject_idの列を追加しておいたよ" implies DB_Goals was touched, but DB_Project might rely on me)
    pSheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_PROJECT);
    pSheet.appendRow(['id', 'title', 'vision']); // Minimal schema
  }

  const pData = pSheet.getDataRange().getValues();
  if (pData.length < 2) return [];

  const headers = pData[0];
  const hMap = createHeaderMap(headers);
  const getVal = (r, key) => {
    const idx = hMap[key.toLowerCase()];
    return idx !== undefined ? r[idx] : undefined;
  };

  const projectList = [];
  for (let i = 1; i < pData.length; i++) {
    const r = pData[i];
    const id = getVal(r, 'id');
    if (!id) continue;

    projectList.push({
      id: String(id),
      title: String(getVal(r, 'title') || ''),
      vision: String(getVal(r, 'vision') || '')
    });
  }

  return projectList;
}

function createProject(title, vision) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_PROJECT);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_PROJECT);
    sheet.appendRow(['id', 'title', 'vision']);
  }

  const newId = Utilities.getUuid();
  sheet.appendRow([newId, title, vision]);

  return {
    id: newId,
    title: title,
    vision: vision
  };
}

// Helper for Header Mapping (Reusable)
function createHeaderMap(headers) {
  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);
  return hMap;
}



// Unified Save Function (Create or Update)
function saveGoalFull(id, title, vision, metric, target, current, start, end, status, projectId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_GOALS);
    sheet.appendRow(['id', 'title', 'vision', 'metric_label', 'metric_target', 'metric_current', 'metric_begining', 'start_date', 'scheduled_end_date', 'status', 'created_at', 'project_id']);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hMap = createHeaderMap(headers);
  const data = sheet.getDataRange().getValues();

  // Find Row if ID exists
  let rowIndex = -1;
  // If ID is empty or 'temp', we treat as new (generate new ID)
  // BUT if 'id' is passed, we check if it exists in DB.
  if (id && !id.startsWith('temp-')) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][hMap['id']]) === String(id)) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  const now = new Date();
  const finalId = (rowIndex === -1) ? Utilities.getUuid() : id;
  const safeStatus = status || 'Active';

  // Columns Mapping
  const map = {
    'id': finalId,
    'title': title,
    'vision': vision,
    'metric_label': metric,
    'metric_target': target,
    'metric_current': current,
    // 'metric_begining': current, // Don't overwrite beginning on edit? Logic check needed. For new, yes.
    'start_date': start,
    'scheduled_end_date': end,
    'status': safeStatus,
    'project_id': projectId
  };

  // If New
  if (rowIndex === -1) {
    map['created_at'] = now;
    map['metric_begining'] = current; // Set initial

    const rowData = new Array(headers.length).fill('');
    for (const [key, val] of Object.entries(map)) {
      const idx = hMap[key];
      if (idx !== undefined) rowData[idx] = val;
    }
    // Ensure status/project_id cols exist? createHeaderMap doesn't create cols. 
    // Assume standard schema.
    sheet.appendRow(rowData);
  } else {
    // Update
    // map keys to cols
    for (const [key, val] of Object.entries(map)) {
      const idx = hMap[key];
      if (idx !== undefined) {
        // Optimization: Only update if changed? 
        sheet.getRange(rowIndex, idx + 1).setValue(val);
      }
    }
    // Update 'updated_at' if exists?
  }

  return 'Success';
}

function updateGoalStatus(id, newStatus) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'Error';

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const hMap = createHeaderMap(headers);

  const idCol = hMap['id'];
  const statusCol = hMap['status'];

  if (idCol === undefined || statusCol === undefined) return 'Error';

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return 'Updated';
    }
  }
  return 'Not Found';
}

// Wrapper to keep old signature if needed (optional)
function createGoal(title, vision, metric, target, current, start, end, projectId) {
  return saveGoalFull(null, title, vision, metric, target, current, start, end, 'Active', projectId);
}

function updateGoalProject(goalId, projectId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'No DB';

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hMap = createHeaderMap(headers);
  const idCol = hMap['id'];
  const pIdCol = hMap['project_id'];

  if (idCol === undefined || pIdCol === undefined) return 'Cols Missing';

  const data = sheet.getDataRange().getValues();
  // Find row
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(goalId)) {
      sheet.getRange(i + 1, pIdCol + 1).setValue(projectId);
      return 'Updated';
    }
  }
  return 'Not Found';
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

/**
 * WEEKLY GOAL SYSTEM API
 */

function ensureWeeklyGoalSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // DB_WeeklyGoals
  let sheetWG = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
  if (!sheetWG) {
    sheetWG = ss.insertSheet(CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
    // id, start_date, end_date, goal_id, target_metric, target_value, status, review_score, review_text, created_at
    sheetWG.appendRow(['id', 'start_date', 'end_date', 'goal_id', 'target_metric', 'target_value', 'status', 'review_score', 'review_text', 'created_at']);
  }

  // DB_DailyMeasurements
  let sheetDM = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_DAILY_MEASUREMENTS);
  if (!sheetDM) {
    sheetDM = ss.insertSheet(CONFIG.SHEET_NAMES.DB_DAILY_MEASUREMENTS);
    // id, date, weekly_goal_id, value, comment, created_at
    sheetDM.appendRow(['id', 'date', 'weekly_goal_id', 'value', 'comment', 'created_at']);
  }

  return 'Ensured';
}

function getWeeklyGoals(currentDateStr) {
  // Returns active weekly goals for the date, WITH aggregated measurements
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetWG = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
  const sheetDM = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_DAILY_MEASUREMENTS);
  // Also need Goal Titles
  const sheetGoals = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);

  // DB Auto-Init
  if (!sheetWG || !sheetDM) {
    ensureWeeklyGoalSheets();
    sheetWG = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
    sheetDM = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_DAILY_MEASUREMENTS);
  }

  if (!sheetWG || !sheetDM) return [];

  const targetDate = new Date(currentDateStr);
  const wgData = sheetWG.getDataRange().getValues();
  const dmData = sheetDM.getDataRange().getValues();

  let goalMap = {}; // goal_id -> Title logic if needed, but for now we just pass goal_id

  // 1. Find Weekly Goals covering targetDate
  let activeWeeklyGoals = [];
  // Skip Header
  for (let i = 1; i < wgData.length; i++) {
    const row = wgData[i];
    const startDate = new Date(row[1]);
    const endDate = new Date(row[2]);

    // Simple Date Check (Inclusive)
    // Normalize times to midnight for comparison?
    // Assuming row dates are stored as Date objects or YYYY-MM-DD

    if (targetDate >= startDate && targetDate <= endDate && row[6] !== 'DELETED') {
      const id = row[0];
      activeWeeklyGoals.push({
        id: id,
        start_date: row[1],
        end_date: row[2],
        goal_id: row[3],
        target_metric: row[4],
        target_value: row[5],
        status: row[6],
        review_score: row[7],
        review_text: row[8],
        current_value: 0 // To be aggregated
      });
    }
  }

  // 2. Aggregate Measurements
  // Optimize: Filter dmData once? or Loop?
  // dmData size might grow.
  for (let i = 1; i < dmData.length; i++) {
    const row = dmData[i];
    const wgId = row[2];
    const val = Number(row[3]);

    const targetWG = activeWeeklyGoals.find(g => g.id === wgId);
    if (targetWG) {
      targetWG.current_value += val;
    }
  }

  // 3. Enrich with Parent Vision Title (Optional but helpful for UI)
  if (sheetGoals) {
    const gData = sheetGoals.getDataRange().getValues();
    // Create Map
    const titleMap = {};
    for (let i = 1; i < gData.length; i++) {
      titleMap[gData[i][0]] = gData[i][1]; // id -> title
    }
    activeWeeklyGoals.forEach(g => {
      g.goal_title = titleMap[g.goal_id] || 'Unknown Goal';
    });
  }

  return activeWeeklyGoals;
}

function createGoal(title, vision, metricLabel, metricTarget, metricCurrent, startDateStr, endDateStr) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'DB_GOALS Missing';

  const newId = Utilities.getUuid();
  const now = new Date();

  // Scema: id, title, vision, metric_beginning, metric_target, metric_current, start_date, scheduled_end_date, status, created_at
  sheet.appendRow([
    newId,
    title,
    vision,
    metricCurrent || 0, // beginning
    metricTarget,
    metricCurrent || 0, // current
    startDateStr,
    endDateStr,
    'Active',
    now
  ]);

  return 'Created';
}

function setWeeklyGoal(goalId, metric, target, notes, startDateStr, endDateStr, newGoalTitle) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
  if (!sheet) return 'DB_WEEKLY_GOALS Missing';

  // Handle New Goal Creation Ad-hoc
  if (goalId === 'new' && newGoalTitle) {
    const goalSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
    if (goalSheet) {
      const newGId = Utilities.getUuid();
      const now = new Date();
      // id, title, vision, metric_label, metric_target, metric_current, start_date, end_date, status, created_at
      goalSheet.appendRow([
        newGId,
        newGoalTitle,
        '', // Vision
        metric, // Metric Label (matches weekly)
        target, // Target (matches weekly)
        0,
        startDateStr,
        endDateStr, // Short term?
        'Active',
        now
      ]);
      goalId = newGId; // Link to new goal
    }
  }

  const newId = Utilities.getUuid();
  // id, start_date, end_date, goal_id, target_metric, target_value, status, review_score, review_text, created_at
  sheet.appendRow([
    newId,
    startDateStr,
    endDateStr,
    goalId,
    metric,
    target,
    'Active',
    '', // score
    notes || '', // text 
    new Date()
  ]);
  return 'Created';
}

function logDailyMeasurement(weeklyGoalId, value, comment, dateStr) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_DAILY_MEASUREMENTS);
  if (!sheet) return 'DB Missing';

  const newId = Utilities.getUuid();
  // id, date, weekly_goal_id, value, comment, created_at
  sheet.appendRow([
    newId,
    dateStr,
    weeklyGoalId,
    value,
    comment,
    new Date()
  ]);
  return 'Logged';
}

function saveWeeklyReview(weeklyGoalId, score, text) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_WEEKLY_GOALS);
  if (!sheet) return 'DB Missing';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === weeklyGoalId) {
      // review_score = Col 8 (Index 7 + 1 = 8)
      // review_text = Col 9
      sheet.getRange(i + 1, 8).setValue(score);
      sheet.getRange(i + 1, 9).setValue(text);
      sheet.getRange(i + 1, 7).setValue('Done'); // Status -> Done
      return 'Saved';
    }
  }
  return 'Not Found';
}

function getActiveGoalsSimple() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const list = [];

  // Skip Header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // id=0, title=1, status=8
    const status = row[8] || 'Active';
    if (status !== 'DELETED' && status !== 'Done') {
      list.push({
        id: row[0],
        title: row[1]
      });
    }
  }
  return list;
}

/**
 * ROADMAP / GOALS PROGRESS API
 */

function ensureGoalProgressSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 1. Ensure DB_GoalsProgress
  let pSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS_PROGRESS);
  if (!pSheet) {
    pSheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_GOALS_PROGRESS);
    // Headers: id, goal_id, metric_then, notes, created_at
    pSheet.appendRow(['id', 'goal_id', 'metric_then', 'notes', 'created_at']);
  }

  // 2. Ensure DB_Goals (Basic check for missing columns or sheet)
  let gSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!gSheet) {
    gSheet = ss.insertSheet(CONFIG.SHEET_NAMES.DB_GOALS);
    // id, title, vision, metric_beginning, metric_target, metric_current, start_date, scheduled_end_date, status, created_at
    gSheet.appendRow(['id', 'title', 'vision', 'metric_beginning', 'metric_target', 'metric_current', 'start_date', 'scheduled_end_date', 'status', 'created_at']);
  }

  return pSheet;
}

function logGoalProgress(goalId, value, notes, dateStr) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // 1. Update Parent Goal (DB_Goals)
  const gSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!gSheet) return 'DB_Goals Missing';

  const gData = gSheet.getDataRange().getValues();
  let goalFound = false;
  const headers = gData[0];
  const hMap = createHeaderMap(headers);

  // Search for Goal ID
  for (let i = 1; i < gData.length; i++) {
    if (String(gData[i][hMap['id']]) === String(goalId)) {
      // Update metric_current
      const currentIdx = hMap['metric_current'];
      if (currentIdx !== undefined) gSheet.getRange(i + 1, currentIdx + 1).setValue(value);

      goalFound = true;

      // Auto-Done Logic
      const targetIdx = hMap['metric_target'];
      const statusIdx = hMap['status'];
      if (targetIdx !== undefined && statusIdx !== undefined) {
        const target = Number(gData[i][targetIdx]);
        const currentStatus = gData[i][statusIdx];
        // Only auto-complete if Active and reached target
        if (currentStatus === 'Active' && target > 0 && value >= target) {
          gSheet.getRange(i + 1, statusIdx + 1).setValue('Done');
        }
      }

      break;
    }
  }

  if (!goalFound) return 'Goal Not Found: ' + goalId;

  // 2. Append Log (DB_GoalsProgress)
  // Use explicit ensure to get sheet
  let pSheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS_PROGRESS);
  if (!pSheet) {
    pSheet = ensureGoalProgressSheet();
  }

  if (!pSheet) return 'DB_GoalsProgress Creation Failed';

  const newId = Utilities.getUuid();
  // id, goal_id, metric_then, notes, created_at
  try {
    pSheet.appendRow([
      newId,
      String(goalId),
      value,      // Snapshot value
      notes || '',
      new Date()  // Timestamp
    ]);
  } catch (e) {
    console.error('Append Error:', e);
    return 'Append Failed: ' + e.message;
  }

  SpreadsheetApp.flush(); // FORCE UPDATE
  return 'Logged';
}

function saveGoalReview(id, text) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'Sheet Missing';

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hMap = createHeaderMap(headers);
  const data = sheet.getDataRange().getValues();

  // Check if 'review' column exists, if not, wait, user said they added it. 
  // But safer to check.
  if (hMap['review'] === undefined) {
    // Lazy migration: add column
    sheet.getRange(1, headers.length + 1).setValue('review');
    hMap['review'] = headers.length; // New index
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][hMap['id']]) === String(id)) {
      sheet.getRange(i + 1, hMap['review'] + 1).setValue(text);
      return 'Saved';
    }
  }
  return 'Goal Not Found';
}

function getGoalHistory(goalId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS_PROGRESS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const history = [];

  // Skip Header
  for (let i = 1; i < data.length; i++) {
    // id=0, goal_id=1, metric_then=2, notes=3, created_at=4
    const rowGoalId = String(data[i][1]).trim();
    const queryGoalId = String(goalId).trim();

    if (rowGoalId === queryGoalId) {
      let d = data[i][4];
      // Handle Google Sheet Date Objects or Strings
      if (!(d instanceof Date)) {
        d = new Date(d);
      }
      // Fail-safe for invalid dates
      if (isNaN(d.getTime())) {
        d = new Date(); // Fallback to now? Or skip? Let's use now for safety.
      }

      history.push({
        id: data[i][0],
        value: data[i][2],
        notes: data[i][3],
        date: d.toISOString() // Send as ISO string to avoid TZ issues across boundary
      });
    }
  }

  // Sort by Date Descending
  return history.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function updateHistoryNote(logId, newNote) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS_PROGRESS);
  if (!sheet) return 'Error: Sheet not found';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(logId).trim()) {
      // Found the row. Update Column D (Index 3 + 1 = 4 in 1-based, but getRange is row, col)
      // Row is i + 1
      // Col is 4 (Notes)
      sheet.getRange(i + 1, 4).setValue(newNote);
      return 'Updated';
    }
  }
  return 'Error: Log not found';
}

function updateGoalVision(goalId, newVision) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, CONFIG.SHEET_NAMES.DB_GOALS);
  if (!sheet) return 'Error: Sheet not found';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // id column is 0
    if (String(data[i][0]).trim() === String(goalId).trim()) {
      // Vision column is index 2, so getRange col is 3
      sheet.getRange(i + 1, 3).setValue(newVision);
      return 'Updated';
    }
  }
  return 'Error: Goal not found';
}


/**
 * Repair Tool: Fix corrupted Habit IDs (e.g. names in ID column)
 */
function repairHabitIds() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('DB_Habits');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());

  const idIdx = headers.indexOf('id');
  const titleIdx = headers.indexOf('title');

  if (idIdx === -1) return 'Error: No ID column found';

  const updates = [];

  for (let i = 1; i < data.length; i++) {
    const currentId = String(data[i][idIdx]);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentId);

    // If not UUID (e.g. empty or is a name), replace it
    if (!isUuid) {
      const newId = Utilities.getUuid();
      console.log(`Reparing row ${i + 1}: "${currentId}" -> ${newId}`);
      // Set value immediately or batch? Bath is better but simple set is fine here.
      sheet.getRange(i + 1, idIdx + 1).setValue(newId);
      updates.push({ old: currentId, new: newId, name: data[i][titleIdx] });
    }
  }

  return updates;
}

/**
 * Helper to map headers to column indices
 * @param {Array} headers - Row of headers
 * @returns {Object} Map of lowercase header name to index
 */
function createHeaderMap(headers) {
  const map = {};
  if (!headers) return map;
  headers.forEach((h, i) => {
    if (h) map[String(h).toLowerCase()] = i;
  });
  return map;
}


// -----------------------------------------------------------------------------
// EXPERIENCES (One-Day Experience)
// -----------------------------------------------------------------------------
function getExperiences() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetName = 'DB_Experiences';
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Schema: id, title, image, status, budget, location, duration, tags, url, description, created_at
    sheet.appendRow(['id', 'title', 'image', 'status', 'budget', 'location', 'duration', 'tags', 'url', 'description', 'created_at']);

    // Add Dummy Data for First Run
    const dummy = [
      [Utilities.getUuid(), '陶芸体験をする', 'https://images.unsplash.com/photo-1526401037286-6ae8e11894a4?q=80&w=600&auto=format&fit=crop', 'Draft', 5000, '浅草', '3h', 'Creative,Indoor', '', '土を触って心を整える。', new Date()],
      [Utilities.getUuid(), '鎌倉の絶景カフェに行く', 'https://images.unsplash.com/photo-1549643276-fbc2bd41499f?q=80&w=600&auto=format&fit=crop', 'Draft', 2500, '鎌倉', '4h', 'Cafe,Relax', '', '海が見えるカフェで読書する。', new Date()],
      [Utilities.getUuid(), 'スパイスカレー作り', 'https://images.unsplash.com/photo-1596797038530-2c107229654b?q=80&w=600&auto=format&fit=crop', 'Scheduled', 4000, '下北沢', '2.5h', 'Cooking,Spicy', '', '本格的なスパイス配合を学ぶ。', new Date()]
    ];
    dummy.forEach(row => sheet.appendRow(row));
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const hMap = createHeaderMap(headers);
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const id = r[hMap['id']];
    if (!id) continue;

    list.push({
      id: String(id),
      title: String(r[hMap['title']] || ''),
      image: String(r[hMap['image']] || ''),
      status: String(r[hMap['status']] || 'Draft'),
      budget: r[hMap['budget']], // Keep raw for flexibility (string or number)
      location: String(r[hMap['location']] || ''),
      duration: String(r[hMap['duration']] || ''),
      tags: String(r[hMap['tags']] || ''),
      url: String(r[hMap['url']] || ''),
      description: String(r[hMap['description']] || '')
    });
  }

  return list;
}

function saveExperience(item) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = getSafeSheet(ss, 'DB_Experiences');
  if (!sheet) return 'Error: Sheet missing';

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hMap = createHeaderMap(headers);
  const data = sheet.getDataRange().getValues();

  // Check mapping
  if (hMap['id'] === undefined) return 'Error: ID column missing';

  let rowIndex = -1;
  let id = item.id;

  // Find existing
  if (id) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][hMap['id']]) === String(id)) {
        rowIndex = i + 1;
        break;
      }
    }
  } else {
    id = Utilities.getUuid();
  }

  // Prepare fields
  const now = new Date();
  const rowValues = {
    'id': id,
    'title': item.title || '',
    'image': item.image || '',
    'status': item.status || 'Draft',
    'budget': item.budget || '',
    'location': item.location || '',
    'duration': item.duration || '',
    'tags': item.tags || '',
    'url': item.url || '',
    'description': item.description || '',
    // created_at? Only for new
  };

  if (rowIndex === -1) {
    // Create
    rowValues['created_at'] = now;
    const newRow = new Array(headers.length).fill('');
    for (const key in rowValues) {
      if (hMap[key] !== undefined) newRow[hMap[key]] = rowValues[key];
    }
    sheet.appendRow(newRow);
  } else {
    // Update
    for (const key in rowValues) {
      const colIdx = hMap[key];
      if (colIdx !== undefined) {
        sheet.getRange(rowIndex, colIdx + 1).setValue(rowValues[key]);
      }
    }
    // Maybe update updated_at if column exists
  }

  return { status: 'Saved', id: id };
}

/**
 * Image Link Resolver
 * 1. Supports Generic OGP (Meta Tags) for public sites.
 * 2. Works for public Google Drive links by extracting og:image.
 * NOTE: No Authentication required for public links.
 */
function resolveImage(url) {
  if (!url) return null;

  // 1. Google Drive Links: Construct Direct 'lh3' Link
  // For public images, 'https://lh3.googleusercontent.com/d/ID' works as a direct embed link.
  // This bypasses the need for OGP scraping or DriveApp authorization.
  if (url.includes('drive.google.com')) {
    const match = url.match(/[-\w]{25,}/);
    if (match) {
      return `https://lh3.googleusercontent.com/d/${match[0]}`;
    }
  }

  // 2. Generic OGP (Public Sites & Public Drive)
  // Since Drive links are public, this will fetch the preview page 
  // and extract the og:image URL (which works in <img> tags).
  try {
    const response = UrlFetchApp.fetch(targetUrl, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      }
    });

    if (response.getResponseCode() === 200) {
      const content = response.getContentText();
      const match = content.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (match && match[1]) {
        return match[1].replace(/&amp;/g, '&');
      }
    }
  } catch (e) {
    console.warn("OGP Resolve Error", e);
  }
  return url;
}
