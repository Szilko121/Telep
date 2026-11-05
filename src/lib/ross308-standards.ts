// Ross 308 Broiler Growth Standards
// Standard weight targets for broiler chickens (0-56 days)
// Data based on Ross 308 Performance Objectives

export interface Ross308Standard {
  day: number
  targetWeightGrams: number
  feedIntakeGrams: number
  fcr: number // Feed Conversion Ratio
}

// Ross 308 standard growth curve (male broilers)
export const ROSS_308_STANDARDS: Ross308Standard[] = [
  { day: 0, targetWeightGrams: 42, feedIntakeGrams: 0, fcr: 0 },
  { day: 7, targetWeightGrams: 213, feedIntakeGrams: 155, fcr: 0.92 },
  { day: 14, targetWeightGrams: 533, feedIntakeGrams: 495, fcr: 1.1 },
  { day: 21, targetWeightGrams: 1012, feedIntakeGrams: 1065, fcr: 1.22 },
  { day: 28, targetWeightGrams: 1441, feedIntakeGrams: 1845, fcr: 1.28 },
  { day: 35, targetWeightGrams: 2149, feedIntakeGrams: 2865, fcr: 1.33 },
  { day: 42, targetWeightGrams: 2933, feedIntakeGrams: 4095, fcr: 1.4 },
  { day: 49, targetWeightGrams: 3732, feedIntakeGrams: 5520, fcr: 1.48 },
  { day: 56, targetWeightGrams: 4530, feedIntakeGrams: 7125, fcr: 1.57 },
]

/**
 * Get Ross 308 target weight for a specific day
 * Uses linear interpolation for days between standard measurements
 */
export function getRoss308TargetWeight(dayOfAge: number): number {
  if (dayOfAge < 0) return 0
  if (dayOfAge > 56) {
    // Extrapolate beyond 56 days using the last growth rate
    const lastTwo = ROSS_308_STANDARDS.slice(-2)
    const dailyGrowth = (lastTwo[1].targetWeightGrams - lastTwo[0].targetWeightGrams) / 7
    return lastTwo[1].targetWeightGrams + dailyGrowth * (dayOfAge - 56)
  }

  // Find the two closest standard points
  const exactMatch = ROSS_308_STANDARDS.find((s) => s.day === dayOfAge)
  if (exactMatch) return exactMatch.targetWeightGrams

  // Linear interpolation
  for (let i = 0; i < ROSS_308_STANDARDS.length - 1; i++) {
    const current = ROSS_308_STANDARDS[i]
    const next = ROSS_308_STANDARDS[i + 1]

    if (dayOfAge > current.day && dayOfAge < next.day) {
      const ratio = (dayOfAge - current.day) / (next.day - current.day)
      return current.targetWeightGrams + ratio * (next.targetWeightGrams - current.targetWeightGrams)
    }
  }

  return ROSS_308_STANDARDS[0].targetWeightGrams
}

/**
 * Calculate performance percentage compared to Ross 308 standard
 */
export function calculatePerformancePercentage(actualWeightGrams: number, dayOfAge: number): number {
  const target = getRoss308TargetWeight(dayOfAge)
  if (target === 0) return 0
  return Number(((actualWeightGrams / target) * 100).toFixed(1))
}

/**
 * Get performance status based on percentage
 */
export function getPerformanceStatus(percentage: number): {
  status: "excellent" | "good" | "acceptable" | "below-target" | "poor"
  color: string
  label: string
} {
  if (percentage >= 105) return { status: "excellent", color: "text-green-600", label: "Kiváló" }
  if (percentage >= 98) return { status: "good", color: "text-blue-600", label: "Jó" }
  if (percentage >= 92) return { status: "acceptable", color: "text-yellow-600", label: "Elfogadható" }
  if (percentage >= 85) return { status: "below-target", color: "text-orange-600", label: "Cél alatt" }
  return { status: "poor", color: "text-red-600", label: "Gyenge" }
}

/**
 * Convert grams to kilograms with proper formatting
 */
export function gramsToKg(grams: number): string {
  return (grams / 1000).toFixed(3)
}
