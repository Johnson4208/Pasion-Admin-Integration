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
  await expect(page.getByRole('heading',{name:'Compare end-of-period outcomes.'})).toBeVisible();
}
async function analyze(page) {
  await expect(page.getByRole('heading',{name:'Gradual improvement',exact:true})).toBeVisible();
}
const reportRegion = page => page.getByRole('region',{name:'Scenario research report'});

test.beforeEach(async({page}) => {
  await page.route('**/api/research/events/forecast-options',r => r.fulfill({json:{version:1,profiles:[]}}));
  await page.route('**/api/session',r => r.fulfill({json:{authenticated:true,isAdmin:false,user:{name:'Event Reviewer',email:'event-reviewer@example.com'}}}));
  await page.route('**/api/research/company/**',r => r.fulfill({json:{status:'UNAVAILABLE'}}));
});

test('evidence starts in the background; a pathway, not the report, opens its full source trace',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);
  await expect(page.getByRole('heading',{name:'Research pathways',exact:true})).toBeVisible();
  await expect(page.locator('.ev-supporting-research')).not.toHaveAttribute('open');
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
  const pending=await intercepted;
  await page.getByLabel('Region / entity').fill('Japan');
  await pending.fulfill({json:report()}).catch(() => {});
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
  await expect(page.getByRole('heading',{name:'So sánh kết quả ở cuối kỳ.'})).toBeVisible();
  await page.getByRole('button',{name:'Phân tích bằng chứng',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Chưa thể ước tính xác suất'})).toBeVisible();
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
  await expect(page.getByRole('button',{name:'All sources',exact:true})).toHaveCount(0);
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
  await expect(page.locator('[data-scenario=unobserved] .ev-score strong')).toHaveText('—');
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
  await page.locator('.ev-supporting-research > summary').click();
  const context=page.getByRole('complementary',{name:'Research context'});
  await expect(context).toContainText('37 observations collected');
  await expect(context).toContainText('historical availability still need review');
  await expect(page.getByRole('heading',{name:'Probability is not available'})).toBeVisible();
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
});

test('collection diagnostics distinguish retrieved news, filtering, regional evidence and outcome observations',async({page}) => {
  let archiveCalls=0;
  await page.route('**/api/research/events/agent?*',r => {archiveCalls++;return r.fulfill({json:{status:'AGENT_NOT_INITIALIZED'}});});
  await page.route('**/api/research/news',r => {archiveCalls++;return r.fulfill({json:{articles:[]}});});
  const data={...report(),scope_source_count:0,
    filter_diagnostics:{retrieved:120,accepted:20,stale:42,duplicate:31,off_topic:25,future:1,invalid:1},
    coverage:{raw_results:120,requests:5,feed_successes:3,
      feed_failures:[{provider:'GDELT DOC 2.0',reason:'NEWS_HTTP_429'},{provider:'Google News RSS',edition:'VN',reason:'NEWS_NETWORK_OR_PROVIDER_ERROR'}],
      request_results:[{provider:'Google News RSS',edition:'US',status:'SUCCESS',returned_count:65},{provider:'GDELT DOC 2.0',status:'FAILED',returned_count:0}]},
    outcome_history:{status:'NOT_COLLECTED',profiles:[{id:'vietnam-conflict',provider:'UCDP',frequency:'EVENT_INTERVAL',observation_count:0}]}};
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:data}));
  await open(page);await analyze(page);
  await page.locator('.ev-supporting-research > summary').click();
  const status=page.getByRole('region',{name:'News collection status',exact:true});
  await expect(status.locator('.ev-collection-counts dd')).toHaveText(['120','20','0']);
  await expect(status).toContainText('Zero outcome observations does not mean no news was collected');
  await status.getByText('Collection and filtering details',{exact:true}).click();
  await expect(status.locator('.ev-collection-details dl dd')).toHaveText(['120','20','42','31','25','1','1']);
  await expect(status).toContainText('Google News RSS · US');
  await expect(status).toContainText('Provider returned HTTP 429');
  await expect(status).toContainText('Provider could not be reached');
  await expect(page.getByRole('complementary',{name:'Research context'})).toContainText('0 observations collected');
  expect(archiveCalls).toBe(0);
});

