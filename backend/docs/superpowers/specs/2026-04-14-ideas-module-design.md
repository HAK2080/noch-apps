# Ideas Module — Design Spec
**Date:** 2026-04-14  
**Status:** Approved  

---

## Overview

A lightweight Kanban-style idea capture board for the Noch app. Anyone on the team can drop an idea — business, feature, recipe, decoration, supplier, content, or anything else — and the owner sees it all in one place. No AI scoring, no complexity. Think digital sticky notes with a status board and a direct path to action.

---

## Data Model

### Table: `ideas`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen_random_uuid() | |
| `title` | text | NOT NULL | Required — the one field that must be filled |
| `notes` | text | nullable | Long-form detail, optional |
| `category_id` | uuid | FK → idea_categories(id) ON DELETE SET NULL | Optional |
| `status` | text | NOT NULL, default 'raw' | raw / exploring / in_progress / shelved / done / discarded |
| `image_url` | text | nullable | Uploaded photo URL (Supabase Storage) |
| `link_url` | text | nullable | External URL (supplier site, TikTok, etc.) |
| `submitted_by` | uuid | FK → profiles(id) ON DELETE CASCADE | Who created it |
| `converted_task_id` | uuid | FK → tasks(id) ON DELETE SET NULL | Null until "Convert to Task" is used |
| `created_at` | timestamptz | default now() | |
| `updated_at` | timestamptz | default now() | |

### Table: `idea_categories`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen_random_uuid() | |
| `name` | text | NOT NULL | Display name |
| `color` | text | NOT NULL, default '#10b981' | Hex color for badge |
| `icon` | text | nullable | Emoji or lucide icon name |
| `sort_order` | int | default 0 | User-controlled ordering |
| `is_default` | boolean | default false | Seeded defaults — can still be renamed/deleted |

### Default Categories (seeded)

| Name | Icon | Color |
|------|------|-------|
| Business Idea | 💼 | #3b82f6 |
| App Feature | ⚡ | #8b5cf6 |
| Recipe / Drink | 🍵 | #10b981 |
| Decoration | 🎨 | #f59e0b |
| Supplier | 📦 | #6b7280 |
| Content | 📝 | #ec4899 |
| Other | ✨ | #64748b |

---

## Access Control (RLS)

### `ideas` table
- **SELECT**: Owner/admin sees all rows. Staff sees only rows where `submitted_by = auth.uid()`
- **INSERT**: Any authenticated user
- **UPDATE**: Owner can update any row. Staff can update only their own rows AND only when `converted_task_id IS NULL`
- **DELETE**: Owner can delete any. Staff can delete only their own (only when `converted_task_id IS NULL`)

### `idea_categories` table
- **SELECT**: All authenticated users
- **INSERT / UPDATE / DELETE**: Owner/admin only

### Role check helper
Use `(select role from profiles where id = auth.uid()) = 'owner'` pattern, consistent with rest of app.

---

## UI & Routes

### Routes
| Path | Access | Purpose |
|------|--------|---------|
| `/ideas` | All authenticated | Main Kanban board |
| `/ideas/categories` | Owner only | Manage categories |

### Main Board (`/ideas`)

**Toolbar:**
- `+ New Idea` button (primary) — opens quick-capture modal
- Category filter dropdown — "All Categories" default, filters all columns
- "My Ideas / All Ideas" toggle — **owner only**, defaults to "All Ideas"

**Kanban columns (left → right):**
1. Raw
2. Exploring
3. In Progress
4. Shelved
5. Done
6. Discarded 🗑️

Each column has a `+ Add` shortcut at the bottom for fast inline capture.

### Idea Card

Displays:
- Title (2-line truncate)
- Category badge (color-coded pill)
- Submitter avatar + name — **owner view only**
- 📎 icon if `image_url` or `link_url` is present
- "→ Task" button (only if `converted_task_id` is null)
- Relative timestamp (e.g. "2 days ago")

Click card → opens Idea Detail panel (slide-in from right).

### Quick-Capture Modal

Triggered by `+ New Idea` or column `+ Add`.  
Fields: **Title** (required) + **Category** (optional dropdown) + **Notes** (optional textarea).  
Photo and URL added later in the detail view.

### Idea Detail Panel

Full editable view:
- Title (editable text)
- Notes (textarea)
- Category selector
- Status selector
  - Owner: can set any status freely
  - Staff: can move own ideas between Raw / Exploring / In Progress / Discarded only
- Photo upload (drag-drop or file picker → uploads to Supabase Storage → sets `image_url`)
- URL field (plain text input, opens in new tab)
- **"Convert to Task" button** — **owner only**, primary CTA when `converted_task_id` is null; hidden for staff
- **"→ View Task" link** — shown to everyone when `converted_task_id` is set (idea is read-only)
- Delete button (owner: any idea; staff: own only, only if not converted)

---

## Convert to Task Flow

1. **Owner** taps **"Convert to Task"** (card or detail panel) — button is hidden from staff
2. New Task modal opens pre-filled:
   - `title` = idea title
   - `description` = idea notes
   - All other fields blank (assignee, due date, priority)
3. Owner completes task fields and saves
4. On task save:
   - `ideas.converted_task_id` = new task `id`
   - `ideas.status` automatically set to `in_progress`
   - Idea becomes read-only (no further edits)
5. "Convert to Task" button replaced by "→ View Task" (navigates to task detail)

---

## Categories Management (`/ideas/categories`)

Owner-only page:
- List of all categories with color swatch + icon/emoji + name
- Inline rename on click
- Color picker (simple palette, not full picker)
- Drag to reorder (`sort_order` updated on drop)
- Delete button — confirmation dialog warns if ideas exist in that category; on confirm, orphaned ideas have `category_id` set to null
- "Add Category" form at bottom: name + color + emoji

---

## Out of Scope

- AI scoring or analysis (explicitly not wanted)
- Idea comments or reactions
- Notifications when staff submit ideas (can be Phase 2)
- Public or cross-business idea sharing
- Idea voting or ranking
