import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, onSnapshot, writeBatch, updateDoc, setDoc,
  arrayUnion, deleteDoc, deleteField, orderBy, limit, getDocs, documentId, startAfter,
} from 'firebase/firestore';
import type { Household, HouseholdProfile, TaskInstance, TaskTemplate, PurchaseItem, CareRecord } from '../types';
import { resolveDueDate } from './deadline';
import procedureMaster from '../data/procedure-master.json';
import purchaseMaster from '../data/purchase-master.json';
import { collectAllPages } from './pagination';

// ─────────────────────────────────────────────────────────────
// TODO(セットアップ): Firebaseコンソールの「プロジェクトの設定 > マイアプリ」から
// Web設定値を貼り付ける。これは公開クライアント識別子でありコミット可（CLAUDE.md参照）
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: 'AIzaSyD7-R7UOs-lTbE7Ja-NQ1QpU8Vd_Aax7Ao',
  authDomain: 'yurikago-be00f.firebaseapp.com',
  projectId: 'yurikago-be00f',
  storageBucket: 'yurikago-be00f.firebasestorage.app',
  messagingSenderId: '490063155573',
  appId: '1:490063155573:web:550672aeeb558060e9433c',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ── Auth ─────────────────────────────────────────────────────
export function watchAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
export function login() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
export function logout() {
  return signOut(auth);
}

// ── Household ────────────────────────────────────────────────
export function watchMyHousehold(uid: string, cb: (h: Household | null) => void) {
  const q = query(collection(db, 'households'), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    if (snap.empty) return cb(null);
    const d = snap.docs[0];
    cb({ id: d.id, ...(d.data() as Omit<Household, 'id'>) });
  });
}

/** テンプレートのconditionsをプロファイルで評価。未知の条件は通す（安全側=タスクを出す） */
function matchesProfile(
  conditions: TaskTemplate['conditions'], profile: HouseholdProfile,
): boolean {
  if (!conditions) return true;
  return conditions.every((c) => {
    if (c.field === 'hasChildcareLeave') return profile.bothParentsLeave === c.value;
    if (c.field === 'role' && c.value === 'mother-employee') return profile.motherIsEmployee;
    return true;
  });
}

