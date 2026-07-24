# Recipes Module Setup Guide

## Overview
The Recipes Module enables staff to view and reference drink recipes, while owners can create, edit, archive, and import recipes from images/PDFs using AI extraction.

## Setup Steps

### 1. Create the Database Schema
Run this SQL in your Supabase dashboard (SQL Editor):

```sql
-- Copy and paste the entire contents of: supabase/schema_recipes.sql
```

Or directly paste the file contents from `supabase/schema_recipes.sql`.

**What this creates:**
- `recipes` table with columns for code, name, category, ingredients (JSONB), layers (JSONB), steps (JSONB)
- Row Level Security (RLS) policies:
  - All authenticated users can view non-archived recipes
  - Owners can view archived recipes
  - Only owners can create/update/delete recipes

### 2. Set Anthropic API Key
The AI recipe extraction feature requires the Claude API.

1. Get your Anthropic API key from https://console.anthropic.com/
2. In Supabase:
   - Go to **Project Settings** → **API**
   - Scroll to **Edge Function secrets**
   - Add new secret:
     - Name: `ANTHROPIC_API_KEY`
     - Value: `sk-ant-...` (your key)

### 3. Test the Module

#### As Owner:
1. Navigate to **Recipes** in the sidebar
2. Click **+ New Recipe** to create a recipe manually
3. Click **Import from Image/PDF** to test AI extraction:
   - Upload a barista recipe image/PDF
   - Claude will extract: code, name, ingredients, steps, layers
   - Review the extracted data and save

#### As Staff:
1. Navigate to **Recipes** in the sidebar
2. View all recipes (read-only)
3. Click any recipe card to see full details

## File Structure

```
src/
├── pages/
│   ├── Recipes.jsx              # List page with filters/search
│   └── RecipeDetail.jsx         # Detail page (view/edit for owners)
├── components/recipes/
│   ├── RecipeCard.jsx           # Recipe card with layer preview
│   ├── RecipeForm.jsx           # Create/edit form with ingredients, steps, layers
│   └── RecipeImport.jsx         # Image/PDF upload for AI extraction
└── lib/
    └── supabase.js              # Added: getRecipes(), createRecipe(), etc.

supabase/
├── schema_recipes.sql           # Database schema + RLS
└── functions/
    └── extract-recipe/
        └── index.ts             # Claude API integration for AI extraction

Translations added to:
└── src/lib/i18n.js             # AR/EN recipe labels
```

## Features

### For Owners
- ✅ Create recipes manually with full editor
- ✅ Upload images/PDFs for AI extraction
- ✅ Edit existing recipes
- ✅ Archive recipes (soft delete)
- ✅ Delete recipes
- ✅ Category filters (Coffee, Matcha, Specialty, Signature)
- ✅ View archived recipes

### For Staff  
- ✅ View all non-archived recipes
- ✅ Filter by category
- ✅ Search by code or name
- ✅ View detailed recipe with layers, ingredients, steps

### Recipe Data Structure

**Ingredients** (JSONB array):
```json
[
  {
    "group": "Base",
    "group_ar": "الأساس",
    "items": [
      { "name": "Espresso", "name_ar": "إسبريسو", "amount": "60", "unit": "ml" }
    ]
  }
]
```

**Layers** (JSONB array, bottom to top):
```json
[
  { "label": "Ice", "label_ar": "ثلج", "color": "#B0D8F0", "height": 2 },
  { "label": "Espresso", "label_ar": "إسبريسو", "color": "#2C1A0E", "height": 1 }
]
```

**Steps** (JSONB array):
```json
[
  {
    "step": 1,
    "instruction": "Add ice to glass",
    "instruction_ar": "أضف الثلج للكوب",
    "warning": "Use fresh ice",
    "warning_ar": "استخدم ثلج طازج"
  }
]
```

## AI Extraction

When uploading a recipe image/PDF:
1. Claude analyzes the image using vision
2. Extracts: code, name, category, subcategory, ingredients, layers, steps
3. Returns structured JSON pre-filled into the form
4. User reviews and saves

Supported file types: JPG, PNG, GIF, WebP (images) | PDF

## Translation Keys

All UI strings are translated in `src/lib/i18n.js`:
- `recipes`, `newRecipe`, `editRecipe`, `importRecipe`
- `recipeCode`, `recipeName`, `recipeCategory`, `recipeSubcategory`
- `recipeIngredients`, `recipeLayers`, `recipeSteps`
- `catCoffee`, `catMatcha`, `catSpecialty`, `catSignature`
- `subIced`, `subHot`, `tempIced`, `tempHot`
- And more...

## Routes

- `/recipes` — List all recipes (protected, all authenticated users)
- `/recipes/:id` — View/edit single recipe (protected, all authenticated users)

## Next Steps (Optional)

1. **Seed sample recipes** — Uncomment the SQL INSERT statements in `schema_recipes.sql`
2. **Add recipe ratings** — Add a `rating` column and review system
3. **Export recipes** — Generate PDF cards or print-friendly format
4. **Recipe versioning** — Track changes and revert to previous versions
5. **Link to cost calculator** — Map recipes to ingredient costs

## Troubleshooting

**"No recipes yet" when expected to see them:**
- Check that recipes are not archived (only owners see archived by default)
- Verify RLS policies are enabled
- Check user role in `profiles` table

**AI extraction returns errors:**
- Verify ANTHROPIC_API_KEY is set in Supabase secrets
- Check image quality (high resolution works best)
- Try a different recipe image format

**Styles look wrong:**
- Clear browser cache (Ctrl+Shift+Delete)
- Run `npm run build` to rebuild CSS
- Check that Tailwind is properly configured

---

**Module created:** 2026-04-08  
**Components:** 3 (RecipeCard, RecipeForm, RecipeImport)  
**Pages:** 2 (Recipes, RecipeDetail)  
**Database tables:** 1 (recipes)  
**Edge Functions:** 1 (extract-recipe)
