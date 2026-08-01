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
    motherTakesLeave: profile?.motherTakesLeave ?? legacyBothLeave,
    partnerTakesLeave: profile?.partnerTakesLeave ?? legacyBothLeave,
    motherInsurance: profile?.motherInsurance ?? legacyInsurance,
  };
}
