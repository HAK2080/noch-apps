import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://kxqjasdvoohiexedtfqw.supabase.co'
const supabaseKey = 'sb_publishable_O2cp1dxrxbkfw3NceRrtmA_gkFo4D9V'

const supabase = createClient(supabaseUrl, supabaseKey)

function mapCategory(categoryStr) {
  if (categoryStr.includes('MATCHA')) return 'matcha'
  if (categoryStr.includes('SIGNATURE')) return 'signature'
  if (categoryStr.includes('COLD BREW')) return 'coffee'
  return 'coffee'
}

function structureIngredients(rawIngredients) {
  // Transform flat ingredient list into structured format with groups
  return [{
    group: 'Ingredients',
    group_ar: 'المكونات',
    items: rawIngredients.map(ing => ({
      name: ing.item,
      name_ar: ing.item,
      amount: ing.amount === '--' ? '' : ing.amount,
      unit: ''
    }))
  }]
}

function structureSteps(rawInstructions) {
  // Transform instructions into steps format
  return rawInstructions.map((instruction, index) => ({
    step: index + 1,
    instruction: instruction,
    instruction_ar: instruction,
    warning: '',
    warning_ar: ''
  }))
}

async function uploadRecipes() {
  try {
    const recipesPath = 'C:\\Users\\aeroh\\AppData\\Local\\Temp\\recipes.json'
    const recipesData = JSON.parse(fs.readFileSync(recipesPath, 'utf-8'))

    console.log(`Found ${recipesData.length} recipes to upload\n`)

    let success = 0
    for (const recipe of recipesData) {
      const { data, error } = await supabase
        .from('recipes')
        .insert({
          code: recipe.card_number,
          name: recipe.name.trim(),
          category: mapCategory(recipe.category),
          description: recipe.description.substring(0, 500),
          serve_temp: recipe.serve_type.toLowerCase(),
          ingredients: structureIngredients(recipe.ingredients),
          steps: structureSteps(recipe.instructions),
          is_archived: recipe.status !== 'LAUNCH',
        })
        .select()

      if (error) {
        console.error(`❌ ${recipe.card_number}: ${error.message}`)
      } else {
        console.log(`✅ ${recipe.card_number}: ${recipe.name}`)
        success++
      }
    }

    console.log(`\n✨ Complete! ${success}/${recipesData.length} recipes uploaded`)
  } catch (err) {
    console.error('Error:', err.message)
  }
}

uploadRecipes()
