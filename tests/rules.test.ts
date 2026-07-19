/**
 * Firestoreセキュリティルールのテスト。
 * 実行: npm run test:rules（Firebase Emulator + Java が必要）
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

// Emulator未起動時（npm test 単体実行時）はスイート全体をスキップする
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!hasEmulator) return;
  env = await initializeTestEnvironment({
    projectId: 'yurikago-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env?.cleanup());

const base = { name: 'test', dueDate: '2026-10-01', birthDate: null, memberNames: {} };

describe.skipIf(!hasEmulator)('households ルール', () => {
  it('未認証は読み書き不可', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'households/h1')));
    await assertFails(setDoc(doc(db, 'households/h1'), { ...base, memberUids: ['x'] }));
  });

  it('自分を含む世帯は作成できる / 含まない世帯は作成できない', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'households/h1'), { ...base, memberUids: ['alice'] }));
    await assertFails(setDoc(doc(alice, 'households/h2'), { ...base, memberUids: ['bob'] }));
  });

  it('3人以上の世帯は作成できない', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(alice, 'households/h3'), { ...base, memberUids: ['alice', 'bob', 'carol'] }),
    );
  });

  it('メンバーはパートナーを追加できる / 非メンバーは自分を追加できない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'households/h4'), { ...base, memberUids: ['alice'] });
    });
    const mallory = env.authenticatedContext('mallory').firestore();
    await assertFails(
      updateDoc(doc(mallory, 'households/h4'), { memberUids: arrayUnion('mallory') }),
    );
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(alice, 'households/h4'), { memberUids: arrayUnion('bob') }),
    );
  });

  it('メンバーは自分自身をmemberUidsから外す更新はできない', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'households/h5'), { ...base, memberUids: ['alice', 'bob'] });
    });
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'households/h5'), { memberUids: ['bob'] }));
  });

  it('サブコレクション: メンバーのみ読み書き可', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'households/h6'), { ...base, memberUids: ['alice'] });
      await setDoc(doc(ctx.firestore(), 'households/h6/tasks/t1'), { title: 'x' });
    });
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(alice, 'households/h6/tasks/t1')));
    await assertFails(getDoc(doc(bob, 'households/h6/tasks/t1')));
    await assertFails(setDoc(doc(bob, 'households/h6/tasks/t2'), { title: 'y' }));
  });
});
