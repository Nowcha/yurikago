import type { HouseholdProfile, MotherInsurance } from '../types';

export const DEFAULT_HOUSEHOLD_PROFILE: HouseholdProfile = {
  motherTakesLeave: true,
  partnerTakesLeave: true,
  motherInsurance: 'employee',
};

/** 旧プロファイルを読み替え、新しい条件モデルへ統一する */
export function normalizeHouseholdProfile(
  profile: Partial<HouseholdProfile> | null | undefined,
): HouseholdProfile {
  const legacyBothLeave = profile?.bothParentsLeave ?? true;
  const legacyInsurance: MotherInsurance = profile?.motherIsEmployee === false
    ? 'other'
    : 'employee';
  return {
    // 旧falseは「片方のみ」と「双方なし」を区別できないため、見落とし防止を優先する。
    motherTakesLeave: profile?.motherTakesLeave ?? true,
    partnerTakesLeave: profile?.partnerTakesLeave ?? legacyBothLeave,
    motherInsurance: profile?.motherInsurance ?? legacyInsurance,
  };
}