export async function createHousehold(
  uid: string, displayName: string, name: string, dueDate: string,
  profile: HouseholdProfile,
): Promise<string> {
  const ref = doc(collection(db, 'households'));
  const household: Omit<Household, 'id'> = {
    name, dueDate, birthDate: null,
    memberUids: [uid],
    memberNames: { [uid]: displayName },
    profile,
  };
  const batch = writeBatch(db);
  batch.set(ref, household);
  // マスターからタスク一括生成
  const templates = procedureMaster.templates as unknown as TaskTemplate[];
  const now = Date.now();
  for (const t of templates) {
    const taskRef = doc(collection(db, 'households', ref.id, 'tasks'), t.id);
    const instance: Omit<TaskInstance, 'id'> = {
      templateId: t.id,
      title: t.title,
      category: t.category,
      ...(t.authority ? { authority: t.authority } : {}),
      trigger: t.trigger,
      ...(t.deadline ? { deadline: t.deadline } : {}),
      ...(t.prepTasks ? { prepTasks: t.prepTasks, prepDone: t.prepTasks.map(() => false) } : {}),
      ...(t.links ? { links: t.links } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
      status: matchesProfile(t.conditions, profile) ? 'todo' : 'na',
      dueDateResolved: resolveDueDate(t.trigger, dueDate, null),
      createdAt: now,
    };
    batch.set(taskRef, instance);
  }
  // 購入テンプレート
  const items = purchaseMaster.items as unknown as Omit<PurchaseItem, 'id'>[];
  for (const [i, item] of items.entries()) {
    batch.set(doc(collection(db, 'households', ref.id, 'items'), `m-${i}`), item);
  }
  await batch.commit();
  return ref.id;
}

/** パートナー追加（UID登録方式、firestore.rules参照） */
export function addPartner(householdId: string, partnerUid: string, partnerName: string) {
  return updateDoc(doc(db, 'households', householdId), {
    memberUids: arrayUnion(partnerUid),
    [`memberNames.${partnerUid}`]: partnerName,
  });
}

export interface HouseholdSettings {
  name: string;
  dueDate: string;
  birthDate: string | null;
  profile: HouseholdProfile;
}

/** 世帯設定を更新し、予定日・出生日・対象条件に依存するタスクを再計算する */
export async function updateHouseholdSettings(
  household: Household,
  tasks: TaskInstance[],
  settings: HouseholdSettings,
): Promise<void> {
  const templates = new Map(
    (procedureMaster.templates as unknown as TaskTemplate[]).map((template) => [template.id, template]),
  );
  const batch = writeBatch(db);
  batch.update(doc(db, 'households', household.id), {
    name: settings.name,
    dueDate: settings.dueDate,
    birthDate: settings.birthDate,
    profile: settings.profile,
  });

  for (const task of tasks) {
    const patch: Partial<TaskInstance> = {
      dueDateResolved: task.templateId
        ? task.dueDateOverride
          ?? resolveDueDate(task.trigger, settings.dueDate, settings.birthDate)
        : task.dueDateResolved,
    };
    const template = task.templateId ? templates.get(task.templateId) : undefined;
    if (template?.conditions) {
      const applicable = matchesProfile(template.conditions, settings.profile);
      if (!applicable) patch.status = 'na';
      else if (task.status === 'na') patch.status = 'todo';
    }
    batch.update(doc(db, 'households', household.id, 'tasks', task.id), patch);
  }
  await batch.commit();
}

/** 出生イベント: 出生日を確定し、afterBirthタスクの期限を一括再計算（Phase 2） */
export async function registerBirth(household: Household, tasks: TaskInstance[], birthDate: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'households', household.id), { birthDate });
  for (const t of tasks) {
    if (t.trigger.type === 'afterBirth') {
      batch.update(doc(db, 'households', household.id, 'tasks', t.id), {
        dueDateResolved: t.dueDateOverride
          ?? resolveDueDate(t.trigger, household.dueDate, birthDate),
      });
    }
  }
  await batch.commit();
}

// ── Tasks ────────────────────────────────────────────────────
export function watchTasks(householdId: string, cb: (tasks: TaskInstance[]) => void) {
  return onSnapshot(collection(db, 'households', householdId, 'tasks'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskInstance, 'id'>) })));
  });
}
export function updateTask(householdId: string, taskId: string, patch: Partial<TaskInstance>) {
  return updateDoc(doc(db, 'households', householdId, 'tasks', taskId), patch);
}
export function setTaskDueDate(
  household: Household,
  task: TaskInstance,
  dueDate: string | null,
) {
  const ref = doc(db, 'households', household.id, 'tasks', task.id);
  if (!task.templateId) {
    return updateDoc(ref, { dueDateResolved: dueDate });
  }
  if (dueDate) {
    return updateDoc(ref, { dueDateResolved: dueDate, dueDateOverride: dueDate });
  }
  return updateDoc(ref, {
    dueDateResolved: resolveDueDate(task.trigger, household.dueDate, household.birthDate),
    dueDateOverride: deleteField(),
  });
}
export function clearTaskAssignee(householdId: string, taskId: string) {
  return updateDoc(doc(db, 'households', householdId, 'tasks', taskId), {
    assignee: deleteField(),
  });
}
export function addTask(householdId: string, task: Omit<TaskInstance, 'id'>) {
  return setDoc(doc(collection(db, 'households', householdId, 'tasks')), task);
}
export function removeTask(householdId: string, taskId: string) {
  return deleteDoc(doc(db, 'households', householdId, 'tasks', taskId));
}

