import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {usePreferences} from './Preferences';
import {HORIZONS, queryKey, readStudies, referenceForecast, seriesForecast, studySnapshot, evidenceScore, sourceUrl} from './eventScenarios.js';
import EventScenarioComparison from './EventScenarioComparison.jsx';
import EventSourceStatus from './EventSourceStatus.jsx';
import './event-scenarios.scss';

const categories = {
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
const initialQuery = {category:'Geopolitics', factor:'Conflict risk', focus:'Vietnam', horizon:'30 days', basis:'END_STATE'};
const roles = {SUPPORTS:'Supports this pathway', CHALLENGES:'Challenges this pathway', CONTEXT:'Context only'};
const scopes = {DIRECT_SCOPE:'Direct regional evidence', GLOBAL_SCOPE:'Global evidence',
  EXTERNAL_CONTEXT:'External context', UNVERIFIED_SCOPE:'Regional relevance unconfirmed'};

function Arrow({up = false}) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={up?'M6 18 18 6M6 6h12v12':'M4 12h16m-6-6 6 6-6 6'}/></svg>;
}
function ResearchIcon() {
  return <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M8 11h32v28H8zM15 6v10m18-10v10M8 21h32m-23 8h5m5 0h5m-15 5h5"/><circle cx="35" cy="35" r="8" fill="var(--ev-surface)"/><path d="m41 41 5 5"/></svg>;
}

function EvidenceDialog({result, scenario, onClose, t, formatDate}) {
  const ref = useRef(null);
  const [filter, setFilter] = useState('ALL');
  const [limit, setLimit] = useState(12);
  const sources = (scenario ? scenario.sources : result.items) || [];
  const filtered = sources.filter(s => filter === 'ALL' || s.evidence_role === filter);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('button').focus();
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      if (opener?.isConnected) opener.focus({preventScroll:true});
    };
  }, []);
  return createPortal(<dialog ref={ref} className="events-evidence-dialog" aria-modal="true" aria-labelledby="events-evidence-title"
    onCancel={event => {event.preventDefault(); onClose();}}
    onClick={event => {if (event.target === event.currentTarget) onClose();}}>
    <header className="ev-dialog-header">
      <div><span className="ev-kicker">{t('Source notebook')}</span><h2 id="events-evidence-title">{scenario ? t(scenario.title) : t('All research sources')}</h2>
        <p>{t('Published reporting, not independently verified outcomes.')}</p></div>
      <button type="button" className="ev-icon-button" onClick={onClose} aria-label={t('Close evidence')}>×</button>
    </header>
    <div className="ev-dialog-content">
      {scenario && <div className="ev-method-note"><strong>{t('How these sources affect the score')}</strong><p>{t('Supporting weight minus challenging weight, divided by all regional evidence weight. The score runs from −100 to +100; it is not a probability.')}</p>
        <span>{t('Supporting weight')}: {scenario.support_weight ?? '—'} · {t('Challenging weight')}: {scenario.opposition_weight ?? '—'} · {t('Total regional weight')}: {scenario.total_weight ?? '—'}</span></div>}
      <div className="ev-source-toolbar"><strong>{t('{count} articles available', {count:sources.length})}</strong>
        {scenario && <div role="group" aria-label={t('Filter evidence')} className="ev-source-filters">
          {[['ALL','All'],['SUPPORTS','Supporting'],['CHALLENGES','Challenging'],['CONTEXT','Context']].map(([key,label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => {setFilter(key); setLimit(12);}}>{t(label)}{key !== 'ALL' && <span>{sources.filter(s => s.evidence_role === key).length}</span>}</button>)}
        </div>}
      </div>
      <div className="ev-source-list">
        {filtered.slice(0,limit).map((source,i) => {
          const url = sourceUrl(source.url);
          return <article key={source.id || source.url || i} className="ev-source-row">
            <span className="ev-source-number">{String(i+1).padStart(2,'0')}</span>
            <div><div className="ev-source-tags">{scenario && <span data-role={source.evidence_role}>{t(roles[source.evidence_role] || 'Context only')}</span>}{source.geographic_relation && <span>{t(scopes[source.geographic_relation] || 'Regional relevance unconfirmed')}</span>}</div>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title || t('Original article')} <Arrow up/></a> : <strong>{source.title || t('Original article')}</strong>}
              <p className="ev-source-meta">{source.source || t('Source unavailable')} · {t(source.time_basis === 'FIRST_SEEN' ? 'First seen' : 'Published')} {formatDate(source.published_at)}</p>
              <p>{source.description || t('No excerpt was supplied by the publisher.')}</p>
              <small>{t('Evidence weight')}: {Number.isFinite(source.weight) ? source.weight.toFixed(3) : '—'}{Number.isFinite(source.contribution) && <> · {t('Score contribution weight')}: {source.contribution > 0 ? '+' : ''}{source.contribution.toFixed(3)}</>}{source.direction_status && <> · {t('Reported direction')}: {t(source.direction_status === 'DIRECTIONAL' ? source.direction > 0 ? 'Improving' : 'Worsening' : source.direction_status === 'NEUTRAL' ? 'Unchanged' : 'Unclear')}</>}</small>
            </div>
          </article>;
        })}
        {!filtered.length && <p className="ev-inline-empty">{t('No articles in this group.')}</p>}
      </div>
      {filtered.length > limit && <button type="button" className="ev-secondary ev-load-more" onClick={() => setLimit(n => n+12)}>{t('Show more sources')} ({filtered.length-limit})</button>}
    </div>
    <footer className="ev-dialog-footer">{t('Story count does not establish independent sources. External or unconfirmed regional context does not contribute to the score.')}</footer>
  </dialog>, document.body);
}

