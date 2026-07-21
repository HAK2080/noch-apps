export function getProductLongPressAction(product) {
  return product?.is_sold_out === true ? 'restore_availability' : 'open_stock'
}
