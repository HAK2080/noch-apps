import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kxqjasdvoohiexedtfqw.supabase.co';
const supabaseKey = 'sb_publishable_O2cp1dxrxbkfw3NceRrtmA_gkFo4D9V';

const supabase = createClient(supabaseUrl, supabaseKey);

const recipes = [
  {
    code: 'ML-01',
    name: 'Double Matcha',
    name_ar: 'ماتشا مزدوج',
    category: 'matcha',
    subcategory: 'iced',
    description: 'Matcha latte base with matcha whisked into both the milk and the cream top.',
    description_ar: 'قاعدة حليب ماتشا مع ماتشا مخفوقة في الحليب والقشدة.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [{"group":"Base","group_ar":"الأساس","items":[{"name":"Matcha","name_ar":"ماتشا","amount":"4","unit":"g"}]}],
    layers: [{"label":"Oat Milk","label_ar":"حليب الشوفان","color":"#F5E6D3","height":2},{"label":"Matcha","label_ar":"ماتشا","color":"#4A7C59","height":2}],
    steps: [{"step":1,"instruction":"Whisk matcha with 40C water","instruction_ar":"اخفق الماتشا مع ماء بدرجة 40","warning":null,"warning_ar":null}],
    notes: 'Sift before use'
  },
  {
    code: 'ML-02',
    name: 'Mango Double Matcha',
    name_ar: 'ماتشا مزدوج مانجو',
    category: 'matcha',
    subcategory: 'iced',
    description: 'Frozen mango puree at base, oat milk middle, matcha cream top.',
    description_ar: 'مهروس المانجو المجمد في القاعدة.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [{"group":"Base","group_ar":"الأساس","items":[{"name":"Mango Puree","name_ar":"مانجو","amount":"40","unit":"g"}]}],
    layers: [{"label":"Mango","label_ar":"مانجو","color":"#FFB347","height":2},{"label":"Milk","label_ar":"حليب","color":"#F5E6D3","height":2}],
    steps: [{"step":1,"instruction":"Add mango base","instruction_ar":"أضف المانجو","warning":null,"warning_ar":null}],
    notes: 'House-made'
  },
  {
    code: 'SL-01',
    name: 'Einspanner',
    name_ar: 'أينشبانر',
    category: 'signature',
    subcategory: 'iced',
    description: 'Cold brew with whipped cream and powdered sugar.',
    description_ar: 'قهوة باردة مع كريمة مخفوقة.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [{"group":"Base","group_ar":"الأساس","items":[{"name":"Cold Brew","name_ar":"قهوة باردة","amount":"120","unit":"ml"}]}],
    layers: [{"label":"Cold Brew","label_ar":"قهوة","color":"#2C1A0E","height":3},{"label":"Cream","label_ar":"كريمة","color":"#FAF7F2","height":2}],
    steps: [{"step":1,"instruction":"Fill with ice and brew","instruction_ar":"امل بالثلج والقهوة","warning":null,"warning_ar":null}],
    notes: 'Vienna style'
  },
  {
    code: 'SL-02',
    name: 'Date Caramel Hojicha',
    name_ar: 'هوجيتشا بالكراميل',
    category: 'signature',
    subcategory: 'iced',
    description: 'Roasted green tea with date syrup and caramel.',
    description_ar: 'شاي أخضر محمص مع شراب التمر.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [{"group":"Base","group_ar":"الأساس","items":[{"name":"Hojicha","name_ar":"هوجيتشا","amount":"30","unit":"ml"}]}],
    layers: [{"label":"Hojicha","label_ar":"هوجيتشا","color":"#8B6F47","height":3},{"label":"Date","label_ar":"تمر","color":"#6B4423","height":1}],
    steps: [{"step":1,"instruction":"Mix hojicha with water","instruction_ar":"امزج الهوجيتشا مع الماء","warning":null,"warning_ar":null}],
    notes: 'House-made date syrup'
  }
];

async function seedRecipes() {
  try {
    console.log('🚀 Seeding recipes...\n');

    for (const recipe of recipes) {
      const { data, error } = await supabase
        .from('recipes')
        .insert([recipe])
        .select();

      if (error) {
        console.error(`❌ Error inserting ${recipe.code}:`, error.message);
      } else {
        console.log(`✅ ${recipe.code} - ${recipe.name}`);
      }
    }

    console.log('\n🎉 Done! Recipes are now in the database.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

seedRecipes();
