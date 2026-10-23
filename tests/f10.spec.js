import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const referenceModel = (name='event-reference-forecast') => JSON.parse(readFileSync(new URL('./fixtures/'+name+'.json',import.meta.url),'utf8'));

const query = {category:'Geopolitics',factor:'Conflict risk',focus:'Vietnam',horizon:'30 days'};
function report(overrides = {}) {
  const q = {...query,...overrides};
  const sources = Array.from({length:20},(_,i) => ({id:'story-'+i,title:`${q.focus} conflict report ${i+1}`,url:`https://example.org/story-${i}`,
    source:'Research fixture',description:'An explicitly labeled test excerpt.',published_at:'2026-10-23T00:00:00Z',
    direction:i<14?1:-1,direction_status:'DIRECTIONAL',geographic_relation:'DIRECT_SCOPE',weight:.7,
    evidence_role:i<14?'SUPPORTS':'CHALLENGES',contribution:i<14?.7:-.7}));
  return {version:1,status:'EVIDENCE_AVAILABLE',...q,generated_at:'2026-10-23T01:15:00Z',items:sources,
    source_count:20,scope_source_count:20,coverage:{requests:5,feed_successes:4},horizon_info:{news_lookback_days:30},
    model:{name:'reported-event-evidence-v3'},calibrated_probability:false,bayesian_forecast:{status:'UNAVAILABLE'},
    dynamic_scenarios:{ranking_metric:'SIGNED_EVIDENCE_BALANCE',ranked_scenarios:[{
      id:'gradual_improvement',title:'Gradual improvement',definition:'Conditions improve incrementally',rank:1,horizon_eligible:true,
      evidence_score:40,support_weight:9.8,opposition_weight:4.2,total_weight:14,
      supporting_source_count:14,opposing_source_count:6,sources,
      // A legacy number must not leak into this evidence-only interface.
      experimental_probability:{probability_estimate:.724},
    }]}};
}
async function open(page) {
  await page.goto('/#event-scenarios');
  await expect(page.getByRole('heading',{name:'A clearer view of what could change.'})).toBeVisible();
}
async function analyze(page) {
  await page.getByRole('button',{name:'Analyze evidence',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Gradual improvement',exact:true})).toBeVisible();
}
const reportRegion = page => page.getByRole('region',{name:'Scenario research report'});

test.beforeEach(async({page}) => {
  await page.route('**/api/session',r => r.fulfill({json:{authenticated:true,isAdmin:false,user:{name:'Event Reviewer',email:'event-reviewer@example.com'}}}));
  await page.route('**/api/research/company/**',r => r.fulfill({json:{status:'UNAVAILABLE'}}));
});

test('empty screen explains the workflow; score and full source trace do not expose experimental percentages',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);
  await expect(page.getByText('What could change the outlook?',{exact:true})).toBeVisible();
  await expect(page.locator('.ev-scenario')).toHaveCount(0);
  await analyze(page);
  await expect(page.locator('.ev-score strong')).toHaveText('+40');
  await expect(reportRegion(page)).not.toContainText('72.4%');
  await expect(page.getByRole('heading',{name:'Probability is not available'})).toBeVisible();
  await page.getByRole('button',{name:'View evidence: Gradual improvement',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('20 articles available');
  await expect(dialog).toContainText('test excerpt');
  await expect(dialog.getByRole('link')).toHaveCount(12);
  await dialog.getByRole('button',{name:/Show more sources/}).click();
  await expect(dialog.getByRole('link')).toHaveCount(20);
  await dialog.getByRole('button',{name:/Challenging/}).click();
  await expect(dialog.getByRole('link')).toHaveCount(6);
  await expect(dialog).toContainText('Challenges this pathway');
});

test('changing a pending query cancels the old result and cannot save it under another region',async({page}) => {
  let firstRoute;
  const intercepted=new Promise(resolve => {firstRoute=resolve;});
  await page.route('**/api/research/events/live?*',async route => {
    const q=Object.fromEntries(new URL(route.request().url()).searchParams);
    if(q.focus==='Vietnam') {firstRoute(route);return;}
    await route.fulfill({json:report(q)});
  });
  await open(page);
  await page.getByRole('button',{name:'Analyze evidence'}).click();
  const pending=await intercepted;
  await page.getByLabel('Region / entity').fill('Japan');
  await pending.fulfill({json:report()}).catch(() => {});
  await expect(page.locator('.ev-scenario')).toHaveCount(0);
  await analyze(page);
  await expect(reportRegion(page).locator('header h2')).toHaveText('Conflict risk · Japan');
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  const saved=await page.evaluate(() => JSON.parse(localStorage.getItem('pasion-watchlist:event-reviewer@example.com-event-research')));
  expect(saved[0].snapshot.focus).toBe('Japan');
  expect(saved[0].snapshot.items[0].title).toContain('Japan');
});

test('a failed refresh clearly identifies the previous report and disables saving it as new',async({page}) => {
  let calls=0;
  await page.route('**/api/research/events/live?*',r => ++calls===1 ? r.fulfill({json:report()}) : r.fulfill({status:503,json:{reason_code:'ALL_NEWS_FEEDS_UNAVAILABLE'}}));
  await open(page);await analyze(page);
  await page.getByRole('button',{name:'Analyze evidence'}).click();
  await expect(page.getByRole('alert')).toContainText('The previous report is shown below');
  await expect(reportRegion(page)).toContainText('PREVIOUS REPORT');
  await expect(page.getByRole('button',{name:'Save report',exact:true})).toBeDisabled();
  await expect(page.locator('.ev-score strong')).toHaveText('+40');
});

test('saved reports reopen with immutable query, model and sources after reload',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);await analyze(page);
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await expect(page.locator('.ev-archive-list article')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button',{name:'Open saved report: Conflict risk, Vietnam'})).toBeVisible();
  await page.getByLabel('Region / entity').fill('Japan');
  await page.getByRole('button',{name:'Open saved report: Conflict risk, Vietnam'}).click();
  await expect(reportRegion(page).locator('header h2')).toHaveText('Conflict risk · Vietnam');
  await expect(reportRegion(page)).toContainText('You are viewing a saved snapshot.');
  await expect(page.getByRole('button',{name:'Save report',exact:true})).toHaveCount(0);
  const stored=await page.evaluate(() => JSON.parse(localStorage.getItem('pasion-watchlist:event-reviewer@example.com-event-research'))[0].snapshot);
  expect(stored.model.name).toBe('reported-event-evidence-v3');
  expect(stored.coverage.feed_successes).toBe(4);
  expect(stored.items).toHaveLength(20);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export report'}).click();
  expect((await download).suggestedFilename()).toBe('pasion-event-research.json');
});

test('storage failure is reported instead of showing an unsaved report as saved',async({page}) => {
  await page.addInitScript(() => {
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value) {if(key.endsWith('-event-research'))throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};
  });
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);await analyze(page);
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Your browser could not save this report.');
  await expect(page.locator('.ev-archive-list article')).toHaveCount(0);
});

