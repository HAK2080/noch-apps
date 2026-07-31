export function reconcileExecutiveSummary(total = {}, branches = [], tolerance = 0.01) {
  const sum = key => branches.reduce((value, branch) => value + Number(branch[key] || 0), 0)
  const comparisons = [
    ['netSales', 'revenue'],
    ['productCosts', 'cogs'],
    ['staffCosts', 'laborTotal'],
    ['operatingExpenses', 'opexTotal'],
    ['sharedOperatingCosts', 'sharedCosts'],
    ['fullyLoadedOperatingProfit', 'net'],
  ].map(([id, key]) => {
    const consolidated = Number(total[key] || 0)
    const branchTotal = sum(key)
    return {
      id,
      consolidated,
      branchTotal,
      delta: consolidated - branchTotal,
    }
  })
  const material = comparisons.filter(row => Math.abs(row.delta) > tolerance)

  return {
    status: material.length ? 'warning' : 'reconciled',
    tolerance,
    comparisons,
    material,
  }
}
