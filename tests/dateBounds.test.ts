import { describe, it, expect } from 'vitest';
import { dueDateBounds, birthDateBounds, taskDateBounds } from '../src/lib/dateBounds';

describe('dateBounds', () => {
  it('出産予定日は今日の前後1年を許容する', () => {
    // Arrange
    const today = '2026-08-09';

    // Act
    const bounds = dueDateBounds(today);

    // Assert
    expect(bounds.min).toBe('2025-08-09');
    expect(bounds.max).toBe('2027-08-09');
  });

  it('出生日は未来を許容しない', () => {
    const today = '2026-08-09';

    const bounds = birthDateBounds(today);

    expect(bounds.max).toBe(today);
    expect(bounds.min).toBe('2025-08-09');
  });

  it('タスクの期限は前後2年を許容する', () => {
    const today = '2026-08-09';

    const bounds = taskDateBounds(today);

    expect(bounds.min).toBe('2024-08-09');
    // 2028-02-29 が区間に入るため、上限だけ1日手前になる
    expect(bounds.max).toBe('2028-08-08');
  });

  it('うるう日をまたいでも境界が破綻しない', () => {
    const bounds = dueDateBounds('2028-02-29');

    expect(bounds.min).toBe('2027-03-01');
    expect(bounds.max).toBe('2029-02-28');
  });
});
