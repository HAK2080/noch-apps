import { test, expect } from '@playwright/test'

test('scanned receipt defaults to paid cash and can be changed to unpaid before saving', async ({ page }) => {
  await page.route('**/src/contexts/AuthContext*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth = () => ({ user: { id: "staff" } })'}))
  let paymentChoice, allocation
  const result = {ok:true,snap_id:'scan',extracted:{amount:125,payment_status_reported:'paid',payment_method_reported:'cash',payment_defaulted:true},cost_centers:[{code:'CC01',name:'City Walk'}]}
  await page.route('**/functions/v1/expense-snap',route=>{
    const request = route.request().postDataJSON()
    if (request.action === 'set_payment') {
      paymentChoice = request
      return route.fulfill({json:{...result,extracted:{...result.extracted,payment_status_reported:request.status,payment_method_reported:request.method,payment_defaulted:false}}})
    }
    if (request.action === 'finalize') allocation = request.allocation
    return route.fulfill({json:request.action==='finalize' ? {ok:true,summary:'City Walk: 125 LYD'} : result})
  })
  await page.goto('/tests/fixtures/receipt-default.html')
  await page.locator('input[type=file]').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:await page.screenshot()})
  await expect(page.getByText(/Paid cash.*Default/)).toBeVisible()
  expect(paymentChoice).toBeUndefined()
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:'test-results/receipt-default-mobile.png',fullPage:true})
  await page.getByRole('button',{name:/Change payment/}).click()
  await page.getByRole('button',{name:/Unpaid/}).click()
  await expect.poll(() => paymentChoice?.status).toBe('unpaid')
  await page.getByRole('button',{name:'City Walk',exact:true}).click()
  await expect(page.getByText('City Walk: 125 LYD',{exact:true})).toBeVisible()
  expect(allocation).toEqual({mode:'single',code:'CC01'})
})