test('mobile evidence is inside the viewport, traps focus and restores the opening control',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);await analyze(page);
  const opener=page.getByRole('button',{name:'View evidence: Gradual improvement',exact:true});
  await opener.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(845);
  for(let i=0;i<12;i++) {await page.keyboard.press('Tab');expect(await page.evaluate(() => !!document.activeElement.closest('dialog'))).toBe(true);}
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('mismatched API metadata is rejected instead of silently relabeling a result',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report({focus:'Japan'})}));
  await open(page);await page.getByRole('button',{name:'Analyze evidence'}).click();
  await expect(page.getByRole('alert')).toContainText('The response did not match');
  await expect(page.locator('.ev-scenario')).toHaveCount(0);
});

test('long-horizon empty results never invent probabilities or a baseline score',async({page}) => {
  await page.route('**/api/research/events/live?*',r => {
    const q=Object.fromEntries(new URL(r.request().url()).searchParams);
    return r.fulfill({json:{...report(q),status:'UNAVAILABLE',items:[],source_count:0,dynamic_scenarios:{ranked_scenarios:[]}}});
  });
  await open(page);
  await page.getByLabel('Research horizon',{exact:true}).selectOption('730 days');
  await page.getByRole('button',{name:'Analyze evidence'}).click();
  await expect(page.getByRole('heading',{name:'No recent, relevant reporting was found.'})).toBeVisible();
  await expect(reportRegion(page)).toContainText('Research horizon: 2 years');
  await expect(page.locator('.ev-score')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save report',exact:true})).toBeDisabled();
});

test('Vietnamese translates the research, meaning of the score and source dialog',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).first().selectOption('vi');
  await expect(page.getByRole('heading',{name:'Hiểu rõ những thay đổi có thể xảy ra.'})).toBeVisible();
  await page.getByRole('button',{name:'Phân tích bằng chứng',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chưa có xác suất được kiểm định'})).toBeVisible();
  await page.getByRole('button',{name:'Xem bằng chứng: Cải thiện từng bước',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Các nguồn tác động đến điểm số như thế nào');
});

test('dark mobile layout respects reduced motion and remains readable without overflow',async({page}) => {
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(() => localStorage.setItem('pasion-preferences',JSON.stringify({language:'en',theme:'dark'})));
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  const errors=[];page.on('pageerror',e => errors.push(e.message));
  await open(page);await analyze(page);
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('legacy saved snapshots remain readable without bringing back experimental percentages',async({page}) => {
  await page.addInitScript(() => localStorage.setItem('pasion-watchlist:event-reviewer@example.com-event-research',JSON.stringify([{
    id:'legacy',category:'Geopolitics',factor:'Conflict risk',focus:'Vietnam',horizon:'30 days',createdAt:'2026-10-22T01:00:00Z',saved:true,
    research:{status:'EVIDENCE_AVAILABLE',items:[{id:'old-source',title:'Original saved story',url:'https://example.org/original'}],
      dynamic_scenarios:{ranked_scenarios:[{id:'gradual',title:'Gradual improvement',experimental_probability:{probability_estimate:.724}}]}}
  }])));
  await open(page);
  await page.getByRole('button',{name:'Open saved report: Conflict risk, Vietnam'}).click();
  await expect(reportRegion(page)).toContainText('Older saved report. Experimental percentages are hidden');
  await expect(reportRegion(page)).not.toContainText('72.4%');
  await page.getByRole('button',{name:'All sources',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Original saved story');
});

test('malformed source data is rejected without crashing the workspace',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...report(),items:[null]}}));
  const errors=[];page.on('pageerror',e => errors.push(e.message));
  await open(page);await page.getByRole('button',{name:'Analyze evidence'}).click();
  await expect(page.getByRole('alert')).toContainText('The response did not match');
  expect(errors).toEqual([]);
});

test('all close reference estimates appear together with ranges and no forced winner',async({page}) => {
  const model=referenceModel();
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...report(),basis:'END_STATE',scenario_forecast:model}}));
  await open(page);await analyze(page);
  const comparison=page.getByRole('region',{name:'All scenario probabilities'});
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(3);
  await expect(comparison.locator('.ev-outcome-probability strong')).toHaveText(['33.3%','33.3%','33.3%']);
  await expect(comparison).toContainText('3 outcomes are within 3 percentage points');
  await expect(comparison.locator('.ev-close-label')).toHaveCount(3);
  await expect(comparison).toContainText('Total before rounding: 100.0%');
  await expect(comparison).toContainText('Historical reference-class estimates');
  await comparison.getByLabel('Display order').selectOption('probability');
  await expect(comparison.locator('.ev-outcome-probability strong')).toHaveText(['33.3%','33.3%','33.3%']);
  await comparison.getByText('Model, history and validation',{exact:true}).click();
  await expect(comparison).toContainText('Later holdout groups');
  await expect(comparison).toContainText('210');
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Open saved report: Conflict risk, Vietnam'}).click();
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(3);
});

