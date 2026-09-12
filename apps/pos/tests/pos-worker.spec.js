import {test,expect} from '@playwright/test'
test.beforeEach(async({page})=>{
  await page.route('**/src/contexts/AuthContext*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({user:{id:"owner"},isOwner:false})'}))
  await page.route('**/src/components/Layout*',r=>r.fulfill({contentType:'application/javascript',body:'export default function Layout({children}){return children}'}))
  await page.route('**/src/lib/usePermission*',r=>r.fulfill({contentType:'application/javascript',body:'export const usePermission=()=>()=>true'}))
  await page.route('**/src/modules/pos/lib/pos-supabase*',r=>r.fulfill({contentType:'application/javascript',body:`
    const call=(path,body)=>fetch('/worker-test/'+path,{method:'POST',body:JSON.stringify(body)}).then(async r=>{if(!r.ok)throw Error('Connection failed');return r.json()});
    export const getPOSBranches=()=>call('branches'); export const getOpenShift=()=>call('shift');
    export const openShift=(id,cash)=>call('open',{id,cash}); export const updatePOSBranch=()=>{};
    export const getPOSBranch=()=>call('branch');export const getShiftSummary=()=>call('summary');
    export const getCashMovements=()=>Promise.resolve([]);export const getShiftControl=()=>Promise.resolve(null);
    export const recordCashMovement=()=>{};export const closeShift=(id,data)=>call('close',{id,...data});
  `}))
  await page.route('**/worker-test/**',r=>{
    const path=r.request().url().split('/').pop()
    const branch={id:'test',name:'Test branch',is_active:true,customer_status:'operating'}
    return r.fulfill({json:path==='branches'?[branch]:path==='branch'?branch:path==='summary'?{topProducts:[]}:null})
  })
})
test('opening requires an explicit count, submits once and enters the terminal',async({page})=>{
  let requests=0,payload
  await page.route('**/worker-test/open',async r=>{requests++;payload=r.request().postDataJSON();await new Promise(resolve=>setTimeout(resolve,250));await r.fulfill({json:{id:'shift'}})})
  await page.goto('/tests/fixtures/pos-worker.html')
  await page.getByRole('button',{name:'Open Shift',exact:true}).click()
  await page.getByRole('button',{name:'Open',exact:true}).click()
  expect(requests).toBe(0)
  await page.getByLabel('Opening Cash (LYD)',{exact:true}).fill('0')
  await page.getByRole('button',{name:'Open',exact:true}).dblclick()
  await expect(page.getByText('Terminal ready')).toBeVisible()
  expect(requests).toBe(1);expect(payload.cash).toBe(0)
})
test('failed shift checks offer retry instead of claiming no shift exists',async({page})=>{
  await page.route('**/worker-test/shift',r=>r.fulfill({status:503,json:{}}))
  await page.goto('/tests/fixtures/pos-worker.html')
  await expect(page.getByRole('button',{name:'Could not check shift — retry'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Open Shift',exact:true})).toHaveCount(0)
})
test('closing distinguishes an uncounted drawer, then submits a real count and returns to branches',async({page})=>{
  let payload
  await page.route('**/worker-test/shift',r=>r.fulfill({json:{id:'shift',opening_cash:100,expected_cash:100,total_sales:0,total_cash_sales:0,total_card_sales:0,opened_at:new Date().toISOString()}}))
  await page.route('**/worker-test/close',r=>{payload=r.request().postDataJSON();return r.fulfill({json:{success:true}})})
  await page.goto('/tests/fixtures/pos-worker.html?close')
  await page.getByRole('button',{name:'Close Shift',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Actual cash has not been entered'})).toBeVisible()
  expect(payload).toBeUndefined()
  await page.getByRole('button',{name:/Return to.*count/i}).click()
  await page.getByLabel('Actual Cash in Drawer (LYD)',{exact:true}).fill('100')
  await page.getByRole('button',{name:'Close Shift',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Point of Sale',exact:true})).toBeVisible()
  expect(payload.closing_cash).toBe(100);expect(payload.cash_counted).toBe(true)
})

for (const width of [390,1024]) test('menu is readable and tappable at '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height:844})
  await page.goto('/tests/fixtures/pos-worker.html?menu')
  await page.getByRole('button',{name:'W ماء 1.00 LYD',exact:true}).click()
  await expect(page.getByText('السلة: 1')).toBeVisible()
  await expect(page.getByRole('button',{name:/لندن كيك/})).toHaveAttribute('aria-disabled','true')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const rows=await page.locator('button[aria-disabled]').evaluateAll(elements=>[...new Map(elements.map(el=>{const r=el.getBoundingClientRect();return [r.top,{top:r.top,bottom:r.bottom}]})).values()].sort((a,b)=>a.top-b.top))
  for(let i=1;i<rows.length;i++) expect(rows[i].top-rows[i-1].bottom).toBeLessThanOrEqual(16)
  await page.screenshot({path:testInfo.outputPath('menu.png'),fullPage:true})
  await page.getByLabel('بحث',{exact:true}).fill('غير موجود')
  await expect(page.getByText('لا توجد نتائج لـ "غير موجود"')).toBeVisible()
})
