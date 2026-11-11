// Weight forecasts use the exact Ross curve already present on the Weights screen.
// Weight units throughout this module are kilograms.
export const ROSS308_STD: Record<number, number> = {
  0: 0.042, 
  1: 0.058, 2: 0.076, 3: 0.097, 4: 0.120, 5: 0.146, 6: 0.174, 7: 0.202,
  8: 0.238, 9: 0.278, 10: 0.322, 11: 0.368, 12: 0.417, 13: 0.467, 14: 0.520,
  15: 0.579, 16: 0.642, 17: 0.708, 18: 0.778, 19: 0.852, 20: 0.931, 21: 1.015,
  22: 1.102, 23: 1.192, 24: 1.285, 25: 1.381, 26: 1.480, 27: 1.581, 28: 1.685,
  29: 1.793, 30: 1.904, 31: 2.019, 32: 2.137, 33: 2.258, 34: 2.382, 35: 2.508,
  36: 2.636, 37: 2.766, 38: 2.897, 39: 3.029, 40: 3.161, 41: 3.293, 42: 3.424,
  43: 3.556, 44: 3.689, 45: 3.823, 46: 3.958, 47: 4.094, 48: 4.231, 49: 4.368
};

/** Interpolate linearly between the Ross daily weight reference points.
 * Fractional ages represent the fraction of a day after 00:00.
 */
export function getRossTarget(ageInDays: number): number {
  if (!Number.isFinite(ageInDays)) return NaN;
  if (ageInDays <= 0) return ROSS308_STD[0];
  if (ageInDays >= 49) return ROSS308_STD[49] + (ageInDays - 49) * 0.138;

  const wholeDays = Math.floor(ageInDays);
  const fraction = ageInDays - wholeDays;
  const today = ROSS308_STD[wholeDays];
  const tomorrow = ROSS308_STD[wholeDays + 1];
  return today + fraction * (tomorrow - today);
}

/** The recorded day-age plus the measurement's local time of day.
 * For a truly exact biological age, placement / hatch time must also be known.
 */
export function fractionalAgeAtTime(ageInWholeDays: number, clockTime: string): number {
  const match = /^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(clockTime);
  if (!Number.isInteger(ageInWholeDays) || ageInWholeDays < 0 || !match) return NaN;
  return ageInWholeDays + (Number(match[1]) * 60 + Number(match[2])) / 1440;
}

/** Forecast a bird's weight at a specific day and clock time.
 * Calibrate the Ross curve to the previous measured average; the target time
 * is interpolated within the target day rather than rounded to midnight.
 * Never use a subsequent actual measurement to forecast an earlier time.
 */
export function predictWeightAtTime(
  measuredWeightKg: number,
  measuredAgeDays: number,
  measuredClockTime: string,
  targetAgeDays: number,
  targetClockTime: string,
): number {
  if (!Number.isFinite(measuredWeightKg) || measuredWeightKg <= 0) return NaN;
  const measuredAge = fractionalAgeAtTime(measuredAgeDays, measuredClockTime);
  const targetAge = fractionalAgeAtTime(targetAgeDays, targetClockTime);
  if (!Number.isFinite(measuredAge) || !Number.isFinite(targetAge) || targetAge < measuredAge) return NaN;
  const measuredStandard = getRossTarget(measuredAge);
  if (measuredStandard <= 0) return NaN;
  return measuredWeightKg * getRossTarget(targetAge) / measuredStandard;
}
