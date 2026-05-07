# packages/shared

Reserved for things that need to live in **both** apps:

- Brand assets (logos, mascot SVGs, fonts, photos)
- Design tokens (palette, spacing, typography)
- Lightweight utilities (e.g. `formatLYD`, GPS / haversine helpers)
- Shared React components (e.g. `<NochiAvatar>`, `<LangToggle>`) once one is needed in both

Currently empty by design. Today the storefront and the pos app each
have their own copy of the brand assets they need. Migrate things in
here only when duplication causes drift, not pre-emptively.

How to consume:

```js
// from apps/pos/src/something.jsx or apps/storefront/src/something.jsx
import { formatLYD } from '../../../packages/shared/format'
```

…or, when the time comes, add a workspace alias to each app's
`vite.config.js` so the import becomes `@noch/shared/format`.
