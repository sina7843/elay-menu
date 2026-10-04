import { describe, expect, it } from 'vitest';
import {
  ChangePasswordInputSchema,
  DiscountSchema,
  FoodInputSchema,
  NewPasswordSchema,
  WeeklyScheduleSchema,
  discountedPrice,
} from './index.js';

describe('discountedPrice', () => {
  it('rounds to the nearest 1000 Toman (handoff examples)', () => {
    expect(discountedPrice(890_000, 20)).toBe(712_000);
    expect(discountedPrice(425_000, 15)).toBe(361_000);
    expect(discountedPrice(480_000, 10)).toBe(432_000);
    expect(discountedPrice(170_000, 15)).toBe(145_000); // 144,500 rounds half up
  });
  it('rejects out-of-range input', () => {
    expect(() => discountedPrice(100_000, 0)).toThrow(RangeError);
    expect(() => discountedPrice(100_000, 91)).toThrow(RangeError);
    expect(() => discountedPrice(-1, 10)).toThrow(RangeError);
    expect(() => discountedPrice(10.5, 10)).toThrow(RangeError);
  });
});

describe('schemas', () => {
  const day = { closed: false, open: '18:00', close: '02:00' };
  it('accepts overnight and 24:00 schedules, rejects malformed', () => {
    expect(WeeklyScheduleSchema.safeParse(Array(7).fill(day)).success).toBe(true);
    expect(WeeklyScheduleSchema.safeParse(Array(7).fill({ closed: false, open: '00:00', close: '24:00' })).success).toBe(true);
    expect(WeeklyScheduleSchema.safeParse(Array(6).fill(day)).success).toBe(false);
    expect(WeeklyScheduleSchema.safeParse(Array(7).fill({ ...day, open: '24:00' })).success).toBe(false);
    expect(WeeklyScheduleSchema.safeParse(Array(7).fill({ ...day, close: '18:00' })).success).toBe(false);
  });
  it('validates discount bounds and date order', () => {
    expect(DiscountSchema.safeParse({ percent: 90, startDate: '2026-10-01', endDate: '2026-10-01' }).success).toBe(true);
    expect(DiscountSchema.safeParse({ percent: 91, startDate: '2026-10-01', endDate: '2026-10-02' }).success).toBe(false);
    expect(DiscountSchema.safeParse({ percent: 10, startDate: '2026-10-03', endDate: '2026-10-02' }).success).toBe(false);
  });
  it('rejects unknown fields (strict)', () => {
    const food = {
      name: 'پیتزا', description: '', price: 1000, image: null, tint: 'food-tint-1',
      categoryId: 'a'.repeat(24), stallCategoryId: 'b'.repeat(24), available: true, discount: null,
    };
    expect(FoodInputSchema.safeParse(food).success).toBe(true);
    expect(FoodInputSchema.safeParse({ ...food, size: 'L' }).success).toBe(false);
    expect(FoodInputSchema.safeParse({ ...food, price: 1.5 }).success).toBe(false);
  });
  it('enforces password policy and confirmation', () => {
    expect(NewPasswordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(NewPasswordSchema.safeParse('abc12').success).toBe(false);
    expect(NewPasswordSchema.safeParse('abcdefg1').success).toBe(true);
    expect(ChangePasswordInputSchema.safeParse({ currentPassword: 'x', newPassword: 'abcdefg1', confirmPassword: 'abcdefg2' }).success).toBe(false);
  });
});
