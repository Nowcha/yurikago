# ゆりかご（yurikago）

予定日から逆算する、ふたりの出産準備手帳。詳細は docs/requirements.md 参照。

## クイックスタート

1. `npm install`
2. Firebaseプロジェクト作成 → `src/lib/store.ts` の firebaseConfig を貼り替え
   （Auth: Googleログイン有効化 / Firestore作成 / 承認済みドメイン追加）
3. `npm run deploy:rules`（または コンソールに firestore.rules を貼付）
4. `npm run dev`

## テスト

- `npm test` — 期限計算ロジック
- `npm run test:rules` — セキュリティルール（Emulator + Java必要）

## デプロイ

mainにpushでGitHub Pagesへ自動デプロイ（Settings > Pages > Source: GitHub Actions）。
リポジトリ名を変えた場合は vite.config.ts の base を修正。
