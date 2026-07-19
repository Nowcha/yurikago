Phase 1.5: 妊娠週次サマリ src/data/weekly-info.json の下書きを生成してください。

要件:
- 対象: 妊娠4週〜41週。各週 { week, babySize, babyNote, momNote, checkup? }
- 内容は一般情報のみ（医療アドバイス・診断的な表現は禁止）
- 各エントリに出典（厚労省・自治体・公的機関等のURL）を sources 配列で必須記載
- 不安を煽る表現は使わない（要件定義の設計思想）
- 生成後、私がレビューしてからコミットする