// ── Purchase items ───────────────────────────────────────────
export function watchItems(householdId: string, cb: (items: PurchaseItem[]) => void) {
  return onSnapshot(collection(db, 'households', householdId, 'items'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PurchaseItem, 'id'>) })));
  });
}
export function updateItem(householdId: string, itemId: string, patch: Partial<PurchaseItem>) {
  return updateDoc(doc(db, 'households', householdId, 'items', itemId), patch);
}
export function addItem(householdId: string, item: Omit<PurchaseItem, 'id'>) {
  return setDoc(doc(collection(db, 'households', householdId, 'items')), item);
}
/** 担当の解除。Firestoreはundefinedを拒否するためdeleteField()でフィールドごと消す */
export function clearItemAssignee(householdId: string, itemId: string) {
  return updateDoc(doc(db, 'households', householdId, 'items', itemId), {
    assignee: deleteField(),
  });
}

export interface MasterSyncResult {
  addedTasks: number;
  updatedTasks: number;
  addedItems: number;
  updatedItems: number;
}

/** 最新マスターを既存世帯へ反映。利用者の進捗・担当・実費・メモ・期限上書きは保持する */
export async function syncMasterData(
  household: Household,
  tasks: TaskInstance[],
  items: PurchaseItem[],
): Promise<MasterSyncResult> {
  const existingTasks = new Map(tasks.map((task) => [task.templateId ?? task.id, task]));
  const existingItems = new Map(items.map((item) => [item.id, item]));
  const templates = procedureMaster.templates as unknown as TaskTemplate[];
  const masterItems = purchaseMaster.items as unknown as Omit<PurchaseItem, 'id'>[];
  const profile = household.profile ?? { bothParentsLeave: true, motherIsEmployee: true };
  const batch = writeBatch(db);
  const result: MasterSyncResult = {
    addedTasks: 0,
    updatedTasks: 0,
    addedItems: 0,
    updatedItems: 0,
  };

  for (const template of templates) {
    const ref = doc(db, 'households', household.id, 'tasks', template.id);
    const current = existingTasks.get(template.id);
    const applicable = matchesProfile(template.conditions, profile);
    if (!current) {
      const instance: Omit<TaskInstance, 'id'> = {
        templateId: template.id,
        title: template.title,
        category: template.category,
        ...(template.authority ? { authority: template.authority } : {}),
        trigger: template.trigger,
        ...(template.deadline ? { deadline: template.deadline } : {}),
        ...(template.prepTasks
          ? { prepTasks: template.prepTasks, prepDone: template.prepTasks.map(() => false) }
          : {}),
        ...(template.links ? { links: template.links } : {}),
        ...(template.notes ? { notes: template.notes } : {}),
        status: applicable ? 'todo' : 'na',
        dueDateResolved: resolveDueDate(
          template.trigger,
          household.dueDate,
          household.birthDate,
        ),
        createdAt: Date.now(),
      };
      batch.set(ref, instance);
      result.addedTasks += 1;
      continue;
    }

    const patch: Partial<TaskInstance> = {
      title: template.title,
      category: template.category,
      trigger: template.trigger,
      dueDateResolved: current.dueDateOverride ?? resolveDueDate(
        template.trigger,
        household.dueDate,
        household.birthDate,
      ),
      ...(template.authority ? { authority: template.authority } : {}),
      ...(template.deadline ? { deadline: template.deadline } : {}),
      ...(template.prepTasks ? { prepTasks: template.prepTasks } : {}),
      ...(template.links ? { links: template.links } : {}),
      ...(template.notes ? { notes: template.notes } : {}),
    };
    if (!applicable) patch.status = 'na';
    else if (current.status === 'na') patch.status = 'todo';
    batch.set(ref, patch, { merge: true });
    result.updatedTasks += 1;
  }

  for (const [index, masterItem] of masterItems.entries()) {
    const id = `m-${index}`;
    const ref = doc(db, 'households', household.id, 'items', id);
    if (!existingItems.has(id)) {
      batch.set(ref, masterItem);
      result.addedItems += 1;
      continue;
    }
    batch.set(ref, {
      name: masterItem.name,
      ...(masterItem.memo ? { memo: masterItem.memo } : {}),
      ...(masterItem.waitUntilBorn != null
        ? { waitUntilBorn: masterItem.waitUntilBorn }
        : {}),
    }, { merge: true });
    result.updatedItems += 1;
  }

  await batch.commit();
  return result;
}

