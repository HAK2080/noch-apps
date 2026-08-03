const nonNegativeInteger = value => Math.max(0, Math.floor(Number(value) || 0))

export function convertLegacyValue({
  existingPoints,
  currentStamps,
  legacyStampGoal,
  rewardPoints,
}) {
  const safeExistingPoints = nonNegativeInteger(existingPoints)
  const safeCurrentStamps = nonNegativeInteger(currentStamps)
  const safeStampGoal = nonNegativeInteger(legacyStampGoal)
  const safeRewardPoints = nonNegativeInteger(rewardPoints)
  const convertedStampPoints = safeStampGoal > 0 && safeRewardPoints > 0
    ? Math.ceil((Math.min(safeCurrentStamps, safeStampGoal) / safeStampGoal) * safeRewardPoints)
    : 0

  return {
    existingPoints: safeExistingPoints,
    convertedStampPoints,
    openingPoints: safeExistingPoints + convertedStampPoints,
  }
}
