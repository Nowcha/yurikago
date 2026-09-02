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
import { doc, setDoc, getDoc, updateDoc, deleteDoc, arrayUnion, writeBatch } from 'firebase/firestore';

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

  it('世帯本体と配下ドキュメントを同一バッチで初回作成できる', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const batch = writeBatch(alice);
    batch.set(doc(alice, 'households/h-batch'), { ...base, memberUids: ['alice'] });
    for (let index = 0; index < 22; index += 1) {
      batch.set(doc(alice, `households/h-batch/tasks/t${index}`), { title: `task-${index}` });
    }
    for (let index = 0; index < 16; index += 1) {
      batch.set(doc(alice, `households/h-batch/items/i${index}`), { name: `item-${index}` });
    }

    await assertSucceeds(batch.commit());
  });

  it('初回作成バッチでも別世帯の配下ドキュメントは作成できない', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const batch = writeBatch(alice);
    batch.set(doc(alice, 'households/h-own'), { ...base, memberUids: ['alice'] });
    batch.set(doc(alice, 'households/h-other/tasks/t1'), { title: 'task' });

    await assertFails(batch.commit());
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
    await assertSucceeds(setDoc(doc(alice, 'households/h6/tasks/t2'), { title: 'y' }));
    await assertFails(getDoc(doc(bob, 'households/h6/tasks/t1')));
    await assertFails(setDoc(doc(bob, 'households/h6/tasks/t2'), { title: 'y' }));
  });
});

/**
 * 回帰テスト: 世帯の破棄経路。
 * かつては本体を物理削除できたため、孤児サブコレクションが残った状態で
 * 第三者が同じhidの世帯を作り直すと、残存データを全部読めた。
 * 墓標方式でこの経路を閉じている。ここが緩むと個人データが漏れる。
 */
describe.skipIf(!hasEmulator)('世帯の破棄（墓標方式）', () => {
  const tombstone = { memberUids: [], deletedAt: '2026-09-03T00:00:00.000Z' };

  async function seed(hid: string): Promise<void> {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `households/${hid}`), { ...base, memberUids: ['alice'] });
      await setDoc(doc(db, `households/${hid}/tasks/t1`), { title: '出生届', secret: 'PII' });
    });
  }

  it('メンバーでも世帯本体は物理削除できない', async () => {
    await seed('d1');
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(deleteDoc(doc(alice, 'households/d1')));
  });

  it('メンバーは墓標化できる', async () => {
    await seed('d2');
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'households/d2'), tombstone));
  });

  it('墓標に個人データを残すことはできない', async () => {
    await seed('d3');
    const alice = env.authenticatedContext('alice').firestore();
    // nameやdueDateを道連れにできると「すべて削除」が嘘になる
    await assertFails(
      setDoc(doc(alice, 'households/d3'), { ...tombstone, name: 'のこる', dueDate: '2026-10-01' }),
    );
    // memberUidsが空でなければ墓標ではない（通常のupdate条件も満たさない）
    await assertFails(
      setDoc(doc(alice, 'households/d3'), { memberUids: ['mallory'], deletedAt: tombstone.deletedAt }),
    );
  });

  it('墓標化しても孤児タスクは第三者に読めない', async () => {
    await seed('d4');
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'households/d4'), tombstone));

    // hidを知る第三者（外された元パートナーを想定）
    const mallory = env.authenticatedContext('mallory').firestore();
    // 墓標が居座るので世帯を作り直せない ← これが経路を塞いでいる要
    await assertFails(setDoc(doc(mallory, 'households/d4'), { ...base, memberUids: ['mallory'] }));
    await assertFails(getDoc(doc(mallory, 'households/d4/tasks/t1')));
  });

  it('墓標は本人にも復活・削除できない', async () => {
    await seed('d5');
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'households/d5'), tombstone));

    await assertFails(updateDoc(doc(alice, 'households/d5'), { memberUids: ['alice'] }));
    await assertFails(deleteDoc(doc(alice, 'households/d5')));
    await assertFails(getDoc(doc(alice, 'households/d5/tasks/t1')));
  });
});