// ── Backup / Restore / Delete ────────────────────────────────
export interface BackupPayload {
  household: Pick<Household, 'name' | 'dueDate' | 'birthDate' | 'profile'>;
  tasks: TaskInstance[];
  items: PurchaseItem[];
  records?: CareRecord[];
}

/** Firestoreのバッチ上限(500)対策: 操作をチャンクに分けて順次コミット */
async function commitInChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}

/** JSONバックアップを現在の世帯に復元（同IDは上書き） */
export async function importBackup(householdId: string, payload: BackupPayload) {
  const { name, dueDate, birthDate, profile } = payload.household;
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
    (b) => b.update(doc(db, 'households', householdId), {
      name, dueDate, birthDate: birthDate ?? null, ...(profile ? { profile } : {}),
    }),
  ];
  for (const t of payload.tasks) {
    const { id, ...rest } = t;
    ops.push((b) => b.set(doc(db, 'households', householdId, 'tasks', id), rest));
  }
  for (const i of payload.items) {
    const { id, ...rest } = i;
    ops.push((b) => b.set(doc(db, 'households', householdId, 'items', id), rest));
  }
  for (const r of payload.records ?? []) {
    const { id, ...rest } = r;
    ops.push((b) => b.set(doc(db, 'households', householdId, 'records', id), rest));
  }
  await commitInChunks(ops);
}

/** 世帯データ全削除（サブコレクション→本体の順） */
export async function deleteHouseholdData(
  householdId: string, tasks: TaskInstance[], items: PurchaseItem[],
): Promise<void> {
  const records = await loadAllRecords(householdId);
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const t of tasks) ops.push((b) => b.delete(doc(db, 'households', householdId, 'tasks', t.id)));
  for (const i of items) ops.push((b) => b.delete(doc(db, 'households', householdId, 'items', i.id)));
  for (const r of records) ops.push((b) => b.delete(doc(db, 'households', householdId, 'records', r.id)));
  ops.push((b) => b.delete(doc(db, 'households', householdId)));
  await commitInChunks(ops);
}

// ── Care records（Phase 3: 育児記録） ────────────────────────
const RECORDS_PAGE_SIZE = 300;

/** バックアップ・全削除用に記録をページ分割して全件取得 */
export async function loadAllRecords(householdId: string): Promise<CareRecord[]> {
  const recordsRef = collection(db, 'households', householdId, 'records');
  const records = await collectAllPages<CareRecord>(async (cursor) => {
    const pageQuery = cursor === null
      ? query(recordsRef, orderBy(documentId()), limit(RECORDS_PAGE_SIZE))
      : query(
          recordsRef,
          orderBy(documentId()),
          startAfter(cursor),
          limit(RECORDS_PAGE_SIZE),
        );
    const snapshot = await getDocs(pageQuery);
    const lastDocument = snapshot.docs.at(-1);

    return {
      values: snapshot.docs.map((record) => ({
        id: record.id,
        ...(record.data() as Omit<CareRecord, 'id'>),
      })),
      nextCursor: snapshot.size === RECORDS_PAGE_SIZE && lastDocument
        ? lastDocument.id
        : null,
    };
  });

  return records.sort((left, right) => right.at - left.at);
}

/** 画面表示用に直近の記録を購読（新しい順・約1か月分を想定） */
export function watchRecords(householdId: string, cb: (records: CareRecord[]) => void) {
  const q = query(
    collection(db, 'households', householdId, 'records'),
    orderBy('at', 'desc'), limit(1000),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CareRecord, 'id'>) })));
  });
}
export function addRecord(householdId: string, record: Omit<CareRecord, 'id'>) {
  return setDoc(doc(collection(db, 'households', householdId, 'records')), record);
}
export function updateRecord(householdId: string, id: string, patch: Partial<CareRecord>) {
  return updateDoc(doc(db, 'households', householdId, 'records', id), patch);
}
export function replaceRecord(householdId: string, record: CareRecord) {
  const { id, ...data } = record;
  return setDoc(doc(db, 'households', householdId, 'records', id), data);
}
export function removeRecord(householdId: string, id: string) {
  return deleteDoc(doc(db, 'households', householdId, 'records', id));
}
