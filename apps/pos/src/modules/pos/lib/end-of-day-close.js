export function getCashCloseState(actualCash, expectedCash) {
  const raw = String(actualCash ?? '').trim()
  const expected = Number(expectedCash) || 0

  if (raw === '') {
    return {
      isMissing: true,
      isInvalid: false,
      closingCash: 0,
      difference: -expected,
    }
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      isMissing: false,
      isInvalid: true,
      closingCash: 0,
      difference: -expected,
    }
  }

  return {
    isMissing: false,
    isInvalid: false,
    closingCash: parsed,
    difference: parsed - expected,
  }
}
