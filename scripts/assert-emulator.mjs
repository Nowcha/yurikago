/**
 * test:rules の前置き。
 * rules.test.ts は FIRESTORE_EMULATOR_HOST が無いとスイート全体をスキップする。
 * emulators:exec がこの変数を渡し損ねると、ルールを一度も検証しないまま
 * exit 0 で「緑」になる。テストを1件も実行しなかったことと、実行して通ったことを
 * 区別できないので、ここで明示的に落とす。
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'FIRESTORE_EMULATOR_HOST が設定されていません。'
    + 'Emulator経由で起動していないため、ルールテストは1件も実行されません。',
  );
  process.exit(1);
}
console.log(`Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
