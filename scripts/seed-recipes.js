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
    description: 'Matcha latte base with matcha whisked into both the milk and the cream top. Two layers. No shortcuts.',
    description_ar: 'قاعدة حليب ماتشا مع ماتشا مخفوقة في الحليب والقشدة. طبقتان.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [
      {
        group: 'Base',
        group_ar: 'الأساس',
        items: [
          { name: 'Matcha', name_ar: 'ماتشا', amount: '4', unit: 'g' },
          { name: 'Water', name_ar: 'ماء', amount: '35', unit: 'g' },
          { name: 'Oat Milk', name_ar: 'حليب الشوفان', amount: '100', unit: 'g' },
          { name: 'Vanilla Syrup', name_ar: 'شراب الفانيليا', amount: '10', unit: 'g' }
        ]
      },
      {
        group: 'Matcha Cream Top',
        group_ar: 'قشدة الماتشا',
        items: [
          { name: 'Matcha', name_ar: 'ماتشا', amount: '1.5', unit: 'g' },
          { name: 'Water', name_ar: 'ماء', amount: '3', unit: 'g' },
          { name: 'Heavy Cream', name_ar: 'كريمة ثقيلة', amount: '40', unit: 'ml' },
          { name: 'Vanilla Syrup', name_ar: 'شراب الفانيليا', amount: '14', unit: 'g' }
        ]
      }
    ],
    layers: [
      { label: 'Oat Milk', label_ar: 'حليب الشوفان', color: '#F5E6D3', height: 2 },
      { label: 'Matcha', label_ar: 'ماتشا', color: '#4A7C59', height: 2 },
      { label: 'Cream Top', label_ar: 'القشدة', color: '#FAF7F2', height: 1 }
    ],
    steps: [
      { step: 1, instruction: 'Sift matcha, dissolve in 40°C water. Add vanilla syrup. Combine with cold heavy cream and froth.', instruction_ar: 'غربل الماتشا، ذوبها في ماء بدرجة 40. أضف شراب الفانيليا.', warning: 'Must flow slowly off spoon', warning_ar: 'يجب أن تتدفق ببطء من الملعقة' },
      { step: 2, instruction: 'Sift 4g matcha, add 35g water (40°C), whisk in zigzag until smooth.', instruction_ar: 'غربل 4 غرام من الماتشا، أضف 35 غرام ماء', warning: 'No clumps', warning_ar: 'بدون كتل' },
      { step: 3, instruction: 'Add vanilla syrup, fill with ice, pour 100g cold oat milk.', instruction_ar: 'أضف شراب الفانيليا، امل الكوب بالثلج', warning: null, warning_ar: null },
      { step: 4, instruction: 'Pour whisked matcha slowly over back of spoon. Layers must be visible.', instruction_ar: 'صب الماتشا المخفوقة ببطء فوق ظهر الملعقة', warning: null, warning_ar: null },
      { step: 5, instruction: 'Spoon matcha cream top over drink. Light matcha dust over cream. Serve immediately.', instruction_ar: 'ضع قشدة الماتشا فوق المشروب', warning: 'Three visible layers: milk / matcha / cream', warning_ar: 'ثلاث طبقات مرئية' }
    ],
    notes: 'Sift matcha before every use. Water temperature max 40°C. Oat milk only.'
  },
  {
    code: 'ML-02',
    name: 'Mango Double Matcha',
    name_ar: 'ماتشا مزدوج مانجو',
    category: 'matcha',
    subcategory: 'iced',
    description: 'Frozen mango puree at base, oat milk middle, matcha cream top. Three layers. Tropical meets earthy.',
    description_ar: 'مهروس المانجو المجمد في القاعدة، حليب الشوفان في الوسط، قشدة الماتشا في الأعلى.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [
      {
        group: 'Base',
        group_ar: 'الأساس',
        items: [
          { name: 'Frozen Mango Puree', name_ar: 'مهروس المانجو المجمد', amount: '40', unit: 'g' },
          { name: 'Oat Milk', name_ar: 'حليب الشوفان', amount: '60', unit: 'ml' },
          { name: 'Matcha', name_ar: 'ماتشا', amount: '4', unit: 'g' },
          { name: 'Water', name_ar: 'ماء', amount: '35', unit: 'g' }
        ]
      }
    ],
    layers: [
      { label: 'Mango Puree', label_ar: 'مهروس المانجو', color: '#FFB347', height: 2 },
      { label: 'Oat Milk', label_ar: 'حليب الشوفان', color: '#F5E6D3', height: 2 },
      { label: 'Matcha', label_ar: 'ماتشا', color: '#4A7C59', height: 1 },
      { label: 'Cream Top', label_ar: 'القشدة', color: '#FAF7F2', height: 1 }
    ],
    steps: [
      { step: 1, instruction: 'Scoop 40g frozen mango puree into tall glass.', instruction_ar: 'ضع 40 غرام من مهروس المانجو المجمد في الكوب', warning: null, warning_ar: null },
      { step: 2, instruction: 'Pour 60ml cold oat milk over mango puree.', instruction_ar: 'صب 60 ملل من حليب الشوفان البارد', warning: null, warning_ar: null },
      { step: 3, instruction: 'Whisk 4g matcha with 35g water (40°C), pour over back of spoon.', instruction_ar: 'اخفق 4 غرام ماتشا مع 35 غرام ماء', warning: null, warning_ar: null },
      { step: 4, instruction: 'Top with matcha cream. Light matcha dust.', instruction_ar: 'ضع قشدة الماتشا في الأعلى', warning: 'Keep three layers visible', warning_ar: 'حافظ على الطبقات الثلاث مرئية' }
    ],
    notes: 'House-made frozen mango puree. Sift matcha before use. Do not stir.'
  },
  {
    code: 'SL-01',
    name: 'Einspanner',
    name_ar: 'أينشبانر',
    category: 'signature',
    subcategory: 'iced',
    description: 'Cold brew base with heavy whipped cream and powdered sugar. Simple elegance.',
    description_ar: 'قاعدة قهوة باردة مع كريمة مخفوقة وسكر بودرة. بساطة أنيقة.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [
      {
        group: 'Base',
        group_ar: 'الأساس',
        items: [
          { name: 'Cold Brew', name_ar: 'قهوة باردة', amount: '120', unit: 'ml' },
          { name: 'Ice', name_ar: 'ثلج', amount: 'Full', unit: '' }
        ]
      },
      {
        group: 'Topping',
        group_ar: 'التوبينج',
        items: [
          { name: 'Heavy Cream', name_ar: 'كريمة ثقيلة', amount: '80', unit: 'ml' },
          { name: 'Powdered Sugar', name_ar: 'سكر بودرة', amount: '10', unit: 'g' }
        ]
      }
    ],
    layers: [
      { label: 'Ice + Cold Brew', label_ar: 'ثلج + قهوة باردة', color: '#2C1A0E', height: 3 },
      { label: 'Whipped Cream', label_ar: 'كريمة مخفوقة', color: '#FAF7F2', height: 2 }
    ],
    steps: [
      { step: 1, instruction: 'Fill glass with ice.', instruction_ar: 'امل الكوب بالثلج', warning: null, warning_ar: null },
      { step: 2, instruction: 'Pour 120ml cold brew over ice.', instruction_ar: 'صب 120 ملل قهوة باردة على الثلج', warning: null, warning_ar: null },
      { step: 3, instruction: 'Whip 80ml heavy cream to soft peaks. Pour gently over brew.', instruction_ar: 'اخفق 80 ملل كريمة ثقيلة إلى ذروة ناعمة', warning: 'Do not stir', warning_ar: 'لا تحرك' },
      { step: 4, instruction: 'Dust with powdered sugar. Serve with long spoon.', instruction_ar: 'رش بسكر بودرة. قدم مع ملعقة طويلة', warning: null, warning_ar: null }
    ],
    notes: 'Classic Vienna-style. Fresh whipped cream essential. Do not use pre-whipped.'
  },
  {
    code: 'SL-02',
    name: 'Date Caramel Hojicha',
    name_ar: 'هوجيتشا بالكراميل والتمر',
    category: 'signature',
    subcategory: 'iced',
    description: 'Roasted green tea with date syrup and caramel. Warm spice notes in cold form.',
    description_ar: 'شاي أخضر محمص مع شراب التمر والكراميل. نكهات دافئة بشكل بارد.',
    serve_temp: 'iced',
    glass_type: 'Tall Glass',
    glass_type_ar: 'كوب طويل',
    yield_ml: 350,
    ingredients: [
      {
        group: 'Base',
        group_ar: 'الأساس',
        items: [
          { name: 'Hojicha Concentrate', name_ar: 'تركيز الهوجيتشا', amount: '30', unit: 'ml' },
          { name: 'Date Syrup', name_ar: 'شراب التمر', amount: '20', unit: 'ml' },
          { name: 'Cold Water', name_ar: 'ماء بارد', amount: '100', unit: 'ml' },
          { name: 'Ice', name_ar: 'ثلج', amount: 'Full', unit: '' }
        ]
      },
      {
        group: 'Topping',
        group_ar: 'التوبينج',
        items: [
          { name: 'Caramel Drizzle', name_ar: 'رش الكراميل', amount: '15', unit: 'ml' },
          { name: 'Cream Foam', name_ar: 'رغوة الكريمة', amount: '50', unit: 'ml' }
        ]
      }
    ],
    layers: [
      { label: 'Hojicha + Water', label_ar: 'هوجيتشا + ماء', color: '#8B6F47', height: 3 },
      { label: 'Date Syrup', label_ar: 'شراب التمر', color: '#6B4423', height: 1 },
      { label: 'Cream Foam', label_ar: 'رغوة الكريمة', color: '#F5E6D3', height: 1 }
    ],
    steps: [
      { step: 1, instruction: 'Pour 20ml date syrup into glass. Add ice.', instruction_ar: 'صب 20 ملل شراب التمر في الكوب', warning: null, warning_ar: null },
      { step: 2, instruction: 'Combine 30ml hojicha concentrate with 100ml cold water.', instruction_ar: 'امزج 30 ملل تركيز الهوجيتشا مع 100 ملل ماء بارد', warning: null, warning_ar: null },
      { step: 3, instruction: 'Pour hojicha mixture over date syrup and ice.', instruction_ar: 'صب خليط الهوجيتشا فوق شراب التمر والثلج', warning: null, warning_ar: null },
      { step: 4, instruction: 'Top with cream foam. Drizzle caramel. Serve immediately.', instruction_ar: 'ضع رغوة الكريمة في الأعلى', warning: 'Stir gently before first sip to blend flavors', warning_ar: 'اخلط برفق قبل الشرب الأول' }
    ],
    notes: 'House-made date syrup. Hojicha concentrate is pre-chilled.'
  }
];

async function seedRecipes() {
  try {
    console.log('Starting recipe seed...');

    for (const recipe of recipes) {
      const { data, error } = await supabase
        .from('recipes')
        .insert([recipe])
        .select();

      if (error) {
        console.error(`Error inserting ${recipe.code}:`, error);
      } else {
        console.log(`✓ Inserted ${recipe.code}: ${recipe.name}`);
      }
    }

    console.log('\n✅ Recipe seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

seedRecipes();
