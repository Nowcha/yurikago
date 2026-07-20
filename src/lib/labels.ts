import type { Assignee, Household, TaskCategory } from '../types';

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  procedure: '手続き', purchase: '購入', prep: '準備', health: '健康', work: '会社',
};

export const AUTHORITY_LABEL: Record<string, string> = {
  koto: '江東区', tokyo: '東京都', national: '国', employer: '会社', hospital: '産院',
};

/** 担当キー→表示名（メンバー名はHouseholdから解決） */
export function assigneeLabel(assignee: Assignee | 'none', household: Household): string {
  const [u1, u2] = household.memberUids;
  switch (assignee) {
    case 'partner1': return household.memberNames[u1] ?? 'メンバー1';
    case 'partner2': return household.memberNames[u2] ?? 'メンバー2';
    case 'both': return 'ふたり';
    case 'none': return '担当未定';
  }
}