export default function EventScenarios({storageKey = 'pasion-event-scenarios'}) {
  const {t, language} = usePreferences();
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCoverage,setErrorCoverage] = useState(null);
  const [savedView, setSavedView] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const [notice, setNotice] = useState('');
  const [supportOpen,setSupportOpen] = useState(false);
  const [forecastOptions,setForecastOptions] = useState([]);
  const [optionsError,setOptionsError] = useState('');
  const key = storageKey+'-event-research';
  const [studies, setStudies] = useState(() => readStudies(key));
  const [savedOnly, setSavedOnly] = useState(false);
  const forecastRequest = useRef({id:0, controller:null});
  const evidenceRequest = useRef({id:0, controller:null});
  const archiveRef = useRef(null);
  const reportRef = useRef(null);
  const term = HORIZONS.long.some(([value]) => value === query.horizon) ? 'long' : 'short';

  useEffect(() => {
    const controller=new AbortController();
    let disposed=false;
    const timeout=setTimeout(() => controller.abort(),15000);
    fetch('/api/research/events/forecast-options',{credentials:'same-origin',signal:controller.signal})
      .then(async response => {
        if (!response.ok) throw Error();
        const data=await response.json();
        if (data?.version !== 1 || !Array.isArray(data.profiles) || data.profiles.some(profile => !profile ||
            ['id','category','factor','focus'].some(key => typeof profile[key] !== 'string') ||
            !Array.isArray(profile.supported_horizons) || profile.supported_horizons.some(horizon => typeof horizon !== 'string'))) throw Error();
        if (!controller.signal.aborted) setForecastOptions(data.profiles.map(profile => ({...profile,label:typeof profile.label === 'string' ? profile.label : profile.factor+' · '+profile.focus})));
      }).catch(() => {if (!disposed) setOptionsError('Available forecast questions could not be loaded. You can still calculate the selected question or retry later.');})
      .finally(() => clearTimeout(timeout));
    return () => {disposed=true;clearTimeout(timeout);controller.abort();};
  },[]);

  function cancelForecast() {
    forecastRequest.current.controller?.abort();
    forecastRequest.current = {id:forecastRequest.current.id+1, controller:null};
  }
  function cancelEvidence() {
    evidenceRequest.current.controller?.abort();
    evidenceRequest.current = {id:evidenceRequest.current.id+1, controller:null};
  }
  function cancelRequests() {
    cancelForecast();
    cancelEvidence();
  }
  useEffect(() => {
    cancelRequests();
    setStudies(readStudies(key));
    setResult(null); setSavedView(false); setForecastLoading(false); setEvidenceLoading(false); setEvidence(null); setError(''); setErrorCoverage(null); setNotice('');
    return cancelRequests;
  }, [key]);

  function formatDate(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.valueOf()) ? /^\d{4}-\d{2}-\d{2}$/.test(value) ? date.toLocaleDateString(language, {dateStyle:'medium',timeZone:'UTC'}) : date.toLocaleString(language, {dateStyle:'medium', timeStyle:'short'}) : t('Date unavailable');
  }
  function duration(value) {
    return t(Object.values(HORIZONS).flat().find(([key]) => key === value)?.[1] || value || 'Date unavailable');
  }
  function changeQuery(update) {
    cancelForecast();
    cancelEvidence();
    setQuery(current => ({...current, ...update}));
    setResult(null); setSavedView(false); setForecastLoading(false); setEvidenceLoading(false); setError(''); setErrorCoverage(null); setEvidence(null); setNotice('');
    setSupportOpen(false);
  }
  async function runAnalysis(event, background = false) {
    event?.preventDefault();
    cancelEvidence();
    const requested = {...query, focus:query.focus.trim() || 'World'};
    const controller = new AbortController();
    const id = evidenceRequest.current.id;
    evidenceRequest.current.controller = controller;
    setEvidenceLoading(true);
    if (!background) {setError(''); setErrorCoverage(null); setEvidence(null); setNotice(''); setSavedView(false);}
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/research/events/live?'+new URLSearchParams(requested), {credentials:'same-origin', signal:controller.signal});
      const data = await response.json();
      if (evidenceRequest.current.id !== id) return;
      if (response.status === 503 && data?.coverage && typeof data.coverage === 'object' && !Array.isArray(data.coverage)) {
        setErrorCoverage({coverage:data.coverage,context:requested});
      }
      if (!response.ok) throw Error(response.status === 401 ? 'Your session has expired. Sign in again.' : response.status === 400 ? 'Check the region or entity and try again.' : 'News sources could not be reached. Please try again shortly.');
      if (data.version !== 1 || queryKey(data) !== queryKey(requested) || !Array.isArray(data.items) ||
          data.items.some(s => !s || typeof s !== 'object') || !Array.isArray(data.dynamic_scenarios?.ranked_scenarios) ||
          data.dynamic_scenarios.ranked_scenarios.some(s => !s || typeof s.id !== 'string' || !Array.isArray(s.sources)) ||
          !['EVIDENCE_AVAILABLE','FORECAST_AVAILABLE','UNAVAILABLE'].includes(data.status)) throw Error('The response did not match this research. Please try again.');
      setResult(previous => {
        if (!previous || queryKey(previous) !== queryKey(requested) || !previous.scenario_forecast) return data;
        const model = previous.scenario_forecast;
        return {...data, status:['REFERENCE_ESTIMATE_AVAILABLE','RESEARCH_ESTIMATE_AVAILABLE'].includes(model.status) ? 'FORECAST_AVAILABLE' : data.status,
          scenario_forecast:model, forecast_recording:previous.forecast_recording || data.forecast_recording};
      });
    } catch (failure) {
      if (evidenceRequest.current.id !== id) return;
      setError(failure.name === 'AbortError' ? 'Background evidence collection timed out. You can refresh it later.' : failure instanceof TypeError || failure instanceof SyntaxError ? 'Background evidence sources could not be reached. You can refresh them later.' : failure.message);
    } finally {
      clearTimeout(timeout);
      if (evidenceRequest.current.id === id) {evidenceRequest.current.controller = null; setEvidenceLoading(false);}
    }
  }
  async function runForecast(event, requestedOverride = null) {
    event?.preventDefault();
    if (forecastLoading) return;
    cancelForecast();
    const requested={...(requestedOverride || query),focus:(requestedOverride?.focus || query.focus).trim() || 'World'};
    const controller=new AbortController(), id=forecastRequest.current.id;
    forecastRequest.current.controller=controller;
    setForecastLoading(true);setError('');setErrorCoverage(null);setEvidence(null);setNotice('');setSavedView(false);setSupportOpen(false);
    const timeout=setTimeout(() => controller.abort(),60000);
    try {
      const response=await fetch('/api/research/events/forecast',{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify(requested)});
      const data=await response.json();
      if (forecastRequest.current.id !== id) return;
      if (!response.ok) throw Error(response.status === 401 ? 'Your session has expired. Sign in again.' : response.status === 400 ?
        'Check the forecast question and horizon, then try again.' : 'The forecast could not be prepared. Please try again.');
      if (data?.version !== 1 || queryKey(data) !== queryKey(requested) || !Array.isArray(data.items) ||
          data.items.some(item => !item || typeof item !== 'object') ||
          !Array.isArray(data.dynamic_scenarios?.ranked_scenarios) ||
          data.dynamic_scenarios.ranked_scenarios.some(row => !row || typeof row.id !== 'string' || !Array.isArray(row.sources)) ||
          !data.scenario_forecast ||
          !['FORECAST_AVAILABLE','UNAVAILABLE'].includes(data.status)) throw Error('The forecast response did not match this question. Please try again.');
      setResult(previous => {
        if (!previous || queryKey(previous) !== queryKey(requested) || previous.evidence_status === 'NOT_REQUESTED') return data;
        return {...previous, ...data, items:previous.items, outcomes:previous.outcomes, source_count:previous.source_count,
          dynamic_scenarios:previous.dynamic_scenarios, coverage:previous.coverage, outcome_history:previous.outcome_history,
          evidence_status:previous.evidence_status || 'AVAILABLE'};
      });
    } catch (failure) {
      if (forecastRequest.current.id !== id) return;
      setError(failure.name === 'AbortError' ? 'Preparing the forecast timed out. Try again; the earlier report has not changed.' :
        failure instanceof TypeError || failure instanceof SyntaxError ? 'The forecast could not be prepared. Please try again.' : failure.message);
    } finally {
      clearTimeout(timeout);
      if (forecastRequest.current.id === id) {forecastRequest.current.controller=null;setForecastLoading(false);}
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => runAnalysis(null, true), 350);
    return () => clearTimeout(timer);
  }, [query.category, query.factor, query.focus, query.horizon, query.basis]);
  function persist(next, success) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStudies(next); setNotice(success);
      return true;
    } catch {setNotice('Your browser could not save this report. Free up storage and try again.'); return false;}
  }
  const currentReport = result && queryKey(result) === queryKey(query);
  const canSave = currentReport && (result.status === 'EVIDENCE_AVAILABLE' || !!referenceForecast(result) || !!seriesForecast(result)) && !savedView && !forecastLoading && !error;
  function saveResearch() {
    if (!canSave) return;
    const same = studies.find(s => s.snapshot && queryKey(s.snapshot) === queryKey(result) && s.snapshot.generated_at === result.generated_at);
    if (same) {setNotice('This report is already saved.'); return;}
    persist([{id:crypto.randomUUID(), schema_version:2, category:result.category, factor:result.factor, focus:result.focus,
      horizon:result.horizon, basis:result.basis || 'END_STATE', createdAt:result.generated_at, savedAt:new Date().toISOString(), saved:true,
      snapshot:JSON.parse(JSON.stringify(result))}, ...studies], 'Report saved on this browser.');
  }
  function openStudy(study) {
    const snapshot = studySnapshot(study);
    if (!snapshot) {setNotice('This older entry has no report content. Run a new analysis.'); return;}
    cancelRequests(); setForecastLoading(false); setEvidenceLoading(false); setError(''); setErrorCoverage(null); setNotice(''); setEvidence(null);
    setResult(snapshot); setSavedView(true);
    setSupportOpen(!seriesForecast(snapshot) && !referenceForecast(snapshot));
    requestAnimationFrame(() => reportRef.current?.scrollIntoView({block:'start', behavior:'instant'}));
  }
  function exportReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'pasion-event-research.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const allScenarios = result?.dynamic_scenarios?.ranked_scenarios?.filter(s => s.horizon_eligible !== false) || [];
  const ranked = allScenarios.filter(s => evidenceScore(s) !== null);
  const forecast = seriesForecast(result) || referenceForecast(result);
  const invalidForecast = ['REFERENCE_ESTIMATE_AVAILABLE','RESEARCH_ESTIMATE_AVAILABLE'].includes(result?.scenario_forecast?.status) && !forecast;
  const newsRequested = result && result.evidence_status !== 'NOT_REQUESTED';
  const selectedProfile=forecastOptions.find(profile => profile.category === query.category && profile.factor === query.factor && profile.focus.toLowerCase() === (query.focus.trim() || 'World').toLowerCase());
  const forecastStatus=result?.scenario_forecast?.status;
  const unavailableMessage={
    UNSUPPORTED_CONTEXT:'This question needs a measurable outcome definition and historical coverage before its probabilities can be estimated.',
    UNSUPPORTED_HORIZON:'The available history does not support this forecast horizon. Choose a supported horizon or another question.',
    INSUFFICIENT_HISTORY:'There are not enough completed historical periods to estimate and check this full outcome group.',
    SOURCE_UNAVAILABLE:'The historical source could not be reached. Retry the calculation when the source is available.',
    STALE_SOURCE:'The latest source observation is too old for a current estimate. Newer historical data is needed.',
    RESEARCH_NOT_PREPARED:'Calculate this question to collect its historical series and prepare a research estimate.',
  }[forecastStatus] || 'This question needs a measurable outcome definition and historical coverage before its probabilities can be estimated.';
  const missingLabels={MEASURABLE_OUTCOME_DEFINITION:'A measurable, complete outcome definition',SOURCE_DATA:'A connected historical source',HISTORICAL_MODEL:'A historical model for this question',END_STATE_BASIS:'Select the end-of-period probability basis',SUPPORTED_HORIZON:'A supported forecast horizon',COMPATIBLE_MEASUREMENT_FREQUENCY:'A horizon compatible with the source frequency',FRESH_SOURCE_OBSERVATION:'A newer source observation',AT_LEAST_20_TRAINING_AND_10_HOLDOUT_PERIODS:'At least 20 training periods and 10 later evaluation periods',PREPARE_RESEARCH_ESTIMATE:'Calculate the research estimate',RETRY_PREPARATION_LATER:'Retry when the source is available',VALID_SOURCE_DATA_AND_WRITABLE_PRIVATE_STORE:'Valid source data and a writable private store'};
  const missingRequirements = Array.isArray(result?.scenario_forecast?.missing_requirements) ? result.scenario_forecast.missing_requirements.filter(code => Object.hasOwn(missingLabels,code)) : [];
  const articles = result?.items || [];
  const localArticles = articles.filter(s => !['EXTERNAL_CONTEXT','UNVERIFIED_SCOPE'].includes(s.geographic_relation));
  const directionCounts = [localArticles.filter(s => s.direction_status === 'DIRECTIONAL' && s.direction < 0).length,
    localArticles.filter(s => s.direction_status === 'DIRECTIONAL' && s.direction > 0).length,
    localArticles.filter(s => s.direction_status !== 'DIRECTIONAL').length];

  function renderScenario(scenario, index) {
    const score = evidenceScore(scenario);
    return <article className="ev-scenario" key={scenario.id} data-scenario={scenario.id}>
      <span className="ev-rank">{String(index+1).padStart(2,'0')}</span>
      <div className="ev-scenario-copy"><h3>{t(scenario.title)}</h3><p>{t(scenario.definition)}</p>
        <div className="ev-scenario-counts"><span><i className="ev-dot ev-support"/>{scenario.supporting_source_count || 0} {t('supporting')}</span><span><i className="ev-dot ev-challenge"/>{scenario.opposing_source_count || 0} {t('challenging')}</span></div>
      </div>
      <div className="ev-score" data-tone={score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'}>
        <strong>{score === null ? '—' : (score > 0 ? '+' : '')+score}</strong><span>{t('Evidence balance')}</span>
        {score !== null && <div className="ev-balance" aria-hidden="true"><i style={{width:Math.abs(score)/2+'%', insetInlineStart:(score < 0 ? 50-Math.abs(score)/2 : 50)+'%'}}/></div>}
      </div>
      <button type="button" className="ev-source-button" aria-label={t('View evidence: {title}', {title:t(scenario.title)})} onClick={() => setEvidence({scenario})}>{t('Evidence')} <Arrow up/></button>
    </article>;
  }

  return <div className="analytics-page event-scenarios-page events-workspace">
    <header className="ev-intro"><div><span className="ev-kicker">{t('SCENARIO PROBABILITIES')}</span><h2>{t('Compare end-of-period outcomes.')}</h2><p>{t('One question, one horizon, every outcome shown together.')}</p></div>
      <button type="button" className="ev-secondary ev-archive-jump" onClick={() => archiveRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})}>{t('Saved reports')} <span>{studies.length}</span></button>
    </header>
    <form className="ev-configuration" onSubmit={runForecast} aria-label={t('Research configuration')}>
      <label>{t('Category')}<select value={query.category} onChange={event => changeQuery({category:event.target.value, factor:categories[event.target.value][0]})}>{Object.keys(categories).map(x => <option value={x} key={x}>{t(x)}</option>)}</select></label>
      <label>{t('Factor')}<select value={query.factor} onChange={event => changeQuery({factor:event.target.value})}>{categories[query.category].map(x => <option value={x} key={x}>{t(x)}</option>)}</select></label>
      <label>{t('Region / entity')}<input value={query.focus} onChange={event => changeQuery({focus:event.target.value})} maxLength={70} list="event-region-hints" placeholder={t('World')}/><datalist id="event-region-hints">{['World','Asia','Southeast Asia','Vietnam','United States','Europe','Middle East'].map(x => <option value={x} key={x}/>)}</datalist></label>
      <label>{t('Research horizon')}<select aria-label={t('Research horizon')} value={query.horizon} onChange={event => changeQuery({horizon:event.target.value})}>{Object.entries(HORIZONS).map(([group, values]) => <optgroup label={t(group === 'short' ? 'Short-term' : 'Long-term')} key={group}>{values.map(([value,label]) => <option value={value} key={value}>{t(label)}</option>)}</optgroup>)}</select></label>
      <label>{t('Probability basis')}<select aria-label={t('Probability basis')} value={query.basis} onChange={event => changeQuery({basis:event.target.value})}><option value="END_STATE">{t('State at the end of the period')}</option><option value="OCCURRENCE">{t('Occurs at least once during the period')}</option></select></label>
      <div className="ev-forecast-actions"><button type="submit" className="ev-primary" disabled={forecastLoading}>{forecastLoading ? t('Preparing probabilities…') : t('Calculate scenario probabilities')} <Arrow/></button>
        <button type="button" className="ev-secondary" disabled={evidenceLoading} onClick={() => runAnalysis()}>{evidenceLoading ? t('Analyzing…') : t('Analyze evidence')}</button></div>
      <p className="ev-configuration-note">{t('Compare every defined outcome at the end of the selected period. Research estimates include uncertainty and retrospective checks; future calibration is not established.')}</p>
      {!!forecastOptions.length && <div className="ev-quick-profiles" aria-label={t('Automatic probability questions')}><strong>{t('Try an automatic probability question')}</strong><span>{t('These questions use a defined public historical series. Your current question is kept until you choose one.')}</span><div>{forecastOptions.map(profile => {
        const next={category:profile.category,factor:profile.factor,focus:profile.focus,horizon:profile.supported_horizons.includes(query.horizon) ? query.horizon : profile.supported_horizons[0] || query.horizon,basis:'END_STATE'};
        return <button type="button" className="ev-secondary" key={profile.id} disabled={forecastLoading} onClick={() => {changeQuery(next); runForecast(null,next);}}>{t(profile.label)} <Arrow/></button>;
      })}</div></div>}
    </form>
    {error && <div className="ev-alert" role="alert"><strong>{t(error)}</strong>{result && <p>{t('Update failed. The previous report is shown below with its original date and sources.')}</p>}</div>}
    {notice && <p className="ev-save-notice" role="status">{t(notice)}</p>}
    <section ref={reportRef} className="ev-report" aria-label={t('Scenario research report')} aria-busy={forecastLoading || evidenceLoading}>
      {forecastLoading && <div className="ev-loading" role="status"><span className="ev-spinner" aria-hidden="true"/><div><strong>{t('Preparing the complete probability group')}</strong><p>{t('Collecting the historical series, resolving completed periods and checking later outcomes.')}</p></div></div>}
      {evidenceLoading && <div className="ev-background-status" role="status"><span className="ev-spinner" aria-hidden="true"/>{t('Evidence is updating in the background.')}</div>}
      {result && <>
        <header className="ev-report-header"><div><span className="ev-kicker">{t(savedView ? 'SAVED REPORT' : error ? 'PREVIOUS REPORT' : forecast ? 'PROBABILITY OUTLOOK' : 'EVIDENCE OUTLOOK')}</span><h2>{t(result.factor)} <span>·</span> {t(result.focus || 'World')}</h2><p>{t('Research horizon')}: {duration(result.horizon)} <span>·</span> {formatDate(result.generated_at)}</p><p>{t((result.basis || 'END_STATE') === 'END_STATE' ? 'State at the end of the period' : 'Occurs at least once during the period')}</p></div>
          <div className="ev-report-actions">{savedView ? <button type="button" className="ev-secondary" onClick={exportReport}>{t('Export report')}</button> : <button type="button" className="ev-primary ev-save-button" disabled={!canSave} onClick={saveResearch}>{t('Save report')}</button>}
          </div></header>
        {savedView && <div className="ev-saved-banner"><span>{t(result.legacy_snapshot ? 'Older saved report. Experimental percentages are hidden; run a new analysis for the current evidence method.' : 'You are viewing a saved snapshot. Its sources and date have not been refreshed.')}</span><button type="button" onClick={() => changeQuery({category:categories[result.category] ? result.category : query.category, factor:result.factor, focus:result.focus, horizon:result.horizon, basis:result.basis || 'END_STATE'})}>{t('Use these settings')} <Arrow/></button></div>}
      </>}
      {invalidForecast && <p className="ev-comparison-invalid" role="alert">{t('This probability set is incomplete or invalid. All estimates are withheld together; no partial distribution is shown.')}</p>}
      {forecast ? <EventScenarioComparison recording={result.forecast_recording} key={forecast.family_id+forecast.definition_version+queryKey(result)} model={forecast} t={t} language={language} formatDate={formatDate}/> :
        <section className="ev-forecast-unavailable" aria-label={t('Forecast readiness')}>
          <span className="ev-kicker">{t(result ? 'FORECAST STATUS' : 'START WITH A MEASURABLE QUESTION')}</span>
          <h3>{t(result ? 'Probability is not available' : 'Compare the complete outcome group')}</h3>
          <p>{t(result ? unavailableMessage : selectedProfile ? 'The selected question has a public historical series. Calculate it to prepare an estimate and inspect its limitations.' :
            'This question needs a measurable outcome definition and historical coverage before its probabilities can be estimated.')}</p>
          {!!missingRequirements.length && <div className="ev-missing-requirements"><h4>{t('Still needed for this question')}</h4><ul>{missingRequirements.map(code => <li key={code}>{t(missingLabels[code])}</li>)}</ul></div>}
          {query.basis === 'OCCURRENCE' && <p>{t('The automatic research estimator currently covers end-of-period states. Supporting news remains available for occurrence questions.')}</p>}
          {selectedProfile && <p>{t('Available horizons')}: {selectedProfile.supported_horizons.map(duration).join(' · ')}</p>}
          {optionsError && <p className="ev-options-error">{t(optionsError)}</p>}
        </section>}
      {newsRequested && <section className="ev-evidence-overview" aria-label={t('Evidence pathways')}>
        <header><div><span className="ev-kicker">{t('BACKGROUND EVIDENCE')}</span><h3>{t('Research pathways')}</h3><p>{t('Evidence is collected in the background. Select a pathway to inspect its complete evidence list.')}</p></div><span>{t('Evidence balance: −100 to +100')}</span></header>
        {!ranked.length && <div className="ev-no-evidence"><ResearchIcon/><h3>{t(articles.length ? 'Not enough direct evidence to rank these paths.' : 'No recent, relevant reporting was found.')}</h3><p>{t(articles.length ? 'The sources are context or have unclear direction. They are available when a pathway is selected, but do not establish a score.' : 'Try a broader region or a different factor. No baseline score or probability has been invented.')}</p></div>}
        {!!allScenarios.length && <div className="ev-scenario-list">{allScenarios.map(renderScenario)}</div>}
        <p className="ev-list-note">{t('Paths can overlap. Evidence balance is not a probability and does not add up to 100.')}</p>
      </section>}
      <details className="ev-supporting-research" open={supportOpen} onToggle={event => setSupportOpen(event.currentTarget.open)}>
        <summary>{t('Supporting research and sources')}<span>{t('News, evidence pathways and stored reporting')}</span></summary>
        {!result || !newsRequested ? <>
          <div className="ev-start"><ResearchIcon/><span className="ev-kicker">{t('SUPPORTING RESEARCH')}</span><h3>{t('What could change the outlook?')}</h3>
            <p>{t('Evidence starts automatically for the current question. News scores do not numerically adjust the historical estimates.')}</p>
            <button type="button" className="ev-secondary" disabled={evidenceLoading} onClick={() => runAnalysis()}>{t('Collect supporting news')} <Arrow/></button>
          </div>
          <div className="ev-source-standalone"><EventSourceStatus result={null} query={query} failedCoverage={errorCoverage?.coverage} t={t} formatDate={formatDate}/></div>
        </> : <>
          {errorCoverage && <div className="ev-source-standalone"><EventSourceStatus result={null} query={errorCoverage.context} failedCoverage={errorCoverage.coverage} showArchive={false} t={t} formatDate={formatDate}/></div>}
        <div className="ev-report-body"><aside className="ev-insights ev-supporting-summary" aria-label={t('Research context')}>
          <EventSourceStatus key={queryKey(result)} result={newsRequested ? result : null} query={query} t={t} formatDate={formatDate}/>
          <section className="ev-history-summary"><span className="ev-kicker">{t('OUTCOME DATA')}</span><h3>{t('Historical outcome coverage')}</h3>
            {forecast && <p>{t('The connected model has its own historical training data. Public collection status below is separate.')}</p>}
            <p>{t(result.outcome_history?.status === 'COLLECTED_NEEDS_OUTCOME_REVIEW' ? 'Observations have been collected. Resolution rules and historical availability still need review before they can validate probabilities.' : result.outcome_history?.profiles?.length ? 'Outcome sources are mapped, but no reviewed history has been collected for this report.' : 'No public collection profile is mapped to this context.')}</p>
            {result.outcome_history?.profiles?.map(profile => <div key={profile.id} className="ev-history-profile"><strong>{profile.provider}</strong><span>{profile.metric} · {t({ANNUAL:'Annual',MONTHLY:'Monthly',QUARTERLY:'Quarterly',WEEKLY:'Weekly',DAILY:'Daily',EVENT_INTERVAL:'Event intervals'}[profile.frequency] || profile.frequency)}</span><span>{t('{count} observations collected',{count:profile.observation_count || 0})}</span><p>{t(profile.measurement)}</p></div>)}
            <p>{t('A historical observation date is not its publication date. Latest revised values are not point-in-time training data.')}</p>
          </section>
          <section className="ev-source-summary"><span className="ev-kicker">{t('THE EVIDENCE')}</span><dl><div><dt>{t('Relevant stories')}</dt><dd>{articles.length}</dd></div><div><dt>{t('Regional evidence')}</dt><dd>{localArticles.length}</dd></div><div><dt>{t('External or unconfirmed')}</dt><dd>{articles.length-localArticles.length}</dd></div></dl>
            <div className="ev-direction-summary"><h4>{t('Reported direction')}</h4>{[['Worsening',directionCounts[0],'challenge'],['Improving',directionCounts[1],'support'],['Unchanged or unclear',directionCounts[2],'context']].map(([label,count,tone]) => <div key={label}><span><i className={'ev-dot ev-'+tone}/>{t(label)}</span><strong>{count}</strong></div>)}</div>
            <p>{t('Story count does not establish independent sources.')}</p>
          </section>
          <section className="ev-window-note"><h3>{t('A window into recent reporting')}</h3><p>{result.horizon_info?.news_lookback_days ? t('This report checks news from the past {days} days.', {days:result.horizon_info.news_lookback_days}) : t('The news window was not recorded in this older report.')}</p><p>{t('Longer research horizons require additional historical evidence and an outcome model.')}</p>{result.coverage?.status === 'UNAVAILABLE' && <p>{t('Current news feeds are unavailable. The historical reference estimates do not use current news.')}</p>}{result.coverage?.requests != null && <small>{t('{success} of {total} feed requests succeeded', {success:result.coverage.feed_successes || 0, total:result.coverage.requests})}</small>}</section>
        </aside></div>
        </>}
      </details>
    </section>
    <section ref={archiveRef} className="ev-archive" aria-label={t('Saved research reports')}>
      <header><div><span className="ev-kicker">{t('YOUR NOTEBOOK')}</span><h2>{t('Saved research')}</h2><p>{t('Snapshots stored on this browser, ready to revisit.')}</p></div><div className="ev-archive-filter" role="group" aria-label={t('Filter saved reports')}><button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>{t('All')}</button><button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>{t('Bookmarked')}</button></div></header>
      {!studies.filter(s => !savedOnly || s.saved).length ? <p className="ev-inline-empty">{t('Your saved reports will appear here after an analysis.')}</p> : <div className="ev-archive-list">{studies.filter(s => !savedOnly || s.saved).map(study => <article key={study.id}><div><h3>{t(study.factor)} <span>·</span> {t(study.focus || 'World')}</h3><p>{duration(study.horizon)} · {formatDate(study.createdAt)}</p></div><div className="ev-archive-actions"><button type="button" className="ev-secondary" onClick={() => openStudy(study)} aria-label={t('Open saved report: {factor}, {focus}', {factor:t(study.factor),focus:t(study.focus || 'World')})}>{t('Open report')} <Arrow up/></button><button type="button" className="ev-icon-button" aria-label={t(study.saved ? 'Remove bookmark' : 'Bookmark report')} aria-pressed={!!study.saved} onClick={() => persist(studies.map(s => s.id === study.id ? {...s,saved:!s.saved} : s),'Bookmark updated.')}>{study.saved ? '★' : '☆'}</button><button type="button" className="ev-icon-button" aria-label={t('Delete saved report: {factor}, {focus}', {factor:t(study.factor),focus:t(study.focus || 'World')})} onClick={() => persist(studies.filter(s => s.id !== study.id),'Saved report deleted.')}>×</button></div></article>)}</div>}
    </section>
    {evidence && <EvidenceDialog result={result} scenario={evidence.scenario} onClose={() => setEvidence(null)} t={t} formatDate={formatDate}/>}
  </div>;
}
