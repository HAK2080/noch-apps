// Branch visibility is stored on visible_branch_ids. Do not embed pos_branches
// here: the live schema has more than one relationship between the tables and
// Product Catalog does not consume the legacy branch relation.
export const ALL_PRODUCTS_SELECT = '*, pos_categories(name, name_ar, color)'
