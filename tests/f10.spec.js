import {test,expect} from '@playwright/test';
test('F10 saves explicit judgment weights without fabricated evidence or probabilities',async({page})=>{
 await page.route('**/api/session',r=>r.fulfill({json:{authenticated:true,isAdmin:false,user:{name:'F10',email:'f10@example.com'}}}));
 await page.route('**/api/research/events/evidence*',r=>r.fulfill({json:{version:1,claims:[]}}));
 let saved=null;
 await page.route('**/api/research/events',r=>{if(r.request().method()==='POST'){saved=r.request().postDataJSON();return r.fulfill({json:{version:1,study:{...saved,id:'version-1'}}});}return r.fulfill({json:{version:1,studies:[],resolutions:[]}});});
 await page.goto('/');await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Event Scenarios',exact:true}).click();
 const events=page.locator('.event-research');await expect(events).toContainText('Probability unavailable');await expect(events).not.toContainText('33.3%');
 for(const [label,value] of [['question','Will demand improve?'],['event definition','Demand threshold'],['focus','Japan'],['cluster id','growth-2027']])await events.getByLabel(label,{exact:true}).fill(value);
 await events.getByLabel('Outcome maturity',{exact:true}).fill('2027-01-01T12:00');
 for(let i=1;i<=3;i++){for(const key of ['name','resolution_rule','condition','assumption'])await events.getByLabel(`${key} ${i}`,{exact:true}).fill(`${key} ${i}`);}
 await events.getByRole('button',{name:'Save evidence-led scenario version'}).click();await expect(events).toContainText('Saved immutable research version');
 expect(saved.outcomes.every(o=>o.weight===null&&o.evidence.length===0)).toBe(true);
 await page.getByLabel('Event data mode').selectOption('sample');await expect(page.locator('.events-intro-card')).toContainText('No live research source is connected');
});
