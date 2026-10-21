import React,{useEffect,useState} from 'react';
import {usePreferences} from './Preferences';
import './event-scenarios.scss';


const categories={
 'Banking & Credit':['Credit conditions','Bank lending','Central bank policy'],
 Business:['M&A activity','Earnings outlook','Hiring plans'],
 Consumer:['Consumer demand','Household spending','Consumer confidence'],
 Economy:['Inflation','GDP growth','Labor market'],
 Energy:['Oil supply','Natural gas','Energy prices'],
 Geopolitics:['Conflict risk','Sanctions','Trade disruption'],
 Health:['Drug approvals','Healthcare costs','Public health'],
 Markets:['Equity volatility','Market liquidity','Risk appetite'],
 'Politics & Policy':['Fiscal policy','Regulation','Trade policy'],
 'Real Estate':['Property prices','Mortgage rates','Commercial demand'],
 Science:['Research funding','Clinical progress','Technology adoption'],
 Technology:['AI adoption','Semiconductor supply','Cybersecurity'],
};

const recommendations=[
 {category:'Geopolitics',factor:'Conflict risk',focus:'Vietnam',title:'Conflict and regional risk',detail:'Track developments that could change regional stability.'},
 {category:'Energy',factor:'Oil supply',focus:'Global energy',title:'Oil supply and shipping',detail:'Explore supply routes, energy costs, and disruption risk.'},
 {category:'Economy',factor:'Inflation',focus:'United States',title:'Inflation and rates',detail:'Compare price pressure with central-bank policy.'},
 {category:'Consumer',factor:'Consumer demand',focus:'Global consumer',title:'Consumer demand',detail:'Consider spending, confidence, and demand signals.'},
];

const outcomes=[
 {key:'weakening',label:'WEAKENING / RISK',fallback:'Risk increases',direction:'↓',tone:'red'},
 {key:'mixed',label:'MIXED / UNCHANGED',fallback:'Risk stays elevated/mixed',direction:'→',tone:'amber'},
 {key:'supportive',label:'IMPROVING / SUPPORTIVE',fallback:'Risk eases',direction:'↑',tone:'green'},
];

function outcomeNames(factor){
 const key=factor.toLowerCase();
 if(key.includes('conflict')||key.includes('sanction'))return ['Risk increases','Risk stays elevated/mixed','Risk eases'];
 if(key.includes('inflation'))return ['Inflation accelerates','Inflation stays sticky','Inflation cools'];
 if(key.includes('rate')||key.includes('credit'))return ['Conditions tighten','Conditions stay mixed','Conditions ease'];
 if(key.includes('oil')||key.includes('energy')||key.includes('supply'))return ['Disruption deepens','Supply stays uncertain','Supply conditions improve'];
 if(key.includes('demand')||key.includes('growth'))return ['Demand weakens','Demand stays mixed','Demand improves'];
 return [factor+' worsens',factor+' stays mixed',factor+' improves'];
}

function readStudies(key){
 try{const saved=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(saved)?saved:[]}catch{return []}
}