test('a missing probability withholds the whole family rather than showing only the first scenario',async({page}) => {
  const model=referenceModel();delete model.probabilities['outcome-1'];
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...report(),scenario_forecast:model}}));
  await open(page);await analyze(page);
  await expect(page.getByRole('alert')).toContainText('All estimates are withheld together');
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
  await expect(page.locator('.ev-score strong')).toHaveText('+40');
});

test('overlapping events use separate marginals without forcing a total of 100 percent',async({page}) => {
  const model=referenceModel('event-occurrence-forecast');
  await page.route('**/api/research/events/live?*',r => {
    const q=Object.fromEntries(new URL(r.request().url()).searchParams);
    return r.fulfill({json:{...report(q),scenario_forecast:model}});
  });
  await open(page);
  await page.getByLabel('Probability basis',{exact:true}).selectOption('OCCURRENCE');
  await analyze(page);
  const comparison=page.getByRole('region',{name:'All scenario probabilities'});
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(2);
  await expect(comparison.locator('.ev-outcome-probability strong')).toHaveText(['69.9%','60.0%']);
  await expect(comparison).toContainText('Their probabilities do not need to add up to 100%');
  await expect(comparison).not.toContainText('Total before rounding');
});

test('the outcome family can change size and pending research paths remain visible together',async({page}) => {
  const model=referenceModel('event-seven-outcomes');
  const data=report();
  const first=data.dynamic_scenarios.ranked_scenarios[0];
  data.dynamic_scenarios.ranked_scenarios.push({...first,id:'unobserved',title:'A path without current evidence',evidence_score:null,sources:[],supporting_source_count:0,opposing_source_count:0});
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...data,scenario_forecast:model}}));
  await open(page);await analyze(page);
  await expect(page.getByRole('region',{name:'All scenario probabilities'}).locator('.ev-comparison-row')).toHaveCount(7);
  await expect(page.getByRole('heading',{name:'A path without current evidence'})).toBeVisible();
  await expect(page.locator('[data-scenario=unobserved]')).toContainText('Probability not estimated');
  await expect(page.locator('[data-scenario=unobserved]')).toBeVisible();
});

