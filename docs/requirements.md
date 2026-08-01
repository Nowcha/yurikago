# 出産準備・育児サポートアプリ 要件定義書 v0.2

- 更新日: 2026-07-16
- 変更点: 夫婦リアルタイム共有を必須要件化 → Firebase（Firestore + Auth）を採用。手続きマスターv0.1を添付（procedure-master-draft.json）
- 対象ユーザー: 自分たち夫婦専用（一般公開は想定しない）

---

## 1. コンセプト

**「予定日を1つ入れるだけで、出産までにやるべきこと・買うべきもの・出すべき書類がすべて逆算スケジュールに並ぶ。夫婦どちらの端末からも同じ景色が見える」**

産前 → 出産 → 産後を1つのデータモデルで貫く。中核は **期限逆算タスクエンジン** と **夫婦リアルタイム同期**。

### 差別化ポイント
| 観点 | 既存アプリ | 本アプリ |
|---|---|---|
| 産前産後の連続性 | ninaru→ninaru baby→ぴよログと乗り換え前提 | 予定日→出生日切替で一気通貫 |
| 手続き | 制度記事の配信のみ | 江東区・都・国・会社の手続きを期限逆算タスク化。担当（夫/妻）を割当可能 |
| 購入準備 | チェックリストのみ | 必要時期×予算×入手方法を夫婦で共同管理 |
| 記録分析 | グラフ表示止まり | JSONエクスポート→Claude Codeで分析（Phase 3） |

---

## 2. 全体ロードマップ

| Phase | スコープ |
|---|---|
| **Phase 1 (MVP)** | 産前の逆算タスク管理＋手続きナビ＋購入計画＋夫婦同期 |
| Phase 2 | 出生日確定イベント → 産後手続きの期限確定・再計算 |
| Phase 3 | 育児記録（授乳・睡眠・沐浴等、夫婦リアルタイム共有）＋Claude Code分析 ※記録UI実装済み |
| Phase 4 | 予防接種スケジュール、成長記録 |

---

## 3. 技術方針（非機能要件）

### 3.1 スタック
- **フロント**: React + Vite + TypeScript + Tailwind CSS（標準スタック）
- **ホスティング**: GitHub Pages（PWA: manifest + Service Worker）
- **バックエンド**: Firebase 無料枠（Sparkプラン）
  - **Firestore**: 全データの単一ソース。オフライン永続化（persistentLocalCache）を有効化し、オフライン記録→再接続時自動同期
  - **Firebase Auth**: Googleログイン（夫婦それぞれの既存Googleアカウント）
- **zero-API-key原則との整合**: FirebaseのWeb設定値（apiKey等）は秘密情報ではなく公開クライアント識別子。秘密鍵の管理は発生しない。データ保護はFirestoreセキュリティルールで担保（Enterprise Intelligence Hubと同方式）

### 3.2 Firestoreデータ設計
```
households/{householdId}
  ├─ meta: { name, dueDate, birthDate?, memberUids: [uid1, uid2], profile }
  ├─ profile: { municipality: "koto", parents: [{ role, employment, hasChildcareLeave }] }
  ├─ tasks/{taskId}        // タスクインスタンス（1タスク=1ドキュメント）
  ├─ items/{itemId}        // 購入アイテム
  └─ records/{recordId}    // Phase 3: 育児記録
```
- **セキュリティルール**: `request.auth.uid in resource.data.memberUids` の世帯を持つユーザーのみ読み書き可（memberUidsはmetaから解決、または各docにhouseholdIdを持たせてルールでmeta参照）
- **世帯参加フロー（UID登録方式）**: 後から入る側がログインして自分のUIDをパートナーに共有 → 先に世帯を作った側が設定画面でUIDを登録してmemberUidsに追加。招待コード方式はCloud Functions（Blaze必須）なしでは安全に検証できないため不採用
- **競合解決**: 1タスク=1ドキュメントなので実質競合しない。last-write-wins で十分
- **無料枠見積**: 夫婦2人・タスク数百件・Phase 3の記録が1日30件でも、読み書きはSpark無料枠（5万read/日、2万write/日）に対して余裕

### 3.3 その他
- **通知**: アプリ内バッジ＋期限接近ハイライト＋ICSエクスポート（カレンダー連携）。FCMプッシュはPhase 3で検討（Sparkで利用可、ただしService Worker実装コスト増のためMVP外）
- **エクスポート**: 全データJSON（バックアップ兼Claude Code分析入力）
- **スマホファースト**: 縦画面・片手操作前提

---

## 4. Phase 1 (MVP) 機能要件

### 4.1 セットアップ
1. Googleログイン
2. 世帯作成 or 招待コードで参加
3. 出産予定日、自治体（江東区）、夫婦それぞれの雇用形態・育休取得予定を設定
4. タスクテンプレートからタスク一括生成

