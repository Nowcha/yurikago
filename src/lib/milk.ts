/** 体重あたりの1日ミルク量の目安（ml/kg/日） */
export const MILK_ML_PER_KG_MIN = 150;
export const MILK_ML_PER_KG_MAX = 200;
export const MILK_FEEDINGS_PER_DAY = 8;

export interface MilkPlan {
  dailyMinMl: number;
  dailyMaxMl: number;
  perFeedMinMl: number;
  perFeedMaxMl: number;
}

/**
 * 体重(kg)から1日のミルク量と、1日 feedings 回で授乳する場合の1回量を求める。
 * 医療的な判断はせず、目安の範囲を機械的に計算するだけ。
 * 体重が有限の正数でなければ null。
 */
export function calcMilkPlan(weightKg: number, feedings = MILK_FEEDINGS_PER_DAY): MilkPlan | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isInteger(feedings) || feedings <= 0) return null;
  const dailyMin = weightKg * MILK_ML_PER_KG_MIN;
  const dailyMax = weightKg * MILK_ML_PER_KG_MAX;
  return {
    dailyMinMl: Math.round(dailyMin),
    dailyMaxMl: Math.round(dailyMax),
    perFeedMinMl: Math.round(dailyMin / feedings),
    perFeedMaxMl: Math.round(dailyMax / feedings),
  };
}