export default function EventScenarios({storageKey='pasion-event-scenarios'}){
 const {t}=usePreferences();
 const savedKey=storageKey+'-event-research';
 const [category,setCategory]=useState('Geopolitics'),[factor,setFactor]=useState('Conflict risk');
 const [focus,setFocus]=useState('Vietnam'),[horizon,setHorizon]=useState('30 days');
 const [loading,setLoading]=useState(false),[result,setResult]=useState(null),[error,setError]=useState('');
 const [expanded,setExpanded]=useState('');
 const [studies,setStudies]=useState(()=>readStudies(savedKey));
 const [activeHistoryTab,setActiveHistoryTab]=useState('History');
 useEffect(()=>{try{localStorage.setItem(savedKey,JSON.stringify(studies))}catch{}},[savedKey,studies]);
 const names=outcomeNames(factor);
 const visibleStudies=activeHistoryTab==='Saved'?studies.filter(s=>s.saved):studies;
 function changeCategory(value){setCategory(value);setFactor(categories[value][0]);setResult(null);setError('');}
 async function runAnalysis(){
  setLoading(true);setError('');setResult(null);setExpanded('');
  const query=new URLSearchParams({category,factor,focus:focus.trim(),horizon});
  try{
   const response=await fetch('/api/research/events/live?'+query.toString(),{credentials:'same-origin'});
   const data=await response.json();
   if(!response.ok)throw Error(data.reason_code||data.message||'Research source unavailable');
   if(data.version!==1)throw Error('Invalid research response');
   setResult(data);
  }catch(exc){setError(exc.message||'News research unavailable');}
  finally{setLoading(false);}
 }
 function saveResearch(){
  if(!result||result.status!=='EVIDENCE_AVAILABLE')return;
  setStudies(s=>[{id:crypto.randomUUID(),category,factor,focus:focus.trim(),horizon,createdAt:result.generated_at,
   saved:true,note:'',observed:'unresolved',research:{status:result.status,outcomes:result.outcomes,
   items:result.items.map(x=>({title:x.title,url:x.url,source:x.source,published_at:x.published_at,weight:x.weight})),
   model:result.model,probability_status:result.probability_status}},...s]);
 }
 function updateStudy(id,key,value){setStudies(s=>s.map(x=>x.id===id?{...x,[key]:value}:x));}
 const ready=result?.status==='EVIDENCE_AVAILABLE';
 const outlook=ready?result.outcomes:[];
 const max=outlook.length?outlook.reduce((a,b)=>b.share_pct>a.share_pct?b:a):null;
 return <div className="analytics-page event-scenarios-page">
  <section className="home-card events-intro-card">
   <div><span className="events-eyebrow">{t('EVENT SCENARIOS · LIVE SOURCE RESEARCH')}</span>
    <h2>{t('Frame one question. Compare plausible outcomes.')}</h2>
    <p>{t('Evidence weighting based on recent published RSS stories. Shares describe research support, not statistically calibrated event probabilities.')}</p></div>
   <aside className="events-research-status"><strong>{t('RESEARCH STATUS')}</strong>
    <span>{loading?'Fetching current news…':ready?'Research evidence available · unreviewed news':result?.reason_code||error||'Run analysis to retrieve published evidence'}</span></aside>
  </section>
  <section className="home-card events-question-card">
   <div className="events-section-kicker">{t('01 · DEFINE EVENT QUESTION')}</div>
   <div className="events-question-grid">
    <label>{t('Investment category')}<select value={category} onChange={e=>changeCategory(e.target.value)}>{Object.keys(categories).map(k=><option key={k}>{t(k)}</option>)}</select></label>
    <label>{t('Specific factor')}<select value={factor} onChange={e=>{setFactor(e.target.value);setResult(null)}}>{categories[category].map(k=><option key={k}>{t(k)}</option>)}</select></label>
    <label>{t('Focus / region / entity')}<input list="pasion-event-regions" value={focus} maxLength={120} onChange={e=>{setFocus(e.target.value);setResult(null)}} placeholder="World / Asia / Vietnam / United States / company"/><datalist id="pasion-event-regions">{['World','Asia','Southeast Asia','Vietnam','United States','Europe','Middle East','Africa','Latin America'].map(x=><option value={x} key={x}/>)}</datalist></label>
    <label>{t('Research horizon')}<select value={horizon} onChange={e=>{setHorizon(e.target.value);setResult(null)}}>{['7 days','30 days','90 days','180 days'].map(v=><option key={v}>{v}</option>)}</select></label>
    <button className="events-run-button" type="button" disabled={loading} onClick={runAnalysis}>{loading?'Loading sources…':t('Run event analysis')} <span aria-hidden="true">→</span></button>
   </div>
   {!result&&!loading&&<div className="events-recommendations"><div className="events-recommendations-heading"><h3>{t('Recommended research prompts')}</h3></div><div className="events-topic-list">{recommendations.map(item=><button key={item.title} type="button" onClick={()=>{setCategory(item.category);setFactor(item.factor);setFocus(item.focus);setError('')}}><span className="events-topic-text"><strong>{t(item.title)}</strong><span>{t(item.detail)}</span></span></button>)}</div></div>}
  </section>
  {(error||result?.status==='UNAVAILABLE')&&<section className="home-card events-result-card" role="status">
   <h3>{t('Evidence not sufficient for a scenario share')}</h3>
   <p>{error||result?.reason_code||'No usable sources'}. {t('No equal baseline or invented percentage is shown.')}</p>
   {result?.items?.length>0&&<p>{result.items.length} recently published articles were found, but the minimum evidence rule was not met.</p>}
  </section>}
  {ready&&<>
   <section className="home-card events-result-card">
    <header className="events-result-heading"><div><span className="events-section-kicker">{t('EVIDENCE-WEIGHTED OUTLOOK')} · {t(category)} / {t(factor)}</span>
     <h2>{max?.share_pct>40?outcomes.find(x=>x.key===max.id)?.label:'Mixed evidence / no clear leader'}</h2>
     <p>{factor} · {focus||'Global'} · {horizon} · {new Date(result.generated_at).toLocaleString()}</p></div>
     <div className="events-result-actions"><div className="events-share-total"><strong>100%</strong><span>{t('RELATIVE EVIDENCE SHARES')}</span></div><button className="events-save-button" onClick={saveResearch}>☆ {t('Save this sourced research')}</button></div></header>
    <div className="events-kpi-grid">
     <article><span>{t('EVIDENCE')}</span><strong>{result.source_count}</strong><small>{t('unique story clusters')} · {result.coverage?.region||focus}</small></article>
     <article><span>{t('FEED COVERAGE')}</span><strong>{result.coverage?.feed_successes??'—'} / {result.coverage?.requests??'—'}</strong><small>{t('successful source queries')}</small></article><article><span>{t('INDEPENDENT SOURCES')}</span><strong>—</strong><small>{t('Not established')}</small></article>
     <article><span>{t('EVIDENCE QUALITY')}</span><strong>{t('Unverified')}</strong><small>{t('RSS headlines & snippets')}</small></article>
     <article><span>{t('PROBABILITY')}</span><strong>—</strong><small>{t('Not calibrated')}</small></article>
    </div>
    <div className="events-outlook-heading"><h3>{t('Scenario comparison — evidence shares')}</h3><p>{t('Weighted by recency, topical relevance and directional language. These are not forecast probabilities.')}</p></div>
    <div className="events-outcomes">{outcomes.map((item,index)=>{
      const observed=outlook.find(x=>x.id===item.key);const pct=observed?.share_pct??null;
      return <article className={'events-outcome-card tone-'+item.tone} key={item.key}><header><div><span className="events-outcome-label"><b aria-hidden="true">{item.direction}</b>{t(item.label)}</span><h4>{t(names[index])}</h4></div><strong>{pct===null?'—':pct.toFixed(1)+'%'}</strong></header>
       <div className="events-share-bar"><i style={{width:(pct??0)+'%'}}/></div>
       <p className="events-outcome-explanation">Research weight based on {observed?.evidence_count??0} unique story clusters with aligned wording. Lexical direction can be wrong; verify original articles.</p>
       <button type="button" className="events-inspect-button" onClick={()=>setExpanded(expanded===item.key?'':item.key)} aria-expanded={expanded===item.key}>Inspect source details</button>
       {expanded===item.key&&<div className="events-no-drivers">{result.items.filter(x=>item.key==='weakening'?x.direction<-.1:item.key==='supportive'?x.direction>.1:Math.abs(x.direction)<=.1).slice(0,5).map(x=><p key={x.id}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> · {x.source} · {new Date(x.published_at).toLocaleDateString()}</p>)}</div>}
      </article>})}</div>
   </section>
   <section className="home-card events-logic-card"><h3>Methodology and limitations</h3><p>Scope: {result.coverage?.region||'Not established'} · Results collected: {result.coverage?.raw_results??'—'} · Feeds: {(result.coverage?.providers||[]).join(', ')||'Unavailable'}</p>
    <p>Adapted from SolvAI58: deduplicated recent news, topical relevance, freshness and directional language. The model is deterministic, evidence-weighted and uncalibrated; it does not predict a verified outcome or generate trading instructions. All feed items are unreviewed proxies.</p>
    <p>Independent confirmation, official source verification and historical calibration remain unavailable. Missing evidence is not a 33.3% probability.</p>
   </section>
   <section className="home-card events-evidence-card"><header><div><span className="events-section-kicker">SOURCE EVIDENCE</span><h3>Published articles and source weights</h3></div><span className="events-count-pill">{result.items.length} surfaced</span></header>
    {result.items.map(x=><article key={x.id} style={{padding:'12px 0',borderBottom:'1px solid #e3eaf0'}}><a href={x.url} target="_blank" rel="noopener noreferrer"><strong>{x.title}</strong> ↗</a><p>{x.source} · {new Date(x.published_at).toLocaleString()} · Relevance {x.relevance} · Model weight {x.weight} · Direction {x.direction}</p><small>{x.description}</small></article>)}
   </section>
  </>}
  <section className="home-card events-forecast-lab"><header className="events-lab-heading"><div><span className="events-section-kicker">FORECAST LAB</span><h3>Research archive (browser local)</h3><p>Save an immutable source snapshot for later review. Archived weights are not calibrated forecasts.</p></div><div className="events-history-tabs" role="tablist"><button type="button" role="tab" aria-selected={activeHistoryTab==='History'} onClick={()=>setActiveHistoryTab('History')}>History</button><button type="button" role="tab" aria-selected={activeHistoryTab==='Saved'} onClick={()=>setActiveHistoryTab('Saved')}>Saved ({studies.filter(s=>s.saved).length})</button></div></header>
   <div className="events-history-list">{visibleStudies.map(s=><article key={s.id} className="events-history-item"><header><div><strong>{s.factor} · {s.focus}</strong><p>{new Date(s.createdAt).toLocaleString()} · {s.horizon}</p><small>Uncalibrated source snapshot</small></div><div className="events-history-actions"><button onClick={()=>updateStudy(s.id,'saved',!s.saved)}>{s.saved?'★':'☆'}</button><button onClick={()=>setStudies(cur=>cur.filter(x=>x.id!==s.id))}>×</button></div></header>{s.research?.items?.length>0&&<details><summary>Source snapshot · {s.research.items.length} stories</summary>{s.research.items.map(x=><p key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></p>)}</details>}<label>Research note <input value={s.note||''} onChange={e=>updateStudy(s.id,'note',e.target.value)}/></label></article>)}</div>
  </section>
 </div>;
}
