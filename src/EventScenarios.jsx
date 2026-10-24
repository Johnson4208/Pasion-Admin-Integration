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

const HORIZONS={short:[['1 day','1 day'],['3 days','3 days'],['7 days','1 week'],['30 days','1 month'],['90 days','3 months']],long:[['180 days','6 months'],['365 days','1 year'],['730 days','2 years']]};
export default function EventScenarios({storageKey='pasion-event-scenarios'}){
 const {t}=usePreferences();
 const [category,setCategory]=useState('Geopolitics'),[factor,setFactor]=useState('Conflict risk'),[focus,setFocus]=useState('Vietnam');
 const [term,setTerm]=useState('short'),[horizon,setHorizon]=useState('30 days');
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [evidenceOpen,setEvidenceOpen]=useState(null),[previousResult,setPreviousResult]=useState(null);
 const [studies,setStudies]=useState(()=>readStudies(storageKey+'-event-research'));
 const [savedOnly,setSavedOnly]=useState(false);
 const key=storageKey+'-event-research';
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(studies))}catch{}},[key,studies]);
 useEffect(()=>{
  if(!evidenceOpen)return;
  const onKey=e=>{if(e.key==='Escape')setEvidenceOpen(null)};
  window.addEventListener('keydown',onKey);
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=old};
 },[evidenceOpen]);
 const showExpanded=loading||result!==null;
 const presentation=result?.scenario_presentation;
 const historical=presentation?.type==='HISTORICAL_REFERENCE'&&presentation?.status==='HISTORICAL_REFERENCE_ESTIMATE';
 const scenarioDistribution=result?.dynamic_scenarios?.scenario_distribution;
 const hasEligibleNews=(result?.items||[]).some(item=>['DIRECT_SCOPE','GLOBAL_SCOPE'].includes(item.geographic_relation));
 const researchAvailable=scenarioDistribution?.status==='NORMALIZED_EXPERIMENTAL_UNCALIBRATED'&&hasEligibleNews;
 const normalizedReady=historical||researchAvailable;
 const ranked=historical?presentation.rows:(result?.dynamic_scenarios?.ranked_scenarios||[]);
 const oldRanked=previousResult?.dynamic_scenarios?.ranked_scenarios||[];
 const ready=normalizedReady;
 const researchQuality=scenarioDistribution?.quality==='LIMITED'?'Limited evidence':'Research estimate';
 const statusLabel=historical?'Historical baseline':researchAvailable?researchQuality:'Not calculated';
 const noEligible=!!result&&!loading&&!normalizedReady;
 function changeTerm(value){setTerm(value);setHorizon(value==='short'?'30 days':'180 days');setResult(null);setError('');}
 function changeCategory(value){setCategory(value);setFactor(categories[value][0]);setResult(null);}
 async function runAnalysis(){
  if(loading)return;
  setLoading(true);setError('');setEvidenceOpen(null);
  const query=new URLSearchParams({category,factor,focus:focus.trim(),horizon});
  try{
   const r=await fetch('/api/research/events/live?'+query,{credentials:'same-origin'});
   const d=await r.json();
   if(!r.ok)throw Error(d.reason_code||d.message||'Sources currently unavailable');
   if(d.version!==1)throw Error('Unexpected response version');
   setPreviousResult(result?.category===category&&result?.factor===factor&&result?.focus===focus&&result?.horizon===horizon?result:null);
   setResult(d);
  }catch(e){setError(e?.message||'Unable to retrieve news');}
  finally{setLoading(false);}
 }
 function saveResearch(){
  if(!ready)return;
  setStudies(s=>[{id:crypto.randomUUID(),category,factor,focus,horizon,createdAt:result.generated_at,saved:true,note:'',
   research:{status:result.status,items:result.items,outcomes:result.outcomes,
   dynamic_scenarios:result.dynamic_scenarios,scenario_presentation:result.scenario_presentation,probability_status:result.probability_status}},...s]);
 }
 function updateStudy(id,field,value){setStudies(s=>s.map(x=>x.id===id?{...x,[field]:value}:x));}
 const evidenceItems=evidenceOpen?.id?evidenceOpen.sources:result?.items||[];
 return <div className="analytics-page event-scenarios-page events-refined">
  <section className="home-card events-intro-card">
   <div><span className="events-eyebrow">PASION / EVENT INTELLIGENCE</span><h2>Dynamic Scenario Forecasting</h2>
    <p>Track plausible economic paths with sourced evidence, separate forecast horizons and clear model eligibility.</p></div>
   <aside className="events-research-status"><strong>DATA INTEGRITY</strong><span>{loading?'Updating evidence…':ready?'Published-source research · unverified':'Awaiting a sourced analysis'}</span></aside>
  </section>
  <section className="home-card events-question-card">
   <div className="events-section-kicker">RESEARCH CONFIGURATION</div>
   <div className="events-question-grid">
    <label>Category<select value={category} onChange={e=>changeCategory(e.target.value)}>{Object.keys(categories).map(x=><option key={x}>{t(x)}</option>)}</select></label>
    <label>Factor<select value={factor} onChange={e=>{setFactor(e.target.value);setResult(null)}}>{categories[category].map(x=><option key={x}>{t(x)}</option>)}</select></label>
    <label>Region / entity<input value={focus} onChange={e=>{setFocus(e.target.value);setResult(null)}} maxLength={120} list="event-region-hints"/><datalist id="event-region-hints">{['World','Asia','Southeast Asia','Vietnam','United States','Europe','Middle East'].map(x=><option value={x} key={x}/>)}</datalist></label>
    <div className="events-term-controls"><span>Forecast horizon</span><div role="group" aria-label="Forecast horizon type" className="events-term-tabs"><button type="button" aria-pressed={term==='short'} className={term==='short'?'active':''} onClick={()=>changeTerm('short')}>Short-term</button><button type="button" aria-pressed={term==='long'} className={term==='long'?'active':''} onClick={()=>changeTerm('long')}>Long-term</button></div><select aria-label="Forecast duration" value={horizon} onChange={e=>{setHorizon(e.target.value);setResult(null)}}>{HORIZONS[term].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
    <button type="button" className="events-run-button" disabled={loading} onClick={runAnalysis}>{loading?'Analyzing…':'Analyze'} <span aria-hidden="true">→</span></button>
   </div>
  </section>
  {error&&<section role="alert" className="home-card events-error">Source research unavailable: {error}</section>}
  <section className={'home-card events-result-card events-ranking-shell'+(!showExpanded?' events-ranking-compact':'')} aria-label="Scenario ranking" aria-busy={loading}>
   <div className="events-ranking-heading"><div><span className="events-section-kicker">SCENARIO OUTLOOK / {term==='short'?'SHORT-TERM':'LONG-TERM'}</span><h2>Ranked scenario pathways</h2>
    <p>{factor} · {focus||'World'} · {HORIZONS[term].find(x=>x[0]===horizon)?.[1]}</p></div>
    {showExpanded&&<div className="events-ranking-actions"><span className="events-model-flag">{statusLabel}</span>
      <button type="button" onClick={()=>setEvidenceOpen({id:null,sources:result?.items||[]})} disabled={!result?.items?.length}>Evidence <span aria-hidden="true">↗</span></button>
      <button type="button" disabled={!ready} onClick={saveResearch}>Save research</button>
    </div>}</div>
   {!showExpanded&&<div className="events-initial-summary" role="status"><div className="events-initial-value"><strong>0%</strong><span>Not calculated</span></div><p>Choose your research settings and select <strong>Analyze</strong> to reveal the scenario ranking.</p></div>}
   {showExpanded&&<>
   {noEligible&&<div className="events-empty-diagnostic" role="status"><strong>{scenarioDistribution?.status==='WITHHELD_CONCENTRATED_EVIDENCE'?'Evidence leans strongly one way — probability not validated':'Not enough evidence to calculate'}</strong><p>{scenarioDistribution?.status==='WITHHELD_CONCENTRATED_EVIDENCE'?'The evidence is too concentrated to calculate reliable scenario percentages. All 10 pathways remain below for review; their 0% labels mean not calculated. Open Evidence for sources.':'The 10 candidate pathways remain available below for inspection. 0% means not calculated, not impossible.'}</p></div>}
   <div className="events-ranked-list">
    {(ranked.length?ranked:Array.from({length:10},(_,i)=>({id:'pending-'+i,rank:i+1,title:'Awaiting research',status:'PENDING_EVIDENCE',sources:[],support_index:null}))).map(sc=>{
      const old=oldRanked.find(x=>x.id===sc.id);
      const p=normalizedReady?(sc.scenario_share_percent??0):0;
      const estimated=normalizedReady&&(historical?sc.scenario_share_status==='HISTORICAL_REFERENCE_ESTIMATE':sc.scenario_share_status==='NORMALIZED_EXPERIMENTAL_UNCALIBRATED');
      const delta=old?.support_index!=null&&sc.support_index!=null?Math.round(100*(sc.support_index-old.support_index)):null;
      return <article key={sc.id} className="events-ranked-item">
       <span className="events-rank-number">{String(sc.rank).padStart(2,'0')}</span>
       <div className="events-rank-main"><div className="events-rank-heading"><div><strong>{sc.title}</strong><p>{sc.definition||'Start an analysis to evaluate this pathway.'}</p></div><span className="events-rank-value" title={historical?'Historical reference-class outcome frequency, not guaranteed future performance':estimated?'Uncalibrated relative news-evidence share, not event probability.':'Not calculated — 0% display placeholder.'}>{estimated?p.toFixed(1)+'%'+(historical?'':'*'):'0%'}</span></div>
        <div className="events-ranked-track" role="img" aria-label={estimated?(historical?'Historical reference estimate ':'Research share ')+p.toFixed(1)+' percent':'Not calculated; 0 percent is a display placeholder, not an event probability'}><i style={{width:estimated?Math.max(0,Math.min(100,p))+'%':'0%'}}/></div>
        <div className="events-rank-foot"><span>{estimated?(historical?'Based on reviewed historical outcomes':(researchQuality+' · uncalibrated')):noEligible?'Probability not calculated':'Not calculated'}{historical?'': ' · '+(sc.supporting_source_count||0)+' supporting sources'} {delta===null||historical||noEligible?'':' · revised '+(delta>0?'+':'')+delta+' pts'}</span>
         {!historical&&<button type="button" onClick={()=>setEvidenceOpen({id:sc.id,title:sc.title,sources:sc.sources||[]})}>Evidence <span aria-hidden="true">↗</span></button>}</div>
       </div>
      </article>;
    })}
   </div>
   {normalizedReady&&<div className="events-distribution-total" role="status"><span>Total</span><strong>{(historical?presentation.total_percent:scenarioDistribution.total_percent).toFixed(1)}%</strong></div>}
   {normalizedReady&&<p className="events-ranked-note">{historical?'Historical reference, not a guarantee of future results.':'* Research shares are not validated event probabilities. Total 100% represents only a relative allocation of supporting news.'}</p>}
   {noEligible&&<p className="events-ranked-note">0% is a display placeholder while probability is not calculated; source counts are evidence, not event likelihoods. Scenarios are listed for inspection, not ranked by probability.</p>}
   </>}
   {loading&&<div className="events-loading-overlay" role="status" aria-live="polite"><div className="events-loading-spinner" aria-hidden="true"/><strong>Analyzing new evidence</strong><span>Retrieving sources and comparing scenario pathways…</span></div>}
  </section>
  {result?.status==='UNAVAILABLE'&&!loading&&!historical&&<p className="events-muted-notice">{result.reason_code||'Insufficient relevant news'}. Scenario probabilities are withheld.</p>}
  <section className="home-card events-forecast-lab"><header className="events-lab-heading"><div><span className="events-section-kicker">RESEARCH ARCHIVE</span><h3>Saved investigations</h3><p>Local saved reports, separate from the independent public-news agent.</p></div><div className="events-history-tabs"><button aria-pressed={!savedOnly} onClick={()=>setSavedOnly(false)}>All</button><button aria-pressed={savedOnly} onClick={()=>setSavedOnly(true)}>Saved ({studies.filter(x=>x.saved).length})</button></div></header>
   <div className="events-history-list">{studies.filter(x=>!savedOnly||x.saved).map(s=><article className="events-history-item" key={s.id}><header><div><strong>{s.factor} · {s.focus}</strong><p>{s.horizon} · {s.createdAt?new Date(s.createdAt).toLocaleString():'Date unavailable'}</p></div><div className="events-history-actions"><button onClick={()=>updateStudy(s.id,'saved',!s.saved)}>{s.saved?'★':'☆'}</button><button onClick={()=>setStudies(x=>x.filter(item=>item.id!==s.id))}>×</button></div></header></article>)}</div>
  </section>
  {evidenceOpen&&<div className="events-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEvidenceOpen(null)}}><div role="dialog" aria-modal="true" aria-labelledby="events-evidence-title" className="events-evidence-modal">
    <div className="events-modal-heading"><div><span className="events-section-kicker">RESEARCH EVIDENCE</span><h2 id="events-evidence-title">{evidenceOpen.title||'Published articles and source weights'}</h2><p>Original-source verification may be incomplete. Entries describe published evidence, not a confirmed outcome.</p></div><button type="button" className="events-modal-close" aria-label="Close evidence" onClick={()=>setEvidenceOpen(null)}>×</button></div>
    <div className="events-modal-toolbar"><span>{evidenceItems.length} linked articles</span><span>Source trace / relevance / publish time</span></div>
    <div className="events-evidence-scroll">{evidenceItems.length?evidenceItems.map((x,i)=><article key={x.id||x.url||i} className="events-evidence-row"><span className="events-evidence-number">{String(i+1).padStart(2,'0')}</span><div><a target="_blank" rel="noopener noreferrer" href={x.url}>{x.title||'Original article'} ↗</a><p>{x.source||'Source unavailable'} · {x.published_at?new Date(x.published_at).toLocaleString():'Date unverified'}</p><small>{x.description||'No full-text excerpt available'}{x.relevance!=null?' · Relevance '+x.relevance:''}{x.weight!=null?' · Evidence weight '+x.weight:''}</small></div></article>):<div className="events-empty-evidence">No individually linked articles for this scenario.</div>}</div>
   </div></div>}
 </div>;
}
