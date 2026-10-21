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
 const ready=result?.status==='EVIDENCE_AVAILABLE';
 const ranked=result?.dynamic_scenarios?.ranked_scenarios||[];
 const oldRanked=previousResult?.dynamic_scenarios?.ranked_scenarios||[];
 const probabilityAllowed=Boolean(result?.bayesian_forecast?.status==='CALIBRATED_MODEL_ELIGIBLE');
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
   dynamic_scenarios:result.dynamic_scenarios,probability_status:result.probability_status}},...s]);
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
  <section className="home-card events-result-card events-ranking-shell" aria-label="Scenario ranking" aria-busy={loading}>
   <div className="events-ranking-heading"><div><span className="events-section-kicker">SCENARIO OUTLOOK / {term==='short'?'SHORT-TERM':'LONG-TERM'}</span><h2>Ranked scenario pathways</h2>
    <p>{factor} · {focus||'World'} · {HORIZONS[term].find(x=>x[0]===horizon)?.[1]}</p></div>
    <div className="events-ranking-actions"><span className="events-model-flag">{probabilityAllowed?'Model-validated probability':'Probability not calibrated'}</span>
      <button type="button" onClick={()=>setEvidenceOpen({id:null,sources:result?.items||[]})} disabled={!result?.items?.length}>Evidence <span aria-hidden="true">↗</span></button>
      <button type="button" disabled={!ready} onClick={saveResearch}>Save research</button>
    </div></div>
   <div className="events-ranking-stats"><div><span>Eligible stories</span><strong>{result?.source_count??'—'}</strong></div><div><span>Feed coverage</span><strong>{result?.coverage?.feed_successes!=null?result.coverage.feed_successes+'/'+result.coverage.requests:'—'}</strong></div><div><span>Model</span><strong>{probabilityAllowed?'Validated':'Research only'}</strong></div><div><span>Last analyzed</span><strong>{result?.generated_at?new Date(result.generated_at).toLocaleString():'—'}</strong></div></div>
   <div className="events-ranked-list">
    {(ranked.length?ranked:Array.from({length:10},(_,i)=>({id:'pending-'+i,rank:i+1,title:'Awaiting research',status:'PENDING_EVIDENCE',sources:[],support_index:null}))).map(sc=>{
      const old=oldRanked.find(x=>x.id===sc.id);
      const p=probabilityAllowed?result.bayesian_forecast.posterior?.[sc.id]:null;
      const delta=old?.support_index!=null&&sc.support_index!=null?Math.round(100*(sc.support_index-old.support_index)):null;
      return <article key={sc.id} className="events-ranked-item">
       <span className="events-rank-number">{String(sc.rank).padStart(2,'0')}</span>
       <div className="events-rank-main"><div className="events-rank-heading"><div><strong>{sc.title}</strong><p>{sc.definition||'Start an analysis to evaluate this pathway.'}</p></div><span className="events-rank-value">{typeof p==='number'?(p*100).toFixed(1)+'%':'—'}</span></div>
        <div className="events-ranked-track" role="img" aria-label={typeof p==='number'?'Calibrated probability '+(p*100).toFixed(1)+' percent':'Calibrated probability unavailable'}><i style={{width:typeof p==='number'?Math.max(0,Math.min(100,p*100))+'%':'0%'}}/></div>
        <div className="events-rank-foot"><span>{typeof p==='number'?'Model probability':sc.status==='PENDING_EVIDENCE'?'Awaiting relevant evidence':'Probability pending validation'} · {sc.supporting_source_count||0} linked sources {delta===null?'':' · evidence change '+(delta>0?'+':'')+delta+' pts'}</span>
         <button type="button" onClick={()=>setEvidenceOpen({id:sc.id,title:sc.title,sources:sc.sources||[]})}>Evidence <span aria-hidden="true">↗</span></button></div>
       </div>
      </article>;
    })}
   </div>
   <p className="events-ranked-note">Probabilities are shown only for scenarios supported by a validated outcome model. Unverified article weights are never relabeled as probabilities. Paths may overlap and do not have to total 100%.</p>
   {loading&&<div className="events-loading-overlay" role="status" aria-live="polite"><div className="events-loading-spinner" aria-hidden="true"/><strong>Analyzing new evidence</strong><span>Retrieving sources and comparing scenario pathways…</span></div>}
  </section>
  {result?.status==='UNAVAILABLE'&&!loading&&<p className="events-muted-notice">{result.reason_code||'Insufficient relevant news'}. Scenario probabilities are withheld.</p>}
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
