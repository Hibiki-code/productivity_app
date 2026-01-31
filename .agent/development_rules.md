# Development Rules & Operational Guidelines (開発運用ルール)

## 0. エラー対応プロトコル (最優先事項)

**ミスやエラーが発生した場合は、以下の手順を厳守すること。**

1. **Stop & Analyze (分析)**: 盲目的に修正や再試行をしない。なぜ起きたか（構文エラー、論理ミス、デプロイ手順ミス）を特定する。
2. **Document (登録)**: このファイルの「5. 品質管理と再発防止ルール」セクションに、同じ過ちを防ぐためのルールを追加する。
3. **Fix (実行)**: ルール登録後に修正を行う。

---

## 1. 基本原則 (Core Principles)

### 1.1 ドキュメント体系

1. **Product Vision ([product_vision.md](product_vision.md))**: Why & What (目的・哲学).
2. **Database Definition ([database.md](database.md))**: Data (データ構造).
3. **Development Rules (当ドキュメント)**: How (開発手法).

### 1.2 コミュニケーション規定

* **日本語 (Japanese)**: 思考、計画、回答、コミットメッセージは全て日本語。
* **ドキュメント (Artifacts)**: **`implementation_plan.md` は必ず「日本語」で作成すること。これは絶対的なルールである。** ユーザーへの報告、計画、説明は全て日本語で行う。

### 1.3 破壊的変更の禁止

* 既存のアニメーションやUXを劣化させない。「積み上げ」で開発する。

---

## 2. 環境定義 (Environments)

