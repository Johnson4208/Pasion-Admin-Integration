import {test,expect} from '@playwright/test';

const base={category:'Geopolitics',factor:'Conflict risk',focus:'Vietnam',horizon:'30 days'};
function source(i=0,extra={}){return {id:'story-'+i,title:'Vietnam regional risk update '+i,url:'https://example.org/story-'+i,
 description:'Published regional evidence for a possible change',source:'Sample publisher',published_at:'2026-10-23T08:00:00Z',
 weight:.65,direction:-.8,direction_status:'DIRECTIONAL',geographic_relation:'DIRECT_SCOPE',...extra};}
function report(query=base,extras={}){
 const items=[source(1),source(2)];
 const rows=Array.from({length:10},(_,i)=>({
  id:'scenario-'+i,title:i===0?'Rapid deterioration':i===1?'Gradual improvement':'Scenario pathway '+(i+1),
  definition:'Conditional economic development '+(i+1),rank:i+1,
  qualifier_fit:'BOTH',status:i<3?'EXPERIMENTAL_ESTIMATE':'PENDING_EVIDENCE',supporting_source_count:i<3?2:0,
  sources:i<3?items:[],support_index:i<3?.6-i*.08:null,
  experimental_probability:i<3?{status:'EXPERIMENTAL_UNCALIBRATED',probability_estimate:[.732,.641,.538][i],
    prior_sensitivity_range:[.31,.86],calibrated:false}:null
 }));
 return {version:1,status:'EVIDENCE_AVAILABLE',...query,generated_at:'2026-10-24T03:00:00Z',
  source_count:2,items,coverage:{requests:5,feed_successes:3},
  dynamic_scenarios:{ranked_scenarios:rows},bayesian_forecast:{status:'UNAVAILABLE'},
  probability_status:'EXPERIMENTAL_UNCALIBRATED',...extras};
}
async function start(page){
 await page.goto('/#event-scenarios');
 await expect(page.getByRole('heading',{name:'Dynamic Scenario Forecasting'})).toBeVisible();
}
test.beforeEach(async({page})=>{
 await page.route('**/api/session',r=>r.fulfill({json:{authenticated:true,isAdmin:false,user:{name:'Event Tester',email:'event-test@example.com'}}}));
 await page.route('**/api/research/company/**',r=>r.fulfill({json:{status:'UNAVAILABLE'}}));
});
test('initial results remain compact with a labeled zero placeholder',async({page})=>{
 await start(page);
 await expect(page.locator('.events-ranking-compact')).toBeVisible();
 await expect(page.locator('.events-initial-summary')).toContainText('0%');
 await expect(page.locator('.events-initial-summary')).toContainText('Not calculated');
 await expect(page.locator('.events-ranked-item')).toHaveCount(0);
});
test('restored probability ranking shows ten pathways and bounded research labels',async({page})=>{
 await page.route('**/api/research/events/live?*',r=>r.fulfill({json:report()}));
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await expect(page.locator('.events-ranked-item')).toHaveCount(10);
 await expect(page.locator('.events-rank-value').first()).toHaveText('73.2%*');
 await expect(page.locator('.events-rank-value').nth(1)).toHaveText('64.1%*');
 await expect(page.locator('.events-ranked-note')).toContainText('NOT calibrated');
 await expect(page.locator('.events-rank-value').nth(9)).toHaveText('0%');
 await expect(page.locator('.events-ranked-note')).toContainText('display placeholder');
 await expect(page.getByRole('heading',{name:'Ranked scenario pathways'})).toBeVisible();
});
test('loading overlays the prior results and clears after evidence returns',async({page})=>{
 let release;let count=0;
 await page.route('**/api/research/events/live?*',async r=>{
   count++;
   if(count===1)return r.fulfill({json:report()});
   await new Promise(resolve=>{release=resolve});
   await r.fulfill({json:report()});
 });
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await expect(page.locator('.events-rank-value').first()).toHaveText('73.2%*');
 await page.getByRole('button',{name:/^Analyze/}).click();
 await expect(page.locator('.events-loading-spinner')).toBeVisible();
 await expect(page.locator('.events-ranking-shell')).toHaveAttribute('aria-busy','true');
 release();
 await expect(page.locator('.events-loading-spinner')).toHaveCount(0);
 await expect(page.locator('.events-rank-value').first()).toHaveText('73.2%*');
});
test('evidence opens as overlay rather than a long visible article list',async({page})=>{
 await page.route('**/api/research/events/live?*',r=>r.fulfill({json:report()}));
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await page.locator('.events-ranked-item').first().getByRole('button',{name:/Evidence/}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('link')).toHaveCount(2);
 await expect(dialog).toContainText('Sample publisher');
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
});
test('horizons separate the five short and three long choices',async({page})=>{
 await start(page);
 let select=page.getByRole('combobox',{name:'Forecast duration'});
 await expect(select.locator('option')).toHaveCount(5);
 await page.getByRole('button',{name:'Long-term'}).click();
 select=page.getByRole('combobox',{name:'Forecast duration'});
 await expect(select.locator('option')).toHaveCount(3);
 await expect(select).toHaveValue('180 days');
 await page.getByRole('button',{name:'Short-term'}).click();
 await expect(select).toHaveValue('30 days');
});
test('empty or externally scoped evidence does not invent probabilities',async({page})=>{
 await page.route('**/api/research/events/live?*',r=>r.fulfill({json:report(base,{status:'UNAVAILABLE',
  source_count:1,items:[source(1,{geographic_relation:'EXTERNAL_CONTEXT'})]})}));
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await expect(page.locator('.events-empty-diagnostic')).toBeVisible();
 await expect(page.locator('.events-ranked-item')).toHaveCount(0);
});
test('research is saved separately from server event memory',async({page})=>{
 await page.route('**/api/research/events/live?*',r=>r.fulfill({json:report()}));
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await page.getByRole('button',{name:'Save research'}).click();
 await expect(page.locator('.events-history-item')).toHaveCount(1);
 const entry=await page.evaluate(()=>{
   const key=Object.keys(localStorage).find(k=>k.endsWith('-event-research'));
   return key?JSON.parse(localStorage.getItem(key))[0]:null;
 });
 expect(entry).toBeTruthy();
 expect(entry.factor).toBe('Conflict risk');
 expect(entry.research.dynamic_scenarios.ranked_scenarios).toHaveLength(10);
});
test('mobile ranking and evidence modal remain inside screen width',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/research/events/live?*',r=>r.fulfill({json:report()}));
 await start(page);await page.getByRole('button',{name:/^Analyze/}).click();
 await expect(page.locator('.events-ranked-item')).toHaveCount(10);
 await page.locator('.events-ranked-item').first().getByRole('button',{name:/Evidence/}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