test('stored collector reporting opens explicitly without promoting old scores or changing live counts',async({page}) => {
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  const older=Array.from({length:13},(_,i) => ({id:'old-'+i,title:'Stored historical article '+(i+1),
    url:'https://example.org/archive/'+i,source:'Saved publisher',published_at:'2020-04-01T00:00:00Z'}));
  const version={id:7,created_at:'2020-04-02T00:00:00Z',snapshot:{...report(),items:older,
    calibrated_probability:true,bayesian_forecast:{posterior:{first:.99,second:.01}}}};
  await page.route('**/api/research/events/agent?*',r => r.fulfill({json:{status:'TRACKING',latest:version,versions:[version],
    last_poll:{checked_at:'2020-04-02T00:00:00Z',status:'NEW_REVISION'}}}));
  await page.route('**/api/research/news',r => r.fulfill({json:{articles:[{id:'broader',title:'A stored company filing about another topic',provider:'Permitted publisher',url:'https://example.org/company',published_at:'2021-01-01T00:00:00Z'}]}}));
  await open(page);await analyze(page);
  const archive=page.getByRole('region',{name:'Previously collected reporting',exact:true});
  await expect(archive.getByText('Stored historical article 1',{exact:true})).toHaveCount(0);
  await archive.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect(archive).toContainText('13 stored articles available');
  await expect(archive.getByRole('link',{name:'Stored historical article 1 ↗',exact:true})).toHaveAttribute('href','https://example.org/archive/0');
  await expect(archive).toContainText('2020');
  await expect(archive.getByText('Stored historical article 13',{exact:true})).toHaveCount(0);
  await archive.getByRole('button',{name:/Show more collected articles/}).click();
  await expect(archive.getByRole('link',{name:'Stored historical article 13 ↗',exact:true})).toBeVisible();
  await archive.getByRole('button',{name:'Read Company News library',exact:true}).click();
  await expect(archive.getByRole('link',{name:'A stored company filing about another topic ↗'})).toBeVisible();
  await expect(archive).toContainText('across broader topics');
  await expect(page.locator('.ev-score strong')).toHaveText('+40');
  await expect(page.getByRole('region',{name:'News collection status',exact:true}).locator('.ev-collection-counts dd')).toHaveText(['Not recorded','20','20']);
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
  await expect(archive).not.toContainText('99.0%');
});

