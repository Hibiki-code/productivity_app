# データベース定義書 (Database Definition Document)

このドキュメントは、アプリケーションで使用されるGoogle Sheetsのデータベース構造、各テーブルの関係性、およびデータの意味を定義します。開発時は必ずこのドキュメントを参照し、整合性を保ってください。

## 1. タスク管理 (Task Management)

### 1.1 タスクマスタ (Sheet: `タスクマスタ` / [Tasks](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/Code.js#104-163))

すべてのタスクの現在の状態を管理するマスタテーブル。

| Column Index | Header Name (Sheet) | Key (Code) | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A (0) | `タスクID` | [id](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#1568-1621) | UUID | タスクの一意な識別子。 | PK |
| B (1) | `タスク名` | `name` | String | タスク名。 | |
| C (2) | `重要度` | `importance` | Integer | 重要度 (3:高, 2:中, 1:低, 0:なし)。UIのセクション分けに使用。 | |
| D (3) | `所要時間` | `estTime` | String | 見積もり時間 (例: "30min")。 | |
| E (4) | `期限` | `dueDate` | Date/String | 期限日 (yyyy/MM/dd)。 | |
| F (5) | `詳細` | `description` | String | タスクの詳細説明。 | |
| G (6) | `達成フラグ` | `status` | Boolean | 完了状態 (`TRUE`: 完了, `FALSE`: 未完了)。 | |
| H (7) | `アーカイブ` | `isArchived` | Boolean | アーカイブフラグ (`TRUE`: アーカイブ済み)。 | |
| I (8) | [TodayHighlight](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/Code.js#360-393) | `isHighlight` | Boolean | **[Explicit]** 今日のハイライトかどうか。`ハイライトログ`から同期される。 | |

### 1.2 ハイライトログ (Sheet: `ハイライトログ` / [HighlightLog](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/Code.js#360-393))

「今日のハイライト」の設定履歴と達成状況を記録するログ。

| Column Index | Column Name | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- |
| A (0) | Date | Date (yyyy/MM/dd) | 記録日。 | |
| B (1) | SetFlag | Boolean | ハイライトが設定されたかどうか。 | |
| C (2) | TargetID | UUID (String) | 対象のタスクID。 | FK -> `Tasks.ID` |
| D (3) | TargetType | String | 対象の種類 (現時点では "Task" のみ)。 | |
| E (4) | AchievedFlag | Boolean | 達成されたかどうか。 | |
| F (5) | AchievedTime | Time (HH:mm) | 達成時刻。 | |

### 1.3 タスクログ (Sheet: `タスクログ` / `TaskLog`)

タスクのステータス変更履歴を記録するイベントログ。分析用。

| Column Index | Column Name | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- |
| A (0) | LogID | UUID | ログID。 | PK |
| B (1) | TaskID | UUID | 対象タスクID。 | FK -> `Tasks.ID` |
| C (2) | Timestamp | Datetime | 記録日時。 | |
| D (3) | Status | Boolean | 変更後のステータス。 | |

### 1.4 プロジェクト管理 (Sheet: `DB_Project` / `Projects`)

「ロードマップ (Goals)」を束ねる上位概念。1-2ヶ月で達成するような抽象的な目標。

| Column Index | Column Name | Key (Code) | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A (0) | `id` | `id` | UUID | プロジェクトID。 | PK |
| B (1) | `title` | `title` | String | プロジェクト名（例：夢をかなえるゾウ全クリ）。 | |
| C (2) | `vision` | `vision` | String | 理想の状態やビジョン。 | |

### 1.5 目標・ロードマップ (Sheet: `DB_Goals` / `Goals`)

具体的な達成目標。1週間〜1ヶ月単位。

| Column Index | Column Name | Key (Code) | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A (0) | `id` | `id` | UUID | 目標ID。 | PK |
| B (1) | `title` | `title` | String | 目標タイトル。 | |
| C (2) | `vision` | `vision` | String | 達成時のイメージ。 | |
| L (11) | `project_id` | `projectId` | UUID | 所属プロジェクトID。 | FK -> `DB_Project.id` |
| ... | ... | ... | ... | ... | |

### 2.1 習慣定義マスタ (Sheet: `DB_Habits`)

習慣の定義（メタデータ）を管理するテーブル。
*注意: 初期マイグレーション([DataMigration.js](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/DataMigration.js))で作成されるカラムと、後から動的に追加されるカラム(`title_offense`等)が混在している。*

| Column Name (Header) | Key (Code) | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- | :--- |
| [id](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#1568-1621) | [id](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#1568-1621) | UUID | 習慣の一意な識別子。 | PK |
| `name` / `title` | `name` | String | 習慣の表示名。 | |
| `icon` | `icon` | String | Icon名。 | |
| `category` / `section` | `sectionId` | String | セクションID。Migratorは`category`、Codeは`section`を想定(Fallbackあり)。 | |
| `description` / `benefit` | `benefit` | String | メリット/説明。 | |
| `createdAt` | `createdAt` | Date | 作成日。 | |
| `updatedAt` | `updatedAt` | Date | 更新日。 | |
| `status` / `isActive` | `isactive` | String | ステータス (`ACTIVE` / `ARCHIVED`)。 | |
| `text_input` | `hasTextInput` | Boolean | **[Dynamic]** 日記入力が必要かどうか。 | |
| `time_needed` | `time` | String | **[Dynamic]** 所要時間。 | |
| `title_offense` | `offenseTitle` | String | **[Dynamic]** 攻めの習慣名。 | |
| `time_offense` | `offenseTime` | String | **[Dynamic]** 攻めの習慣時間。 | |

### 2.2 習慣記録マトリクス (Sheet: `習慣記録` / `HabitMatrix`)

日付 x 習慣名 のマトリクス形式でステータスを保持する（閲覧・集計用）。
**注意**: カラムは動的に追加される。

| Column Index | Column Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| A (0) | Date | Date (yyyy-MM-dd) | 記録日。行のキー。 |
| B~ (1~) | {Habit Name} | Integer (0-2) | 各習慣のステータス。<br> `0`: 未達成/スキップ<br> `1`: 守り達成 (Done)<br> `2`: 攻め達成 (Advanced) |

### 2.3 習慣イベントログ (Sheet: `DB_HabitLogs`)

習慣の実施記録をトランザクション形式で保存する（信頼できる唯一の情報源）。

| Column Name | Data Type | Description | Relations |
| :--- | :--- | :--- | :--- |
| [id](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#1568-1621) | UUID | ログID。 | PK |
| [date](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#643-663) | Date/String | 対象日。 | |
| `habitId` | UUID | 対象の習慣ID。 | FK -> `DB_Habits.id` |
| `status` | String | ステータス文字列 (`SKIPPED`, `DONE`, `ADVANCED`)。 | |
| `value` | Integer | ステータス数値 (`0`, `1`, `2`)。 | |
| `updatedAt` | Datetime | 更新日時。 | |
| `note` | String | 日記などのテキスト記録。 | |

### 2.4 日記記録 (Sheet: `日記記録`)

テキスト入力が必要な習慣（日記など）の内容を記録。

| Column Index | Column Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| A (0) | Date | Date | 記録日。 |
| B~ (1~) | {Habit Name} | String | 習慣名（動的カラム）。内容はテキスト。 |

### 2.5 理想像マスタ (Sheet: `理想像マスタ`)

理想の自分や状態を定義するマスタ（手動管理）。

| Column Index | Column Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| A (0) | [id](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#1568-1621) | String | 理想像ID。 |
| B (1) | `名前` | String | 理想像のタイトル（例：健康な体）。 |
| C (2) | `内容説明` | String | 詳細な説明や定義。 |

### 2.6 習慣セクション (Sheet: `習慣セクション`)

習慣のカテゴリを定義する設定シート。

| Column Index | Column Name | Data Type | Description |
| :--- | :--- | :--- | :--- |
| A (0) | `ID` | String | セクションID (`sec_morning`, `sec_afternoon` etc)。 |
| B (1) | [Name](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/Code.js#80-103) | String | 表示名（朝, 昼, 夜, その他）。 |
| C (2) | `Order` | Integer | 表示順序。 |

---

## 5. ユーザープロファイル (User Profile) [Future]

AIが文脈を理解し、最適な提案を行うための個人的情報。スプレッドシートまたはアプリ内で管理予定。

### 5.1 プロフィール (Sheet: `DB_UserProfile` - Proposed)

| Key | Data Type | Description |
| :--- | :--- | :--- |
| `key` | String | 項目キー（例：`birth_date`, `occupation`）。 |
| `value` | String/JSON | 値。 |
| `category` | String | カテゴリ（基本情報、興味、身体データ）。 |

### 5.2 ライフログ/遍歴 (Sheet: `DB_UserHistory` - Proposed)

過去の経歴や特筆すべき出来事。

| Key | Data Type | Description |
| :--- | :--- | :--- |
| [date](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/js.html#643-663) | Date | 時期。 |
| `event` | String | 出来事。 |
| `impact` | String | 人生への影響や学んだこと。 |

---

## 6. アプリケーション概念モデル

### 3.1 習慣のレベル (Levels)

習慣には「守り (Level 1)」と「攻め (Level 2)」の2段階が存在する場合がある。

* **初期状態 (Level 0)**:
  * 見た目: 通常の習慣と同じ（アイコン背景色は **緑色**）。
  * ステータス値: `0` (未実施)
* **守り達成 (Level 1)**:
  * 「守り」の習慣（例：1行日記）を達成チェックした状態。
  * 見た目: アイコンの背景色が **赤色** に変化する（「次は攻めだ」という合図）。
  * テキスト: 習慣名と所要時間が「攻め」のもの（例：しっかり日記）に切り替わる。
  * ステータス値: `1` (Done)
* **攻め達成 (Level 2)**:
  * 「攻め」の習慣まで完了した状態。
  * 見た目: 習慣カードが「完了エリア」に移動し、薄色化（Doneスタイル）される。
  * ステータス値: `2` (Advanced)

### 3.2 楽観的UI (Optimistic UI)

* ユーザー操作（チェックボックスON/OFF）は**即座に**画面に反映させる。
* サーバー通信はバックグラウンドで行い、画面の再描画（再取得）は行わないことで「サクサク感」を維持する。
* キャッシュ（DOM状態）を正として扱う。

---

*このドキュメントは開発の進行に伴い、常に最新の状態に更新すること。*
