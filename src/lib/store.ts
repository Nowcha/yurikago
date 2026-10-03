import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, onSnapshot, writeBatch, updateDoc, setDoc,
  arrayUnion, arrayRemove, deleteDoc, deleteField, orderBy, limit, getDocs, documentId, startAfter,
  type Unsubscribe, type FirestoreError,
} from 'firebase/firestore';
import type {
  Household, HouseholdProfile, TaskInstance, TaskTemplate, PurchaseItem, PurchaseCategory,
  PurchaseMethod, CareRecord,
} from '../types';
import { resolveDueDate } from './deadline';
import procedureMaster from '../data/procedure-master.json';
import purchaseMaster from '../data/purchase-master.json';
import { collectAllPages } from './pagination';
import { DEFAULT_HOUSEHOLD_PROFILE, normalizeHouseholdProfile } from './profile';

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
/** ホーム画面から起動したPWAか（iOSはnavigator.standaloneでしか判定できない） */
function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function popupUnavailable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  if (code === 'auth/popup-blocked') return true;
  if (code === 'auth/operation-not-supported-in-this-environment') return true;
  // standaloneではポップアップが開いた直後に死ぬことがあり、自分で閉じた場合と
  // 同じコードになる。通常のブラウザでは意図的な操作なのでリダイレクトしない
  return code === 'auth/popup-closed-by-user' && isStandaloneApp();
}

/**
 * ポップアップを優先し、使えない環境でだけリダイレクトへ落とす。
 * standaloneでも先にポップアップを試すのは、iOS 16.4以降は成功する場合があり、
 * 動く経路をこちらから壊さないため。
 */
export async function login(): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error: unknown) {
    if (!popupUnavailable(error)) throw error;
    await signInWithRedirect(auth, provider);
  }
}

/**
 * リダイレクト経由のログイン結果を回収する。
 * 成功はonAuthStateChangedが拾うが、失敗はここでしか観測できない。
 * 呼ばないとリダイレクトで失敗したとき無言でログイン画面に戻る。
 */
export function consumeRedirectResult(): Promise<unknown> {
  return getRedirectResult(auth);
}
export function logout() {
  return signOut(auth);
}

// ── Household ────────────────────────────────────────────────
/**
 * 購読の失敗ハンドラ。省略するとonSnapshotは無音で止まり、
 * 呼び出し側は「読み込み中」から永久に抜けられなくなるため必須扱いにする
 */
export type WatchErrorHandler = (error: FirestoreError) => void;

/**
 * 同期の実態。オフラインキャッシュがあるとonSnapshotは通信断でもエラーを出さず
 * 古い結果を配り続けるため、「サーバー由来か」「未送信の書き込みがあるか」を明示する
 */
export interface SyncState {
  /** サーバーではなくローカルキャッシュから配信された = サーバーに到達できていない */
  fromCache: boolean;
  /** ローカルにのみ存在しサーバーが未受理の書き込みがある */
  hasPendingWrites: boolean;
}

function toSync(snap: { metadata: { fromCache: boolean; hasPendingWrites: boolean } }): SyncState {
  return { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites };
}

export function watchMyHousehold(
  uid: string,
  cb: (h: Household | null, sync: SyncState) => void,
  onError: WatchErrorHandler,
) {
  const q = query(collection(db, 'households'), where('memberUids', 'array-contains', uid));
  // includeMetadataChanges: 接続状態の変化だけでも通知させる（データが変わらない待機中に必要）
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const sync = toSync(snap);
    if (snap.empty) return cb(null, sync);
    const d = snap.docs[0];
    cb({ id: d.id, ...(d.data() as Omit<Household, 'id'>) }, sync);
  }, onError);
}

