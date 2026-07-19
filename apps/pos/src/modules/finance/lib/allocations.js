import { supabase } from '../../../lib/supabase'

export function calculateAllocationPreview(branches, method) {
  const selected = branches.filter(branch => branch.selected)
  if (!selected.length) return branches.map(branch => ({ ...branch, sharePct: 0 }))

  const totalRevenue = selected.reduce((sum, branch) => sum + Number(branch.revenueLyd || 0), 0)
  return branches.map(branch => {
    if (!branch.selected) return { ...branch, sharePct: 0 }
    if (method === 'fixed') return { ...branch, sharePct: Number(branch.weightPct || 0) }
    if (method === 'equal' || totalRevenue <= 0) {
      return { ...branch, sharePct: 100 / selected.length }
    }
    return { ...branch, sharePct: Number(branch.revenueLyd || 0) / totalRevenue * 100 }
  })
}

export async function getSharedCostAllocationSetup({ costCenterId = 'SHARED', asOfDate }) {
  const [costCenterResult, policyResult, basisResult, historyResult] = await Promise.all([
    supabase.from('cost_centers').select('id,name,scope').eq('id', costCenterId).single(),
    supabase
      .from('shared_cost_allocation_policies')
      .select('*')
      .eq('source_cost_center_id', costCenterId)
      .lte('effective_from', asOfDate)
      .or(`effective_to.is.null,effective_to.gte.${asOfDate}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc('finance_allocation_basis', { p_as_of_date: asOfDate }),
    supabase
      .from('shared_cost_allocation_policies')
      .select('id,method,effective_from,effective_to')
      .eq('source_cost_center_id', costCenterId)
      .order('effective_from', { ascending: false }),
  ])

  if (costCenterResult.error) throw costCenterResult.error
  if (policyResult.error) throw policyResult.error
  if (basisResult.error) throw basisResult.error
  if (historyResult.error) throw historyResult.error

  const policy = policyResult.data
  let targets = []
  if (policy?.id) {
    const { data, error } = await supabase
      .from('shared_cost_allocation_targets')
      .select('branch_id,fixed_weight_pct')
      .eq('policy_id', policy.id)
    if (error) throw error
    targets = data || []
  }
  const targetByBranch = new Map(targets.map(target => [target.branch_id, target]))

  return {
    costCenter: costCenterResult.data,
    policy,
    history: historyResult.data || [],
    branches: (basisResult.data || []).map(branch => {
      const target = targetByBranch.get(branch.branch_id)
      return {
        id: branch.branch_id,
        name: branch.branch_name,
        revenueLyd: Number(branch.revenue_lyd || 0),
        selected: policy ? !!target : true,
        weightPct: target?.fixed_weight_pct == null ? 0 : Number(target.fixed_weight_pct),
      }
    }),
  }
}

export async function saveSharedCostAllocationPolicy({
  costCenterId = 'SHARED', method, effectiveFrom, branches,
}) {
  const targets = branches
    .filter(branch => branch.selected)
    .map(branch => ({
      branch_id: branch.id,
      weight_pct: method === 'fixed' ? Number(branch.weightPct || 0) : null,
    }))

  const { data, error } = await supabase.rpc('save_shared_cost_allocation_policy', {
    p_source_cost_center_id: costCenterId,
    p_method: method,
    p_effective_from: effectiveFrom,
    p_targets: targets,
  })
  if (error) throw error
  return data
}
