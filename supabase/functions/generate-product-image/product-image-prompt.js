const MAX_NAME_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 500

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function normalizeProductImageBrief(input = {}) {
  const name = cleanText(input.name, MAX_NAME_LENGTH)
  const nameAr = cleanText(input.name_ar, MAX_NAME_LENGTH)
  const description = cleanText(input.description, MAX_DESCRIPTION_LENGTH)
  const descriptionAr = cleanText(input.description_ar, MAX_DESCRIPTION_LENGTH)
  const category = cleanText(input.category, MAX_NAME_LENGTH)

  if (!name && !nameAr) throw new Error('Enter a product name before generating an image')

  return { name, nameAr, description, descriptionAr, category }
}

export function buildProductImagePrompt(input = {}) {
  const brief = normalizeProductImageBrief(input)
  const productName = [brief.name, brief.nameAr].filter(Boolean).join(' / ')
  const description = [brief.description, brief.descriptionAr].filter(Boolean).join(' / ')

  return [
    'Create one polished, photorealistic cafe menu product photograph.',
    `Product: ${productName}.`,
    brief.category ? `Category: ${brief.category}.` : '',
    description ? `Product details: ${description}.` : '',
    'Show exactly one finished product as the clear hero subject.',
    'Use a vertical portrait composition with the entire cup, glass, plate, or package fully visible from top to base.',
    'Center the product and leave generous clean space on every side so it remains safe when fitted into a 4:5 menu card.',
    'Use a warm cream seamless studio background (#f8f3e8), soft natural commercial lighting, realistic texture, and a subtle grounding shadow.',
    'Camera angle should clearly show the drink or product while keeping its silhouette easy to recognize on a small mobile menu card.',
    'Do not crop the product. Do not add text, lettering, labels, logos, watermarks, borders, hands, people, multiple products, or distracting props.',
    'The final result must look appetizing, premium, realistic, uncluttered, and ready for an online cafe menu.',
  ].filter(Boolean).join(' ')
}
