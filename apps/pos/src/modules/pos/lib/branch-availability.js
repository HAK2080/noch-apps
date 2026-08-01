export function isBranchSelectable(branch) {
  return branch?.is_active !== false
}

export function branchAvailabilityUpdate(isActive) {
  const active = Boolean(isActive)
  return {
    is_active: active,
    operational_status: active ? 'operating' : 'closed',
  }
}
