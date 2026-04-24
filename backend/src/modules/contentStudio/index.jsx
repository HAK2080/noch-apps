import { Routes, Route } from 'react-router-dom'
import StudioShell from './components/StudioShell'
import Overview from './pages/Overview'
import Businesses from './pages/Businesses'
import BusinessNew from './pages/BusinessNew'
import BusinessDetail from './pages/BusinessDetail'
import Inspiration from './pages/Inspiration'
import InspirationDetail from './pages/InspirationDetail'
import Concepts from './pages/Concepts'
import ConceptWorkbench from './pages/ConceptWorkbench'
import Drafts from './pages/Drafts'
import VoiceLab from './pages/VoiceLab'
import ContentBank from './pages/ContentBank'
import Settings from './pages/Settings'

/**
 * Mount at <Route path="/content-studio/*" element={<ContentStudio />}/>.
 * Sub-routes are scoped to the StudioShell layout (sub-nav + business selector).
 */
export default function ContentStudio() {
  return (
    <Routes>
      <Route element={<StudioShell />}>
        <Route index element={<Overview />} />
        <Route path="businesses" element={<Businesses />} />
        <Route path="businesses/new" element={<BusinessNew />} />
        <Route path="businesses/:businessId" element={<BusinessDetail />} />
        <Route path="inspiration" element={<Inspiration />} />
        <Route path="inspiration/:id" element={<InspirationDetail />} />
        <Route path="concepts" element={<Concepts />} />
        <Route path="concepts/:id" element={<ConceptWorkbench />} />
        <Route path="drafts" element={<Drafts />} />
        <Route path="voice-lab" element={<VoiceLab />} />
        <Route path="bank" element={<ContentBank />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
