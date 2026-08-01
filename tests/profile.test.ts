import { describe, expect, it } from 'vitest';
import { normalizeHouseholdProfile } from '../src/lib/profile';

describe('normalizeHouseholdProfile', () => {
  it('旧形式の夫婦育休・会社員設定を新形式へ読み替える', () => {
    expect(normalizeHouseholdProfile({
      bothParentsLeave: true,
      motherIsEmployee: true,
    })).toEqual({
      motherTakesLeave: true,
      partnerTakesLeave: true,
      motherInsurance: 'employee',
    });
  });

  it('旧形式で会社員ではない場合は保険区分を決めつけない', () => {
    expect(normalizeHouseholdProfile({
      bothParentsLeave: false,
      motherIsEmployee: false,
    })).toEqual({
      motherTakesLeave: false,
      partnerTakesLeave: false,
      motherInsurance: 'other',
    });
  });

  it('新形式の個別設定をそのまま保持する', () => {
    expect(normalizeHouseholdProfile({
      motherTakesLeave: true,
      partnerTakesLeave: false,
      motherInsurance: 'national',
    })).toEqual({
      motherTakesLeave: true,
      partnerTakesLeave: false,
      motherInsurance: 'national',
    });
  });
});
