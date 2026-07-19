import { useEffect } from 'react'
import BusinessRangePicker, { DEFAULT_BUSINESS_PRESETS, businessPresetRange, localYmd } from '../../../components/shared/BusinessRangePicker'

export default function PeriodSelector({ value, onChange, defaultPreset = '7d', labels = {}, rangeOverrides = {} }) {
  const initialRange = rangeOverrides[defaultPreset] || businessPresetRange(defaultPreset)
  const current = value || { preset: defaultPreset, from: localYmd(initialRange.from), to: localYmd(initialRange.to) }
  useEffect(() => {
    if (!value) onChange?.(current)
  // Seed consumers that intentionally start with a null range.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <BusinessRangePicker
      value={current}
      onChange={onChange}
      presets={DEFAULT_BUSINESS_PRESETS}
      labels={labels}
      resolveRange={preset => rangeOverrides[preset] || businessPresetRange(preset)}
    />
  )
}