test('stored reporting remains accessible when all live feeds fail and failure counts stay separate',async({page}) => {
  let attempts=0;
  await page.route('**/api/research/events/live?*',r => {
    attempts++;
    return attempts === 1 ? r.fulfill({json:report()}) : r.fulfill({status:503,json:{coverage:{raw_results:0,requests:5,feed_successes:0,
      feed_failures:[{provider:'Google News RSS',reason:'NEWS_HTTP_403'}],request_results:[{provider:'Google News RSS',status:'FAILED',returned_count:0}]}}});
  });
  await page.route('**/api/research/news',r => r.fulfill({json:{articles:[{id:'stored',title:'Reporting saved before the outage',url:'https://example.org/stored'}]}}));
  await open(page);await analyze(page);
  await page.getByRole('button',{name:'Analyze evidence',exact:true}).click();
  const failure=page.getByRole('region',{name:'Latest failed news search',exact:true});
  await expect(failure).toContainText('Provider returned HTTP 403');
  await expect(failure).toContainText('0 / 5');
  await expect(page.getByRole('region',{name:'News collection status',exact:true}).locator('.ev-collection-counts dd')).toHaveText(['Not recorded','20','20']);
  const archive=page.getByRole('region',{name:'Previously collected reporting',exact:true});
  await archive.getByRole('button',{name:'Read Company News library',exact:true}).click();
  await expect(archive.getByRole('link',{name:'Reporting saved before the outage ↗'})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Analyze evidence',exact:true}).click();
  await expect(page.getByRole('region',{name:'Latest failed news search',exact:true})).toContainText('Provider returned HTTP 403');
  await page.getByRole('region',{name:'Previously collected reporting',exact:true}).getByRole('button',{name:'Read Company News library',exact:true}).click();
  await expect(page.getByRole('link',{name:'Reporting saved before the outage ↗'})).toBeVisible();
});

test('changing the research context cancels an old archive request instead of relabeling its articles',async({page}) => {
  let release,started=false,finished=false;
  const gate=new Promise(resolve => {release=resolve;});
  await page.route('**/api/research/events/agent?*',async r => {
    const q=Object.fromEntries(new URL(r.request().url()).searchParams);
    if(q.focus==='Vietnam') {started=true;await gate;}
    const version={id:1,created_at:'2020-01-01T00:00:00Z',snapshot:{...report(q),items:[{id:q.focus,title:q.focus+' stored reporting',url:'https://example.org/'+q.focus}]}};
    await r.fulfill({json:{status:'TRACKING',latest:version,versions:[version]}}).catch(()=>{});
    if(q.focus==='Vietnam')finished=true;
  });
  await open(page);
  await page.locator('.ev-supporting-research > summary').click();
  await page.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect.poll(()=>started).toBe(true);
  await page.getByLabel('Region / entity',{exact:true}).fill('Japan');
  await page.locator('.ev-supporting-research > summary').click();
  await page.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect(page.getByRole('link',{name:'Japan stored reporting ↗'})).toBeVisible();
  release();
  await expect.poll(()=>finished).toBe(true);
  await expect(page.getByText('Vietnam stored reporting',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Previously collected reporting',exact:true})).toContainText('Archive articles retain their dates');
});

test('archive states distinguish missing data, missing watch, sign-in failure and an empty broader library',async({page}) => {
  let reads=0;
  await page.route('**/api/research/events/agent?*',r => {
    reads++;
    return reads===3 ? r.fulfill({status:401,json:{message:'Authentication required'}}) : r.fulfill({json:{status:reads===1?'AGENT_NOT_INITIALIZED':'WATCH_NOT_CONFIGURED',latest:null,versions:[]}});
  });
  await page.route('**/api/research/news',r => r.fulfill({json:{articles:[]}}));
  await open(page);
  await page.locator('.ev-supporting-research > summary').click();
  const archive=page.getByRole('region',{name:'Previously collected reporting',exact:true});
  await archive.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect(archive).toContainText('No collector archive is available in this version.');
  await archive.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect(archive).toContainText('no saved watch for this exact factor, region and horizon');
  await archive.getByRole('button',{name:'Read collector archive',exact:true}).click();
  await expect(archive.getByRole('alert')).toHaveText('Sign in again to read previously collected reporting.');
  await archive.getByRole('button',{name:'Read Company News library',exact:true}).click();
  await expect(archive).toContainText('No stored articles were found here.');
  await expect(archive).toContainText('recover its data before checking again');
});

test('Vietnamese mobile collection diagnostics keep unknown counts distinct from zero',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/research/events/live?*',r => r.fulfill({json:report()}));
  await open(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).first().selectOption('vi');
  await page.getByRole('button',{name:'Phân tích bằng chứng',exact:true}).click();
  const status=page.getByRole('region',{name:'Trạng thái thu thập tin tức',exact:true});
  await expect(status.locator('.ev-collection-counts dd')).toHaveText(['Chưa được ghi nhận','20','20']);
  await status.getByText('Chi tiết thu thập và lọc tin',{exact:true}).click();
  await expect(status.locator('.ev-collection-details dl dd')).toHaveText(Array(7).fill('Chưa được ghi nhận'));
  await expect(page.getByRole('button',{name:'Mở kho tin của bộ thu thập',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

const seriesModel=() => referenceModel('event-series-forecast');
const researchEnvelope=model => ({version:1,...model.context,status:'FORECAST_AVAILABLE',generated_at:model.as_of,
  scenario_forecast:model,forecast_recording:{id:'synthetic-test-ledger',status:'PENDING'},evidence_status:'NOT_REQUESTED',
  items:[],source_count:0,dynamic_scenarios:{ranked_scenarios:[]},coverage:{status:'NOT_REQUESTED'},calibrated_probability:false});
async function mockResearchOptions(page) {
  await page.route('**/api/research/events/forecast-options',r => r.fulfill({json:{version:1,profiles:[
    {id:'us-volatility',label:'Equity volatility · United States',category:'Markets',factor:'Equity volatility',focus:'United States',supported_horizons:['1 day','3 days','7 days','30 days','90 days']},
    {id:'us-mortgages',label:'Mortgage rates · United States',category:'Real Estate',factor:'Mortgage rates',focus:'United States',supported_horizons:['7 days','30 days','90 days']},
  ]}}));
}

test('automatic probability shortcut starts a full probability group while evidence continues in the background',async({page}) => {
  await mockResearchOptions(page);const newsQueries=[];let posted;
  await page.route('**/api/research/events/live?*',r => {const live=Object.fromEntries(new URL(r.request().url()).searchParams);newsQueries.push(live);return r.fulfill({json:report(live)});});
  await page.route('**/api/research/events/forecast',r => {posted=r.request().postDataJSON();return r.fulfill({json:researchEnvelope(seriesModel())});});
  await open(page);
  await expect(page.getByLabel('Region / entity',{exact:true})).toHaveValue('Vietnam');
  await page.getByRole('button',{name:'Equity volatility · United States',exact:true}).click();
  await expect(page.getByLabel('Region / entity',{exact:true})).toHaveValue('United States');
  const comparison=page.getByRole('region',{name:'All scenario probabilities'});
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(5);
  await expect(comparison.locator('.ev-outcome-probability strong')).toHaveText(['5.2%','10.1%','69.4%','10.1%','5.2%']);
  await expect(comparison).toContainText('Total before rounding: 100.0%');
  await expect(comparison).toContainText('Current reference observation');
  await expect(comparison).toContainText('Forecast origin');
  await expect(comparison).toContainText('End of the selected period');
  await expect(comparison).toContainText('This forecast was recorded before its end date');
  await expect(page.locator('.ev-supporting-research')).not.toHaveAttribute('open');
  await expect.poll(() => newsQueries.some(live => live.focus === 'United States')).toBe(true);
  expect(posted).toEqual(seriesModel().context);
  await comparison.getByText('Model, history and validation',{exact:true}).click();
  await expect(comparison).toContainText('Historical check only; future calibration not established');
  await expect(comparison.getByRole('link',{name:'FRED ↗'})).toHaveAttribute('href','https://fred.stlouisfed.org/series/VIXCLS');
  await expect(page.getByRole('heading',{name:'Research pathways',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View evidence: Gradual improvement',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('20 articles available');
  await page.getByRole('button',{name:'Close evidence',exact:true}).click();
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Open saved report: Equity volatility, United States'}).click();
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(5);
});

test('unsupported questions retain their context and name every missing requirement without invented percentages',async({page}) => {
  await mockResearchOptions(page);let posted;
  await page.route('**/api/research/events/forecast',r => {
    posted=r.request().postDataJSON();
    return r.fulfill({json:{...researchEnvelope(seriesModel()),...posted,status:'UNAVAILABLE',scenario_forecast:{status:'UNSUPPORTED_CONTEXT',context:posted,
      missing_requirements:['MEASURABLE_OUTCOME_DEFINITION','SOURCE_DATA','HISTORICAL_MODEL'],probabilities:null,scenarios:[]}}});
  });
  await open(page);await page.getByRole('button',{name:'Calculate scenario probabilities',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Probability is not available',exact:true})).toBeVisible();
  await expect(page.locator('.ev-missing-requirements li')).toHaveText(['A measurable, complete outcome definition','A connected historical source','A historical model for this question']);
  await expect(page.getByLabel('Region / entity',{exact:true})).toHaveValue('Vietnam');
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
  expect(posted.focus).toBe('Vietnam');
});

test('invalid primary research distribution withholds every number together',async({page}) => {
  await mockResearchOptions(page);const model=seriesModel();delete model.probabilities.fall;
  await page.route('**/api/research/events/forecast',r => r.fulfill({json:researchEnvelope(model)}));
  await open(page);await page.getByRole('button',{name:'Equity volatility · United States',exact:true}).click();
  await page.getByRole('button',{name:'Calculate scenario probabilities',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('All estimates are withheld together');
  await expect(page.getByRole('region',{name:'All scenario probabilities'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save report',exact:true})).toBeDisabled();
});

test('Vietnamese mobile research estimates show uncertainty without overflow',async({page}) => {
  await page.setViewportSize({width:390,height:844});await mockResearchOptions(page);
  await page.route('**/api/research/events/forecast',r => r.fulfill({json:researchEnvelope(seriesModel())}));
  await open(page);await page.getByRole('button',{name:'Equity volatility · United States',exact:true}).click();
  await page.getByRole('combobox',{name:'Language',exact:true}).first().selectOption('vi');
  await page.getByRole('button',{name:'Tính xác suất kịch bản',exact:true}).click();
  const comparison=page.getByRole('region',{name:'Xác suất của toàn bộ kịch bản'});
  await expect(comparison.locator('.ev-comparison-row')).toHaveCount(5);
  await expect(comparison).toContainText('Khoảng 95%');
  await expect(comparison).toContainText('Quan sát làm mốc hiện tại');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
