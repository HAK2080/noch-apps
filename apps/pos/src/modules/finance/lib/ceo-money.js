import { supabase } from '../../../lib/supabase'

export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function monthToDate(now = new Date()) {
  const to = businessToday(now)
  return { from: `${to.slice(0, 7)}-01`, to }
}

export async function getCEOMoney(from, to) {
  const { data, error } = await supabase.rpc('ceo_money_overview', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

export async function saveCEOBalances({ date, cash, bank, notes }) {
  const { error } = await supabase.rpc('save_ceo_balances', {
    p_as_of: date, p_cash: Number(cash), p_bank: Number(bank), p_notes: notes || null,
  })
  if (error) throw error
}
