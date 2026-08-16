export const BRANCH_CUSTOMER_STATUSES = [
  { value: 'operating', label: 'Operational' },
  { value: 'pre_opening', label: 'Coming Soon' },
  { value: 'closed', label: 'Hidden' },
]

const VALID_STATUSES = new Set(BRANCH_CUSTOMER_STATUSES.map(option => option.value))

export function getBranchCustomerStatus(branch) {
  if (VALID_STATUSES.has(branch?.operational_status)) return branch.operational_status
  return branch?.is_active === false ? 'closed' : 'operating'
}

export function isBranchSelectable(branch) {
  return branch?.is_active !== false && getBranchCustomerStatus(branch) === 'operating'
}

export function branchCustomerStatusUpdate(status) {
  const operationalStatus = VALID_STATUSES.has(status) ? status : 'closed'
  return {
    is_active: operationalStatus === 'operating',
    operational_status: operationalStatus,
  }
}

export function branchAvailabilityUpdate(isActive) {
  return branchCustomerStatusUpdate(isActive ? 'operating' : 'closed')
}