### 4.2 逆算タスクエンジン
```typescript
interface TaskTemplate {
  id: string;
  title: string;
  category: 'procedure' | 'purchase' | 'prep' | 'health' | 'work';
  authority?: 'koto' | 'tokyo' | 'national' | 'employer' | 'hospital';
  trigger:
    | { type: 'week'; week: number }
    | { type: 'beforeDue'; days: number }
    | { type: 'afterBirth'; days: number };
  deadline?: 'hard' | 'soft';
  conditions?: ProfileCondition[];
  prepTasks?: string[];        // 産後タスクでも産前にできる準備
  links?: { label: string; url: string }[];
  notes?: string;
}

interface TaskInstance extends TaskTemplate {
  status: 'todo' | 'doing' | 'done' | 'na';
  assignee?: 'partner1' | 'partner2' | 'both';   // 夫婦の担当割当
  dueDateResolved?: string;    // トリガーから計算した具体日付
  userMemo?: string;
}
```
- `afterBirth` タスクは産前は準備サブタスクのみ表示、Phase 2の出生イベントで期限確定
- **担当割当（assignee）が夫婦共有の価値の中心**: 「出生届は夫、児童手当の書類準備は妻」のように分担を可視化
- 手動タスクの追加・編集・削除

### 4.3 手続きマスター
`src/data/procedure-master.json` 参照（江東区・東京都・国・会社の40手続きを収録）。
主要期限:
- 出生届: 出生日含め14日以内（hard）
- 児童手当: 出生翌日から15日以内（hard、遅れると遡及されない月が発生）
- 018サポート＋赤ちゃんファースト: 同時申請可。ギフトポイントは登録から6か月で失効
- 出産育児一時金: 直接支払制度は産院と事前合意。差額精算は出産翌日から2年で時効

### 4.4 購入計画
v0.1と同一（PurchaseItemモデル）。追加: assigneeフィールド（どちらが買うか）。

### 4.5 ダッシュボード
- 妊娠週数・予定日カウントダウン
- 今週やること（自分担当 / 相手担当 / 共通のセクション分け）
- hard期限の接近・超過アラート
- カテゴリ別進捗

### 4.6 データ管理
- JSONエクスポート / インポート
- ICSエクスポート（hard期限）
- 世帯データ削除

---

## 5. Phase 2 概要: 出生イベント
- 「生まれた」ボタン → 出生日時入力 → afterBirthタスク全件の期限確定、hard期限最優先表示
- 出生届〜児童手当〜医療証〜健保〜018サポートの「産後2週間スプリント」ビューを表示

## 6. Phase 3: 育児記録＋分析（記録部分は実装済み）
- 授乳（母乳L/R・ミルク量）、搾乳、睡眠、排泄、沐浴、体温、体重、メモ
- Firestoreリアルタイム同期で夫婦どちらの記録も即反映（ぴよログ同等）
- 片手ワンタップUI、直前記録からの経過時間表示、タイムバー
- 分析: JSONエクスポート → Claude Code `/analyze-baby-week` で週次レポート

---

## 7. 未決事項

1. ~~手続きマスターの精査~~ → 解決。procedure-master-draft.json v0.1完成
2. ~~会社固有手続き~~ → 解決。会社・健保タスクをマスターに追加（hr-checklist / shussan-teatekin / babysitter-support / cafeteria-plan）。社外公開情報は二次情報のため、**「人事・健保への一括ヒアリング」タスク（予定日75日前）で社内ポータル・健保公式サイトの一次情報に裏取りし、各タスクの期限・メモを上書きする運用**とする
3. ~~週数連動の情報表示~~ → **方針変更: Phase 1.5として実装**。ninaru型の毎日配信は維持コスト過大のため見送りだが、週次サマリ（妊娠◯週: 赤ちゃんの大きさ目安・母体の変化・健診等の一般情報）を静的JSON40週分として同梱する方式なら一度の作成で完結。Claude Codeで下書き生成→セルフレビュー。医療アドバイスではなく一般情報に留め、出典（公的機関等）をJSONに記録する
4. ~~公開範囲~~ → 解決。**publicリポジトリ + GitHub Pages**。防御はFirebase Auth＋Firestoreセキュリティルールで行う
   - リポジトリにコミットしてよいもの: コード、手続きマスターJSON（公開制度情報のみ）、Firebase Web設定値
   - コミット禁止: 個人データ（氏名・予定日・世帯情報はすべてFirestoreのみ）、招待コード、就業規則から転記した社内固有の期限・金額（これらはアプリ内のuserMemo/期限上書きとしてFirestoreに保存）
   - Firestoreルールは「認証済み かつ memberUidsに含まれるユーザーのみ」で全コレクションを閉じる。ルールのユニットテスト（Emulator）をCIに組み込む

## 8. 既知の残課題

- weekly-info.json の人力レビュー（公的情報で更新済み。母子手帳・産院資料との最終突合が必要）

解消済み: 担当別ダッシュボード、カテゴリ別進捗、準備品期限アラート・担当・詳細編集、産後2週間スプリント、Service Worker、Phase 1.5週次サマリ

## 9. 画面一覧（MVP）
| 画面 | 主要素 |
|---|---|
| ログイン/世帯参加 | Googleログイン、世帯作成/招待コード |
| ホーム | 週数、今週のタスク（担当別）、アラート、進捗 |
| タスク一覧 | カテゴリ/期限/担当/状態フィルタ、タイムライン表示 |
| タスク詳細 | 期限、担当、準備サブタスク、公式リンク、メモ |
| 購入リスト | カテゴリ別、予算集計、担当 |
| 設定 | プロファイル、エクスポート、世帯管理 |
