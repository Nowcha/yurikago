import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // CLAUDE.md: any禁止（不明な型は unknown + 型ガード）
      '@typescript-eslint/no-explicit-any': 'error',
      // Firestoreの購読を張り直すときに、読み込み中フラグや前の世帯のデータを
      // 同期的に捨てている箇所が該当する（App/SyncBanner/Records）。
      // 購読のライフサイクルと状態が対になっており、消すと前の世帯のタスクが
      // 一瞬見える・ローディングが出ないといった実害が出る。
      // 見えなくはしたくないのでoffではなくwarnで残す
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // ブラウザでもNodeでもない実行環境
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