/** テンプレートのconditionsをプロファイルで評価。未知の条件は通す（安全側=タスクを出す） */
function matchesProfile(
  conditions: TaskTemplate['conditions'], profile: HouseholdProfile,
): boolean {
  if (!conditions) return true;
  const normalized = normalizeHouseholdProfile(profile);
  return conditions.every((c) => {
    if (c.field === 'hasChildcareLeave' || c.field === 'eitherParentTakesLeave') {
      return (normalized.motherTakesLeave || normalized.partnerTakesLeave) === c.value;
    }
    if (c.field === 'motherTakesLeave') return normalized.motherTakesLeave === c.value;
    if (c.field === 'partnerTakesLeave') return normalized.partnerTakesLeave === c.value;
    if (c.field === 'bothParentsLeave') {
      return (normalized.motherTakesLeave && normalized.partnerTakesLeave) === c.value;
    }
    if (c.field === 'motherInsurance') return normalized.motherInsurance === c.value;
    if (c.field === 'role' && c.value === 'mother-employee') {
      return normalized.motherInsurance === 'employee';
    }
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

/** Firebase AuthのUIDは28文字の英数字。貼り付けミス・改行混入を弾く */
const UID_PATTERN = /^[A-Za-z0-9]{28}$/;

export function isValidUid(uid: string): boolean {
  return UID_PATTERN.test(uid);
}

/** 母乳の推定量（授乳1分あたりのml）。二人の画面で同じ値を使うため世帯ドキュメントに持つ */
export function setBreastMlPerMin(householdId: string, value: number) {
  return updateDoc(doc(db, 'households', householdId), { breastMlPerMin: value });
}

/** パートナー追加（UID登録方式、firestore.rules参照） */
export function addPartner(householdId: string, partnerUid: string, partnerName: string) {
  return updateDoc(doc(db, 'households', householdId), {
    memberUids: arrayUnion(partnerUid),
    [`memberNames.${partnerUid}`]: partnerName,
  });
}

/**
 * 誤ったUIDを登録すると memberUids が2件になり追加フォームが消えて詰むため、
 * 取り消し口を必ず用意する。自分自身は消せない（rulesのupdate条件を満たせなくなる）
 */
export function removePartner(householdId: string, partnerUid: string) {
  return updateDoc(doc(db, 'households', householdId), {
    memberUids: arrayRemove(partnerUid),
    [`memberNames.${partnerUid}`]: deleteField(),
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
export function watchTasks(
  householdId: string,
  cb: (tasks: TaskInstance[], sync: SyncState) => void,
  onError: WatchErrorHandler,
) {
  return onSnapshot(
    collection(db, 'households', householdId, 'tasks'),
    { includeMetadataChanges: true },
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskInstance, 'id'>) })), toSync(snap));
    },
    onError,
  );
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
/** 削除の取り消し用。addTaskは新しいIDを採番してしまうので同じIDで書き戻す */
export function restoreTask(householdId: string, task: TaskInstance) {
  const { id, ...data } = task;
  return setDoc(doc(db, 'households', householdId, 'tasks', id), data);
}

// ── Purchase items ───────────────────────────────────────────
export function watchItems(
  householdId: string,
  cb: (items: PurchaseItem[], sync: SyncState) => void,
  onError: WatchErrorHandler,
) {
  return onSnapshot(
    collection(db, 'households', householdId, 'items'),
    { includeMetadataChanges: true },
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PurchaseItem, 'id'>) })), toSync(snap));
    },
    onError,
  );
}
export function updateItem(householdId: string, itemId: string, patch: Partial<PurchaseItem>) {
  return updateDoc(doc(db, 'households', householdId, 'items', itemId), patch);
}
export function addItem(householdId: string, item: Omit<PurchaseItem, 'id'>) {
  return setDoc(doc(collection(db, 'households', householdId, 'items')), item);
}
export interface PurchaseItemDetailsInput {
  name: string;
  category: PurchaseCategory;
  method: PurchaseMethod;
  budget: number | null;
  actualCost: number | null;
  neededByDateOverride: string | null;
  userMemo: string;
}
export function updateItemDetails(
  householdId: string,
  itemId: string,
  input: PurchaseItemDetailsInput,
): Promise<void> {
  return updateDoc(doc(db, 'households', householdId, 'items', itemId), {
    name: input.name,
    category: input.category,
    method: input.method,
    budget: input.budget ?? deleteField(),
    actualCost: input.actualCost ?? deleteField(),
    neededByDateOverride: input.neededByDateOverride ?? deleteField(),
    userMemo: input.userMemo.trim() || deleteField(),
  });
}
/** 担当の解除。Firestoreはundefinedを拒否するためdeleteField()でフィールドごと消す */
export function clearItemAssignee(householdId: string, itemId: string) {
  return updateDoc(doc(db, 'households', householdId, 'items', itemId), {
    assignee: deleteField(),
  });
}
export function removeItem(householdId: string, itemId: string): Promise<void> {
  return deleteDoc(doc(db, 'households', householdId, 'items', itemId));
}
/** 削除の取り消し用。restoreTaskと同じ理由で同じIDに書き戻す */
export function restoreItem(householdId: string, item: PurchaseItem): Promise<void> {
  const { id, ...data } = item;
  return setDoc(doc(db, 'households', householdId, 'items', id), data);
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
  const profile = household.profile ?? DEFAULT_HOUSEHOLD_PROFILE;
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

/**
 * 世帯データ全削除（サブコレクション→本体の順）。
 * 本体は物理削除せず墓標にする。firestore.rules のコメントを参照。
 */
export async function deleteHouseholdData(
  householdId: string, tasks: TaskInstance[], items: PurchaseItem[],
): Promise<void> {
  const { records, fromCache } = await loadAllRecords(householdId);
  // キャッシュだけで消すと、読めていない記録が消し残る。本体が墓標になれば
  // その記録には二度と手が届かず、サーバー上に永久に残る（バックアップと同じ理由で中止する）
  if (fromCache) throw new Error('delete-needs-server');
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const t of tasks) ops.push((b) => b.delete(doc(db, 'households', householdId, 'tasks', t.id)));
  for (const i of items) ops.push((b) => b.delete(doc(db, 'households', householdId, 'items', i.id)));
  for (const r of records) ops.push((b) => b.delete(doc(db, 'households', householdId, 'records', r.id)));
  // update()ではなくset()。マージだとname/dueDate/memberNamesが墓標に残ってしまう
  ops.push((b) => b.set(doc(db, 'households', householdId), {
    memberUids: [],
    deletedAt: new Date().toISOString(),
  }));
  await commitInChunks(ops);
}

