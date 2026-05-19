import { useEffect } from 'react'

// Loyalty UX (signup, redemption, birthday, drink pick) lives in the
// legacy standalone overlay at /legacy/index.html#loyalty until the SPA
// version is feature-complete. Redirect there so customers don't see a
// regression.
export default function Loyalty() {
  useEffect(() => {
    window.location.replace('/legacy/index.html#loyalty')
  }, [])
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#485070' }}>
      Loading loyalty card…
    </div>
  )
}