test('Vietnamese mobile comparison shows all ranges without horizontal overflow',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  const model=referenceModel();
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...report(),scenario_forecast:model}}));
  await open(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).first().selectOption('vi');
  await page.getByRole('button',{name:'Phân tích bằng chứng',exact:true}).click();
  const comparison=page.getByRole('region',{name:'Xác suất của toàn bộ kịch bản'});
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(3);
  await expect(comparison).toContainText('Các ước lượng gần nhau');
  await expect(comparison.locator('.ev-outcome-probability strong')).toHaveText(['33,3%','33,3%','33,3%']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('a complete historical forecast can be saved when no current news stories are available',async({page}) => {
  const model=referenceModel();
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:{...report(),status:'FORECAST_AVAILABLE',items:[],source_count:0,
    coverage:{status:'UNAVAILABLE',feed_successes:0,requests:0},dynamic_scenarios:{ranked_scenarios:[]},scenario_forecast:model}}));
  await open(page);await page.getByRole('button',{name:'Analyze evidence',exact:true}).click();
  await expect(page.getByRole('region',{name:'All scenario probabilities'}).locator('.ev-comparison-row')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Save report',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Report saved on this browser');
});

test('collected retrospective observations do not automatically become validated probabilities',async({page}) => {
  const data={...report(),outcome_history:{status:'COLLECTED_NEEDS_OUTCOME_REVIEW',point_in_time_ready:false,probability_model_ready:false,
    profiles:[{id:'vietnam-conflict',provider:'UCDP',metric:'GED_25.1',frequency:'EVENT_INTERVAL',observation_count:37,
      measurement:'Synthetic historical-coverage fixture; review is still required.'}]}};
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:data}));
  await open(page);await analyze(page);
  const context=page.getByRole('complementary',{name:'Research context'});
  await expect(context).toContainText('37 observations collected');
  await expect(context).toContainText('historical availability still need review');
  await expect(page.getByRole('heading',{name:'Probability is not available'})).toBeVisible();
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
});