// ── Care records（Phase 3: 育児記録） ────────────────────────
const RECORDS_PAGE_SIZE = 300;

/** バックアップ・全削除用に記録をページ分割して全件取得 */
export interface AllRecordsResult {
  records: CareRecord[];
  /** サーバーではなくキャッシュから読んだ = 一部が欠けている可能性がある */
  fromCache: boolean;
}

export async function loadAllRecords(householdId: string): Promise<AllRecordsResult> {
  const recordsRef = collection(db, 'households', householdId, 'records');
  let fromCache = false;
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
    if (snapshot.metadata.fromCache) fromCache = true;
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

  return { records: records.sort((left, right) => right.at - left.at), fromCache };
}

/** 画面表示用に直近の記録を購読（新しい順・約1か月分を想定） */
export function watchRecords(
  householdId: string,
  cb: (records: CareRecord[], sync: SyncState) => void,
  onError: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'households', householdId, 'records'),
    orderBy('at', 'desc'), limit(1000),
  );
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CareRecord, 'id'>) })), toSync(snap));
  }, onError);
}
/** 選択日と前日の記録を件数制限なしで購読する。前日分は日またぎ睡眠の集計に使う。 */
export function watchRecordsForDay(
  householdId: string,
  day: string,
  cb: (records: CareRecord[]) => void,
  onError: () => void,
): Unsubscribe {
  const startDate = new Date(`${day}T00:00:00`);
  const contextStartDate = new Date(startDate);
  contextStartDate.setDate(contextStartDate.getDate() - 1);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  const dayQuery = query(
    collection(db, 'households', householdId, 'records'),
    where('at', '>=', contextStartDate.getTime()),
    where('at', '<', endDate.getTime()),
    orderBy('at', 'desc'),
  );
  return onSnapshot(
    dayQuery,
    (snapshot) => cb(snapshot.docs.map((record) => ({
      id: record.id,
      ...(record.data() as Omit<CareRecord, 'id'>),
    }))),
    onError,
  );
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
