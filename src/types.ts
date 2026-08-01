export type Trigger =
  | { type: 'week'; week: number }
  | { type: 'beforeDue'; days: number }
  | { type: 'afterBirth'; days: number; countFrom?: 'birthInclusive' | 'nextDay' };

export type TaskCategory = 'procedure' | 'purchase' | 'prep' | 'health' | 'work';
export type Authority = 'koto' | 'tokyo' | 'national' | 'employer' | 'hospital';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'na';
export type Assignee = 'partner1' | 'partner2' | 'both';

export interface TaskTemplate {
  id: string;
  title: string;
  category: TaskCategory;
  authority?: Authority;
  trigger: Trigger;
  deadline?: 'hard' | 'soft';
  prepTasks?: string[];
  links?: { label: string; url: string }[];
  notes?: string;
  conditions?: { field: string; value: unknown }[];
}

export interface TaskInstance {
  id: string;
  templateId?: string;
  title: string;
  category: TaskCategory;
  authority?: Authority;
  trigger: Trigger;
  deadline?: 'hard' | 'soft';
  prepTasks?: string[];
  prepDone?: boolean[];
  links?: { label: string; url: string }[];
  notes?: string;
  status: TaskStatus;
  assignee?: Assignee;
  dueDateResolved: string | null; // YYYY-MM-DD, afterBirthで出生日未確定ならnull
  dueDateOverride?: string;       // 利用者が自動計算より優先して設定した期限
  userMemo?: string;
  createdAt: number;
}

export type PurchaseCategory =
  | 'sleep' | 'feeding' | 'bath' | 'clothing' | 'outing' | 'mom' | 'other';
export type PurchaseMethod = 'buy' | 'rental' | 'handmedown' | 'gift' | 'undecided';

export interface PurchaseItem {
  id: string;
  name: string;
  category: PurchaseCategory;
  neededBy: Trigger;
  method: PurchaseMethod;
  budget?: number;
  actualCost?: number;
  status: 'todo' | 'done' | 'skipped';
  assignee?: Assignee;
  memo?: string;
  userMemo?: string;
  neededByDateOverride?: string; // 家庭の予定に合わせた必要日の上書き（YYYY-MM-DD）
  waitUntilBorn?: boolean; // 産後に様子を見てから買う
}

export type MotherInsurance = 'employee' | 'national' | 'dependent' | 'other';

export interface HouseholdProfile {
  motherTakesLeave: boolean;
  partnerTakesLeave: boolean;
  motherInsurance: MotherInsurance;
  bothParentsLeave?: boolean; // 旧データ読み込み用
  motherIsEmployee?: boolean; // 旧データ読み込み用
}

export interface Household {
  id: string;
  name: string;
  dueDate: string; // YYYY-MM-DD
  birthDate?: string | null;
  memberUids: string[];
  memberNames: Record<string, string>;
  profile?: HouseholdProfile;
}

export type CareRecordType =
  | 'breast_l' | 'breast_r' | 'formula' | 'pump'
  | 'pee' | 'poop' | 'sleep' | 'wake'
  | 'bath' | 'temp' | 'weight' | 'medicine' | 'vaccine' | 'memo';

export interface CareRecord {
  id: string;
  type: CareRecordType;
  at: number;          // epoch ms（記録時刻。あとから編集可能）
  amountMl?: number;   // formula / pump
  durationMin?: number; // breast_l / breast_r
  temperature?: number; // temp（℃）
  weightG?: number;    // weight
  note?: string;
  by?: string;         // 記録者のuid
}
