UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Pistachio Tiger Lines","color":"#8DB48E","height":1},{"label":"Oat Milk","color":"#F5E6D3","height":2},{"label":"Matcha","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Tiger lines must be visible. Use fresh pistachio paste.'
WHERE code = 'ML-05';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Taro Oat Milk","color":"#B19CD9","height":3},{"label":"Matcha","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Two colours, two flavours. Taro must be vibrant purple.'
WHERE code = 'ML-06';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Banana Cream","color":"#FFE566","height":2},{"label":"Oat Milk","color":"#F5E6D3","height":2},{"label":"Matcha","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Use ripe bananas only. Do not over-blend.'
WHERE code = 'ML-07';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Banana Bread Paste","color":"#8B6914","height":1},{"label":"Ice + Oat Milk","color":"#F5E6D3","height":3},{"label":"Whisked Matcha","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Banana bread paste must be room temp before use. Layer carefully.'
WHERE code = 'ML-08';

UPDATE recipes SET glass_type = 'Hojicha Glass', glass_type_ar = 'كوب هوجيتشا', yield_ml = 300,
  layers = '[{"label":"Hojicha","color":"#8B6F47","height":3},{"label":"Oat Milk","color":"#F5E6D3","height":2}]'::jsonb,
  notes = 'Hojicha roasted at 80C max. Do not exceed temperature.'
WHERE code = 'ML-09';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Date Caramel","color":"#8B6914","height":1},{"label":"Ice + Oat Milk","color":"#F5E6D3","height":3},{"label":"Hojicha Shot","color":"#6B3A2A","height":1}]'::jsonb,
  notes = 'Dates must be fully soft before blending. Tahini adds depth do not skip.'
WHERE code = 'ML-10';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Date Syrup","color":"#6B4423","height":1},{"label":"Oat Milk","color":"#F5E6D3","height":2},{"label":"Matcha","color":"#4A7C59","height":1},{"label":"Salt Foam","color":"#FAF7F2","height":1}]'::jsonb,
  notes = 'Salt foam must be light and airy. Date syrup base.'
WHERE code = 'ML-11';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Earl Grey Oat Milk","color":"#C4A882","height":2},{"label":"Matcha","color":"#4A7C59","height":1},{"label":"Cream Top","color":"#FAF7F2","height":1}]'::jsonb,
  notes = 'Earl Grey must steep for exactly 5 minutes in hot oat milk.'
WHERE code = 'ML-12';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Espresso","color":"#2C1A0E","height":1},{"label":"Oat Milk","color":"#F5E6D3","height":2},{"label":"Matcha Mascarpone","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Mascarpone must be at room temp. Dust matcha powder on top.'
WHERE code = 'ML-13';

UPDATE recipes SET glass_type = 'Low Glass', glass_type_ar = 'كوب منخفض', yield_ml = 300,
  layers = '[{"label":"Matcha","color":"#4A7C59","height":2},{"label":"Oat Milk","color":"#F5E6D3","height":2},{"label":"Caramel Brulee Top","color":"#E8B84B","height":1}]'::jsonb,
  notes = 'Torch the caramel top to order. Do not pre-torch.'
WHERE code = 'ML-14';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Cold Brew + Ice","color":"#2C1A0E","height":3},{"label":"Whipped Cream","color":"#FAF7F2","height":2}]'::jsonb,
  notes = 'Standard cream top recipe. Cocoa dust diagonal, not full coverage.'
WHERE code = 'SL-01';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Cold Brew + Lotus","color":"#C97D4E","height":3},{"label":"Lotus Cream Top","color":"#E8C49A","height":2}]'::jsonb,
  notes = 'Lotus cream must be poured slowly. Do not shake before serving.'
WHERE code = 'SL-02';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Double Espresso + Ice","color":"#1A0A00","height":3},{"label":"Oat Milk","color":"#F5E6D3","height":2}]'::jsonb,
  notes = 'Pull double shot fresh. Pour over ice immediately.'
WHERE code = 'SL-03';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 400,
  layers = '[{"label":"Espresso + Milk","color":"#6B3A2A","height":3},{"label":"Tiramisu Cloud","color":"#FAF7F2","height":2}]'::jsonb,
  notes = 'Cloud foam must hold shape for 10 minutes minimum. Dust cocoa to order.'
WHERE code = 'SL-04';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Espresso + Oat Milk","color":"#8DB48E","height":3},{"label":"Pistachio Cream","color":"#A8C5A0","height":2}]'::jsonb,
  notes = 'Fresh pistachio paste only. No pre-made pistachio syrup.'
WHERE code = 'SL-05';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Espresso + Oat Milk","color":"#6B3A2A","height":3},{"label":"Honey Macadamia Foam","color":"#F5DEB3","height":2}]'::jsonb,
  notes = 'Raw honey only. Macadamia foam must be light.'
WHERE code = 'SL-06';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Espresso + Oat Milk","color":"#6B3A2A","height":3},{"label":"Marshmallow Foam","color":"#FAF7F2","height":2}]'::jsonb,
  notes = 'Toast marshmallow to order. Serve immediately.'
WHERE code = 'SL-07';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Taro Oat Milk","color":"#B19CD9","height":3},{"label":"Espresso","color":"#2C1A0E","height":1}]'::jsonb,
  notes = 'Taro oat milk must be vivid purple. Espresso layered on top.'
WHERE code = 'SL-08';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 300,
  layers = '[{"label":"Cold Brew + Citrus","color":"#2C1A0E","height":3},{"label":"Ice","color":"#E8F4F8","height":1}]'::jsonb,
  notes = 'Shake vigorously for 15 seconds. Serve immediately over fresh ice.'
WHERE code = 'SL-09';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Cold Brew","color":"#2C1A0E","height":3},{"label":"Oat Milk","color":"#F5E6D3","height":2}]'::jsonb,
  notes = 'Cold brew brewed for minimum 16 hours. Oat milk only.'
WHERE code = 'SL-10';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Cold Brew + Chocolate","color":"#3D1C02","height":3},{"label":"Oat Milk","color":"#F5E6D3","height":2}]'::jsonb,
  notes = 'Use dark chocolate 70% and above only. Do not use cocoa powder.'
WHERE code = 'SL-11';

UPDATE recipes SET glass_type = 'Tall Glass', glass_type_ar = 'كوب طويل', yield_ml = 350,
  layers = '[{"label":"Yuzu Soda","color":"#F5E642","height":2},{"label":"Oat Milk","color":"#F5E6D3","height":1},{"label":"Matcha Float","color":"#4A7C59","height":1}]'::jsonb,
  notes = 'Sparkling water chilled and carbonated. Add matcha float last.'
WHERE code = 'SM-02';

SELECT COUNT(*) as total_updated FROM recipes WHERE glass_type IS NOT NULL;