| 環境名 | 役割 | GAS Project ID | Git Branch | Web App URL | Config |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LifeOSDeV** | **開発 (Development)** | `1gtkBY_YkkUnBrTUr9vtnfa4LVXNmT42bxzKrMh0mWTPJTIJO9NE_7O8w` | `feature/*` | [Dev App (Exec)](https://script.google.com/macros/s/AKfycbxcXn3jqH5CKMdk4iuNpvfpfxSgR8yycETwAmezwTiiNU9B5_Lx7J4yg56q-f338b1ew/exec) | [.clasp.json](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/.clasp.json) (Dev ID) |
| **LifeOSMain** | **本番 (Production)** | `1k1O3Pv7wZG-R7Ooa0aRPha2bZ_YzYz7kmbWK7Tbg7_cWSL7S6EedXdHt` | `main` | [Main App (Prod)](https://script.google.com/macros/s/AKfycbxV6zW96DI3zbeycb0aU2jCcm4kz669yYAQYCej0dPLxUCtVneY9j51XkUw__j9b2Y7lg/exec) | [.clasp.json](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/.clasp.json) (Main ID) |

> [!IMPORTANT]
> **Staging (Stg) 環境は廃止されました。** DeVとMainのみを使用します。

---

## 3. 開発運用ルール (Rules of Engagement)

### ルール1: デプロイプロセス

**⚠️ 厳守事項: Main環境へのデプロイおよびMainブランチへのマージは、ユーザーの明示的な許可なしに絶対に行ってはならない。**
**特に、「機能が完成したから気を利かせてMainへ反映する」という行為は厳禁とする。**
**必ず「Main環境へ反映してください」という、ユーザーからの独立した明確な指示（プロンプト）を待つこと。**
**「承認」と「デプロイ指示」は別物として扱う。**

1. **開発 (Dev)**:
    * `git checkout -b feature/xxx`
    * [.clasp.json](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/.clasp.json) = **Dev ID**
    * `clasp push` -> 動作確認
2. **本番リリース (User Approval Required)**:
    * ユーザー承認を得る。
    * `main` へマージ。
    * [.clasp.json](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/.clasp.json) = **Main ID** に書き換え。
    * `clasp push` -> `clasp deploy`。
    * **直ちに Dev ID に戻す**。

### ルール2: ファイル管理

* **`clasp pull` 前**: ローカルの `*.gs` ファイルを削除する。
* **`clasp push` 前**: 重複 (`.gs` と [.js](file:///c:/Users/hbksk/.gemini/antigravity/scratch/productivity_app/Code.js)) があれば `.gs` を削除する。

---

## 4. コーディングガイドライン (Coding Standards)

### 4.1 モーダル実装の堅牢化 (Modal Robustness)

* **状態管理**: `style.display` を明示的に操作する。
  * Open: `el.classList.add('open'); el.style.display = 'flex';`
  * Close: `el.classList.remove('open'); el.style.display = 'none';`
* **安全性**: 背景クリック (`onclick="if(event.target===this) closeModal()"`) を必ず実装。

### 4.2 GAS/JS Anti-Patterns

* **No `</script>` in JS**: `<\/script>` または `'</scr' + 'ipt>'` を使用。
* **No Malformed HTML**: `innerHTML` で `< div` (スペース入りタグ) を使わない。
* **No Infinite Loops**: `while` は脱出条件を確認。
* **No Hardcoded Secrets**: SecretsはScript Propertiesへ。

### 4.3 楽観的UI (Optimistic UI)

* **即時反応**: `google.script.run` を待たずにDOM更新。失敗時はロールバック通知。

---

## 5. 品質管理と再発防止ルール (Learned Rules)

*エラー発生時に学んだ教訓をここに追記していくこと。*

### アンチパターン: 不完全な削除 (Incomplete Cleanup)

* **教訓**: UI要素削除時は、ID/ClassでGrepし、CSS/JSの残骸を完全に消去する。

### アンチパターン: 競合によるリセット (Regression by Conflict)

* **教訓**: 新規機能が意図通り動かない場合、既存コードが新規コードの状態を上書き・リセットしていないか（ID重複、初期化ロジックの競合、古いイベントリスナーの干渉など）を徹底的に分析する。特に、モーダルやフォームなどの共有コンポーネントを再利用または複製する場合は注意する。

### アンチパターン: ゴーストコンポーネント (Ghost/Zombie Components)

* **教訓**: UIコンポーネント（特にモーダルなどのオーバーレイ）をリプレースする際は、古いコードがHTML内に残っていないか必ず確認する。
  * **症状**: ユーザーは「古いコンポーネント」を操作しているが、JSは「新しいコンポーネント（非表示）」の値を読み取っているため、常に初期値が送信される。
  * **対策**: `grep` 等を使用し、同一IDや類似クラスを持つ要素が複数存在しないかを確認してから実装を完了する。古いコードはコメントアウトではなく削除する。

### アンチパターン: ゾンビコードの増殖 (Zombie Code Proliferation) [Added 2026-01-10]

* **教訓**: 関数（特に `toggleHabit` のようなCore関数）を定義する際は、必ずファイル全体を検索し、重複定義がないか確認する。
* **症状**: コードを修正したのに反映されない。
* **原因**: ファイル下部に重複した古い関数定義があり、それが上書きしている。
* **対策**: `grep` してから関数を書く。大規模修正時は古いブロックを完全に削除する。

### 構文とHTMLの安全性 (Syntax Safety) [Added 2026-01-10]

* **HTML in JS**: `< span` や `< div` のようなスペース入りタグはブラウザによって無効化または誤描画の原因となる。必ず `<tag` と詰める。
* **Brace Matching**: `Illegal return statement` は「前の関数の閉じ忘れ」である可能性が高い。

### 楽観的UIのデータ一貫性 (Optimistic Data Integrity) [Added 2026-01-10]

* **教訓**: 2段階トグル（Status 0->1->2）などの複雑な状態遷移において、クロージャ変数（`h`）に頼ると古い状態を参照する恐れがある。

### Google Apps Script Deployment Rules (GAS Deployment Safety) [Added 2026-01-12]

* **Use .claspignore**: ALWAYS ensure a `.claspignore` file exists and is configured to ignore local-only files (e.g., node scripts `check_*.js`, `temp_*.js`, `node_modules`, tests) before running `clasp push`.
* **Clean Deployment**: Never upload local debugging tools (Node.js scripts) to the GAS server. They will fail with `ReferenceError`.
* **Verify File List**: Before pushing, verify with `clasp status` or by checking the file list to ensure no unexpected files are included.

### 基本的な構文チェックの徹底 (Syntax Check Discipline) [Added 2026-01-12]

* **未閉の括弧と引用符 (Unclosed Braces/Quotes)**:
  * `if (condition) { ...` のようなブロックで `}` を閉じ忘れていないか。
  * `"` (Double) や `'` (Single) のクォーテーション閉じていないか。
  * JSONデータのカンマ `,` 漏れや構造ミスがないか。
* **ツール活用**:
  * エラー箇所を迅速に見つけるため、積極的に `npx node -c temp_check.js` などのコマンドラインツールを活用する。

### GAS Template Engine Specifics (GAS特有の問題と対策) [Added 2026-01-12]

* **正規表現の安全性**: `HtmlService` テンプレート内（`<?!= include(...) ?>` で読み込まれるJS）では、正規表現リテラル `/.../` が誤ってHTMLタグやコメントとしてパースされ、スクリプトが破損する場合がある。
  * **対策**: 複雑な正規表現は `new RegExp('pattern')` コンストラクタを使用する。特にスラッシュ `/` を含む場合は必須。
* **一行コメントの危険性**: JSコード内で `// comment` を多用すると、GASのインジェクション処理で行連結や改行削除が発生した際に、後続のコードまでコメントアウトされてしまうリスクがある。
  * **対策**: JSファイル（特に `script` タグ内）では `/* ... */` ブロックコメントを使用するか、リリースタイミングでコメントを削除する。
* **大容量ファイルの分割**: `HtmlService` は巨大なファイルのインクルード時に予期せぬ挙動（Truncation）を示すことがある。

### 楽観的UIのデータ一貫性 (Optimistic Data Integrity) [Added 2026-01-26]

* **教訓**: `saveHabit` などの更新系処理の直後は、必ず「正しい日付」で再読み込みを行うか、サーバーから「最新の統合済みデータ」を返却させてそれを使用する。
* **アンチパターン**: 保存処理完了時に画面リロードを行わず、かつサーバーからの戻り値も無視すると、画面上のデータとDBの状態が乖離し、「保存したのに消える」現象が発生する。

### バックエンドデータの堅牢性 (Backend Robustness) [Added 2026-01-26]

* **教訓**: `HABIT_LOG` などのログ系データは、読み込み時に必ず「重複排除 (Deduplication)」または「マージ (Merge)」ロジックを通すこと。
* **理由**: 並列処理や誤った書き込みにより、同じ日付・同じIDの行が複数生成される場合がある。単純に `find` で1行だけ探すと、空の重複行を拾ってしまい「データ消失」に見える。
* **対策**: `getHabitStatus` では、対象日の全行をスキャンし、有効な値（`1`など）をOR条件で統合して返す。

### クライアントサイド構文エラーの予防 (Client Syntax Prevention) [Added 2026-01-26]

* **教訓**: `js_part*.html` 内のJSコードは文字列として扱われるため、エディタの構文チェックが効きにくい。
* **頻出ミス**: 重複した `withFailureHandler` や、ブロックの閉じ忘れ `}`。
* **対策**: コード修正後は必ずエディタ（VSCode等）で該当部分の構文が壊れていないか目視確認する。特に `google.script.run` チェーンの括弧に注意。
