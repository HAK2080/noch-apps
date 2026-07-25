# Agent Coordination Protocol

**Last Updated**: 2026-07-25  
**Active Workspace**: `Jul 26 release`

## Workflow: Check Before Build

Every agent (Claude/GitHub Copilot, Codex, or others) **MUST** follow this protocol:

### 1. **RECEIVE REQUEST**
   - Agent receives a task/change request from the user
   - Do NOT start work yet

### 2. **CHECK EXISTING WORK**
   - Search `COMPLETED_WORK.md` for related changes
   - Grep the codebase for recent modifications matching the request
   - Check git log for recent commits matching the intent
   - **If found**: Verify if it's complete or if it needs refinement
   - **If not found**: Proceed to build

### 3. **DECISION**
   - ✅ **Already complete & correct**: Report to user ("Already done on [date] by [agent]")
   - ✅ **Needs refinement/fixes**: Update existing code with improvements
   - ⚠️ **Incomplete or broken**: Complete the work
   - ❌ **Not found**: Build the feature

### 4. **AFTER COMPLETION**
   - Update `COMPLETED_WORK.md` with:
     - Date completed
     - Agent name
     - File(s) modified
     - Brief description
     - Git commit hash (if applicable)

---

## Check Checklist

Before building anything, verify:

- [ ] Search `COMPLETED_WORK.md` for matching keywords
- [ ] Run relevant grep patterns to find related code
- [ ] Check git log for similar commits in the last 7 days
- [ ] Review file modification timestamps in the target module
- [ ] Read comments in the code for agent attribution

---

## Example Entry in COMPLETED_WORK.md

```markdown
### Finance Dashboard UI Refinement
- **Date**: 2026-07-24
- **Agent**: Codex
- **Status**: Complete
- **Files**: 
  - apps/pos/src/modules/finance/components/FinanceBreakdownModal.jsx
  - apps/pos/src/modules/finance/lib/calculations.js
- **Description**: Added branch-level expense allocation + pre-opening status
- **Commit**: 13c4190
- **Notes**: Includes 20+ migrations; verify RLS policies tested
```

---

## Conflict Resolution

If both agents work on overlapping areas:
1. **Check AGENT_COORDINATION.md** for declared ownership
2. **Review git blame** on conflicting files
3. **Inspect both implementations** before merging
4. **Prefer the more complete/tested version** or merge both
5. **Update COMPLETED_WORK.md** with the resolution

---

## Reserved Areas (Declare Ownership if Needed)

When an agent is actively working on a major feature, add an entry below:

| Module | Owner | Started | Estimated End |
|--------|-------|---------|---|
| Content Studio evaluator release | Codex | 2026-07-25 | 2026-07-25 |
| (none yet) | — | — | — |

---

## Guidelines

- ✅ **DO**: Check before building
- ✅ **DO**: Update COMPLETED_WORK.md after finishing
- ✅ **DO**: Reference commit hashes and file paths
- ✅ **DO**: Note known issues or incomplete sections
- ❌ **DON'T**: Overwrite without reviewing first
- ❌ **DON'T**: Skip the check step
- ❌ **DON'T**: Leave work undocumented

---

## Quick Reference Commands

```bash
# Check COMPLETED_WORK.md
grep -i "keyword" COMPLETED_WORK.md

# Search codebase
grep -r "search term" apps/pos/src --include="*.js" --include="*.jsx"

# Recent commits
git log --oneline --all --since="7 days ago" | grep -i "keyword"

# Files modified today
find . -type f -mtime -1 \( -name "*.js" -o -name "*.jsx" -o -name "*.sql" \)
```

---

## Last Merged Changes

| Date | Agent | Merge | Files | Status |
|------|-------|-------|-------|--------|
| 2026-07-18 | Codex | `codex/enhancements-delivery` | Finance, storefront, POS, migrations | ✅ Live |
| 2026-07-19 | Codex | Warehouse/transfers | 2 migrations | ✅ Live |

