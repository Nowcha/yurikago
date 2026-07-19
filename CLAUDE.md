# CLAUDE.md

## プロジェクト概要

出産準備・育児サポートアプリ（夫婦専用）。出産予定日から逆算したタスク管理・手続きナビ・購入計画を提供し、Phase 3で育児記録に拡張する。要件定義は `docs/requirements.md`（v0.2）を必ず参照すること。

## 技術スタック・原則

- React + Vite + TypeScript (strict) + Tailwind CSS
- Firebase: Firestore（オフライン永続化有効）+ Auth（Googleログイン）。**Sparkプラン範囲のみ使用（Cloud Functionsは使わない）**
- ホスティング: GitHub Pages（publicリポ、GitHub Actionsでデプロイ）
- **zero-API-key原則**: 秘密鍵・APIキーの管理は行わない。FirebaseのWeb設定値は公開クライアント識別子なのでコミット可。防御はFirestoreセキュリティルールのみで成立させる
- 状態管理: Firestoreを単一ソースとし、ローカル状態はReactのみ（Zustand等は必要になるまで導入しない）

## デザイン方針（モノクロ・ミニマル）

- 配色はbase(白)×ink(墨)のみ。alert(赤)は法定期限と破壊的操作に限定。装飾色・グラデーション禁止
- 影は使わず1pxの罫線（border-ink/10）。角丸は rounded-xl / rounded-2xl まで
- アイコンはlucide-react（strokeWidth 1.6、選択時2.2）。絵文字は使わない
- フォントはNoto Sans JPのみ。階層はサイズとウェイト（400/500/700）と余白で表現

## 絶対にやらないこと

- 個人データ（氏名・予定日・世帯情報・社内規程の転記）をリポジトリにコミットしない。これらはFirestoreのみに保存
- `firestore.rules` を緩めない。全アクセスは「認証済み かつ 世帯メンバー」のみ
- localStorage/sessionStorageを共有データの保存に使わない（Firestoreオフラインキャッシュに任せる）
- 制度マスター（`src/data/procedure-master.json`）に公式リンクなしの制度情報を追加しない

## ディレクトリ構成

```
src/
  data/            # 静的マスター（procedure-master.json, purchase-master.json, weekly-info.json）
  lib/             # firebase初期化, 日付計算(trigger→期限解決), ics生成
  features/
    tasks/         # タスク一覧・詳細・タイムライン
    purchases/     # 購入計画
    dashboard/     # ホーム
    household/     # 世帯作成・メンバー追加・設定
  types/           # TaskTemplate, TaskInstance, PurchaseItem 等（docs/requirements.md §4.2と同期）
docs/
  requirements.md  # 要件定義書（正）
firestore.rules
```

## 開発コマンド

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run test` — Vitest。**期限計算ロジック（trigger→日付解決）は必ずユニットテストを書く**（14日/15日期限の計算ミスは実害が大きい）
- `npm run test:rules` — Firestore Emulatorでセキュリティルールのテスト（@firebase/rules-unit-testing）

## ドメイン知識（実装時の注意）

- 出生届は「出生日を含め」14日以内、児童手当は「出生翌日から」15日以内。**起算日の定義が異なる**ので `resolveDeadline()` はトリガーごとに起算規則を持つこと
- `afterBirth` タスクは出生日未確定の間は期限を表示せず、prepTasksのみ表示する
- 手続きマスターの更新時は各エントリの `links` の公式ページをWebFetchで確認し、変更があれば `notes` に確認日付きで反映する（slash command `/verify-procedures` を用意予定）

## slash commands（.claude/commands/）

- `/verify-procedures`: procedure-master.json の全linksを巡回し、期限・金額の変更を検出して差分報告
- `/generate-weekly-info`: 妊娠週次サマリJSON（Phase 1.5）の下書き生成。一般情報のみ、出典必須
- `/analyze-baby-week`: （Phase 3）エクスポートJSONから週次育児レポート生成
