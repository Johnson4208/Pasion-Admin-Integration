import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {usePreferences} from './Preferences';
import {HORIZONS, queryKey, readStudies, reviewedProbability, referenceForecast, studySnapshot, evidenceScore, sourceUrl} from './eventScenarios.js';
import EventScenarioComparison from './EventScenarioComparison.jsx';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedView, setSavedView] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const [notice, setNotice] = useState('');
  const key = storageKey+'-event-research';
  const [studies, setStudies] = useState(() => readStudies(key));
  const [savedOnly, setSavedOnly] = useState(false);
  const request = useRef({id:0, controller:null});
  const archiveRef = useRef(null);
  const reportRef = useRef(null);
  const term = HORIZONS.long.some(([value]) => value === query.horizon) ? 'long' : 'short';

  function cancelRequest() {
    request.current.controller?.abort();
    request.current = {id:request.current.id+1, controller:null};
  }
  useEffect(() => {
    cancelRequest();
    setStudies(readStudies(key));
    setResult(null); setSavedView(false); setLoading(false); setEvidence(null); setError(''); setNotice('');
    return cancelRequest;
  }, [key]);

  function formatDate(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.valueOf()) ? date.toLocaleString(language, {dateStyle:'medium', timeStyle:'short'}) : t('Date unavailable');
  }
  function duration(value) {
    return t(Object.values(HORIZONS).flat().find(([key]) => key === value)?.[1] || value || 'Date unavailable');
  }
  function changeQuery(update) {
    cancelRequest();
    setQuery(current => ({...current, ...update}));
    setResult(null); setSavedView(false); setLoading(false); setError(''); setEvidence(null); setNotice('');
  }
  async function runAnalysis(event) {
    event?.preventDefault();
    if (loading) return;
    cancelRequest();
    const requested = {...query, focus:query.focus.trim() || 'World'};
    const controller = new AbortController();
    const id = request.current.id;
    request.current.controller = controller;
    setLoading(true); setError(''); setEvidence(null); setNotice(''); setSavedView(false);
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/research/events/live?'+new URLSearchParams(requested), {credentials:'same-origin', signal:controller.signal});
      const data = await response.json();
      if (request.current.id !== id) return;
      if (!response.ok) throw Error(response.status === 401 ? 'Your session has expired. Sign in again.' : response.status === 400 ? 'Check the region or entity and try again.' : 'News sources could not be reached. Please try again shortly.');
      if (data.version !== 1 || queryKey(data) !== queryKey(requested) || !Array.isArray(data.items) ||
          data.items.some(s => !s || typeof s !== 'object') || !Array.isArray(data.dynamic_scenarios?.ranked_scenarios) ||
          data.dynamic_scenarios.ranked_scenarios.some(s => !s || typeof s.id !== 'string' || !Array.isArray(s.sources)) ||
          !['EVIDENCE_AVAILABLE','FORECAST_AVAILABLE','UNAVAILABLE'].includes(data.status)) throw Error('The response did not match this research. Please try again.');
      setResult(data);
    } catch (failure) {
      if (request.current.id !== id) return;
      setError(failure.name === 'AbortError' ? 'The request timed out. Please try again.' : failure instanceof TypeError || failure instanceof SyntaxError ? 'News sources could not be reached. Please try again shortly.' : failure.message);
    } finally {
      clearTimeout(timeout);
      if (request.current.id === id) {request.current.controller = null; setLoading(false);}
    }
  }
  function persist(next, success) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStudies(next); setNotice(success);
      return true;
    } catch {setNotice('Your browser could not save this report. Free up storage and try again.'); return false;}
  }
  const currentReport = result && queryKey(result) === queryKey(query);
  const canSave = currentReport && (result.status === 'EVIDENCE_AVAILABLE' || !!referenceForecast(result)) && !savedView && !loading && !error;
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
    cancelRequest(); setLoading(false); setError(''); setNotice(''); setEvidence(null);
    setResult(snapshot); setSavedView(true);
    requestAnimationFrame(() => reportRef.current?.scrollIntoView({block:'start', behavior:'instant'}));
  }
  function exportReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'pasion-event-research.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const allScenarios = result?.dynamic_scenarios?.ranked_scenarios?.filter(s => s.horizon_eligible !== false) || [];
  const ranked = allScenarios.filter(s => evidenceScore(s) !== null || reviewedProbability(result,s.id) !== null);
  const forecast = referenceForecast(result);
  const invalidForecast = result?.scenario_forecast?.status === 'REFERENCE_ESTIMATE_AVAILABLE' && !forecast;
  const hasReviewedProbabilities = allScenarios.some(s => reviewedProbability(result,s.id) !== null);
  const articles = result?.items || [];
  const localArticles = articles.filter(s => !['EXTERNAL_CONTEXT','UNVERIFIED_SCOPE'].includes(s.geographic_relation));
  const directionCounts = [localArticles.filter(s => s.direction_status === 'DIRECTIONAL' && s.direction < 0).length,
    localArticles.filter(s => s.direction_status === 'DIRECTIONAL' && s.direction > 0).length,
    localArticles.filter(s => s.direction_status !== 'DIRECTIONAL').length];

  function renderScenario(scenario, index) {
    const score = evidenceScore(scenario);
    const probability = reviewedProbability(result, scenario.id);
    return <article className="ev-scenario" key={scenario.id} data-scenario={scenario.id}>
      <span className="ev-rank">{String(index+1).padStart(2,'0')}</span>
      <div className="ev-scenario-copy"><h3>{t(scenario.title)}</h3><p>{t(scenario.definition)}</p>
        <div className="ev-scenario-counts"><span><i className="ev-dot ev-support"/>{scenario.supporting_source_count || 0} {t('supporting')}</span><span><i className="ev-dot ev-challenge"/>{scenario.opposing_source_count || 0} {t('challenging')}</span></div>
      </div>
      <div className="ev-score" data-tone={score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'}>
        <strong>{score === null ? '—' : (score > 0 ? '+' : '')+score}</strong><span>{t('Evidence balance')}</span>
        {score !== null && <div className="ev-balance" aria-hidden="true"><i style={{width:Math.abs(score)/2+'%', insetInlineStart:(score < 0 ? 50-Math.abs(score)/2 : 50)+'%'}}/></div>}
        {probability !== null ? <small>{t('Reviewed probability')}: {(probability*100).toFixed(1)}%</small> : <small>{t('Probability not estimated')}</small>}
      </div>
      <button type="button" className="ev-source-button" aria-label={t('View evidence: {title}', {title:t(scenario.title)})} onClick={() => setEvidence({scenario})}>{t('Evidence')} <Arrow up/></button>
    </article>;
  }

  return <div className="analytics-page event-scenarios-page events-workspace">
    <header className="ev-intro"><div><span className="ev-kicker">{t('SCENARIO RESEARCH')}</span><h2>{t('A clearer view of what could change.')}</h2><p>{t('Compare possible paths with the reporting that supports or challenges them.')}</p></div>
      <button type="button" className="ev-secondary ev-archive-jump" onClick={() => archiveRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})}>{t('Saved reports')} <span>{studies.length}</span></button>
    </header>
    <form className="ev-configuration" onSubmit={runAnalysis} aria-label={t('Research configuration')}>
      <label>{t('Category')}<select value={query.category} onChange={event => changeQuery({category:event.target.value, factor:categories[event.target.value][0]})}>{Object.keys(categories).map(x => <option value={x} key={x}>{t(x)}</option>)}</select></label>
      <label>{t('Factor')}<select value={query.factor} onChange={event => changeQuery({factor:event.target.value})}>{categories[query.category].map(x => <option value={x} key={x}>{t(x)}</option>)}</select></label>
      <label>{t('Region / entity')}<input value={query.focus} onChange={event => changeQuery({focus:event.target.value})} maxLength={70} list="event-region-hints" placeholder={t('World')}/><datalist id="event-region-hints">{['World','Asia','Southeast Asia','Vietnam','United States','Europe','Middle East'].map(x => <option value={x} key={x}/>)}</datalist></label>
      <label>{t('Research horizon')}<select aria-label={t('Research horizon')} value={query.horizon} onChange={event => changeQuery({horizon:event.target.value})}>{Object.entries(HORIZONS).map(([group, values]) => <optgroup label={t(group === 'short' ? 'Short-term' : 'Long-term')} key={group}>{values.map(([value,label]) => <option value={value} key={value}>{t(label)}</option>)}</optgroup>)}</select></label>
      <label>{t('Probability basis')}<select aria-label={t('Probability basis')} value={query.basis} onChange={event => changeQuery({basis:event.target.value})}><option value="END_STATE">{t('State at the end of the period')}</option><option value="OCCURRENCE">{t('Occurs at least once during the period')}</option></select></label>
      <button type="submit" className="ev-primary" disabled={loading}>{loading ? t('Analyzing…') : t('Analyze evidence')} <Arrow/></button>
      <p className="ev-configuration-note">{t('The horizon sets your research context. Scores describe recent reporting, not the chance of an event by that date.')}</p>
    </form>
    {error && <div className="ev-alert" role="alert"><strong>{t(error)}</strong>{result && <p>{t('Update failed. The previous report is shown below with its original date and sources.')}</p>}</div>}
    {notice && <p className="ev-save-notice" role="status">{t(notice)}</p>}
    <section ref={reportRef} className="ev-report" aria-label={t('Scenario research report')} aria-busy={loading}>
      {loading && <div className="ev-loading" role="status"><span className="ev-spinner" aria-hidden="true"/><div><strong>{t('Gathering the evidence')}</strong><p>{t('Checking relevance, dates and opposing reports. You can change the filters to start over.')}</p></div></div>}
      {!result ? <div className="ev-start"><ResearchIcon/><span className="ev-kicker">{t(loading ? 'RESEARCH IN PROGRESS' : 'START WITH A QUESTION')}</span><h3>{t(loading ? 'Your evidence report is taking shape.' : 'What could change the outlook?')}</h3><p>{t('Choose a factor and region, then analyze the available reporting. Each pathway will show supporting and challenging evidence.')}</p><div className="ev-start-example"><span>{t('For example')}</span><button type="button" onClick={() => changeQuery({category:'Economy', factor:'Inflation', focus:'Vietnam', horizon:'30 days'})}>{t('Inflation in Vietnam')} <Arrow/></button><button type="button" onClick={() => changeQuery({category:'Energy', factor:'Oil supply', focus:'World', horizon:'30 days'})}>{t('Global oil supply')} <Arrow/></button></div></div> : <>
        <header className="ev-report-header"><div><span className="ev-kicker">{t(savedView ? 'SAVED REPORT' : error ? 'PREVIOUS REPORT' : 'EVIDENCE OUTLOOK')}</span><h2>{t(result.factor)} <span>·</span> {t(result.focus || 'World')}</h2><p>{t('Research horizon')}: {duration(result.horizon)} <span>·</span> {formatDate(result.generated_at)}</p><p>{t((result.basis || 'END_STATE') === 'END_STATE' ? 'State at the end of the period' : 'Occurs at least once during the period')}</p></div>
          <div className="ev-report-actions"><button type="button" className="ev-secondary" disabled={!articles.length} onClick={() => setEvidence({scenario:null})}>{t('All sources')} <Arrow up/></button>
            {savedView ? <button type="button" className="ev-secondary" onClick={exportReport}>{t('Export report')}</button> : <button type="button" className="ev-primary ev-save-button" disabled={!canSave} onClick={saveResearch}>{t('Save report')}</button>}
          </div></header>
        {savedView && <div className="ev-saved-banner"><span>{t(result.legacy_snapshot ? 'Older saved report. Experimental percentages are hidden; run a new analysis for the current evidence method.' : 'You are viewing a saved snapshot. Its sources and date have not been refreshed.')}</span><button type="button" onClick={() => changeQuery({category:categories[result.category] ? result.category : query.category, factor:result.factor, focus:result.focus, horizon:result.horizon, basis:result.basis || 'END_STATE'})}>{t('Use these settings')} <Arrow/></button></div>}
          <section className="ev-probability-note" aria-label={t('Model and score')}><span className="ev-small-icon" aria-hidden="true">i</span><div><h3>{t(forecast ? 'Historical reference estimates' : hasReviewedProbabilities ? 'Reviewed model probabilities' : 'Probability is not available')}</h3><p>{t(forecast ? 'All defined outcomes are compared below using the same historical sample and horizon. Evidence pathways remain a separate research measure.' : hasReviewedProbabilities ? 'Reviewed model probabilities and evidence balance are separate measures.' : 'There is no validated model for this event and horizon. Headline sentiment cannot establish the chance of an outcome.')}</p></div>
            <details><summary>{t('How to read the score')}</summary><p>{t('Evidence balance compares weighted supporting and challenging stories, from −100 to +100. Positive means more support; negative means more challenge. Unclear or external context adds no directional support.')}</p></details>
          </section>
        {invalidForecast && <p className="ev-comparison-invalid" role="alert">{t('This probability set is incomplete or invalid. All estimates are withheld together; no partial distribution is shown.')}</p>}
        {forecast && <EventScenarioComparison key={forecast.family_id+forecast.definition_version+queryKey(result)} model={forecast} t={t} language={language} formatDate={formatDate}/>}

        <div className="ev-report-body"><div className="ev-main-column">
          <div className="ev-list-heading"><h3>{t('Supporting research pathways')}</h3><span>{t('Evidence balance: −100 to +100')}</span></div>
          {!ranked.length && <div className="ev-no-evidence"><ResearchIcon/><h3>{t(articles.length ? 'Not enough direct evidence to rank these paths.' : 'No recent, relevant reporting was found.')}</h3><p>{t(articles.length ? 'The sources below are context or have unclear direction. They are available to read, but do not establish a score.' : 'Try a broader region or a different factor. No baseline score or probability has been invented.')}</p></div>}
          {!!allScenarios.length && <div className="ev-scenario-list">{allScenarios.map(renderScenario)}</div>}
          <p className="ev-list-note">{t('Paths can overlap. Evidence balance is not a probability and does not add up to 100.')}</p>
        </div>
        <aside className="ev-insights" aria-label={t('Research context')}>
          <section className="ev-history-summary"><span className="ev-kicker">{t('OUTCOME DATA')}</span><h3>{t('Historical outcome coverage')}</h3>
            {forecast && <p>{t('The connected model has its own reviewed history. Public collection status below is separate.')}</p>}
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
    </section>
    <section ref={archiveRef} className="ev-archive" aria-label={t('Saved research reports')}>
      <header><div><span className="ev-kicker">{t('YOUR NOTEBOOK')}</span><h2>{t('Saved research')}</h2><p>{t('Snapshots stored on this browser, ready to revisit.')}</p></div><div className="ev-archive-filter" role="group" aria-label={t('Filter saved reports')}><button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>{t('All')}</button><button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>{t('Bookmarked')}</button></div></header>
      {!studies.filter(s => !savedOnly || s.saved).length ? <p className="ev-inline-empty">{t('Your saved reports will appear here after an analysis.')}</p> : <div className="ev-archive-list">{studies.filter(s => !savedOnly || s.saved).map(study => <article key={study.id}><div><h3>{t(study.factor)} <span>·</span> {t(study.focus || 'World')}</h3><p>{duration(study.horizon)} · {formatDate(study.createdAt)}</p></div><div className="ev-archive-actions"><button type="button" className="ev-secondary" onClick={() => openStudy(study)} aria-label={t('Open saved report: {factor}, {focus}', {factor:t(study.factor),focus:t(study.focus || 'World')})}>{t('Open report')} <Arrow up/></button><button type="button" className="ev-icon-button" aria-label={t(study.saved ? 'Remove bookmark' : 'Bookmark report')} aria-pressed={!!study.saved} onClick={() => persist(studies.map(s => s.id === study.id ? {...s,saved:!s.saved} : s),'Bookmark updated.')}>{study.saved ? '★' : '☆'}</button><button type="button" className="ev-icon-button" aria-label={t('Delete saved report: {factor}, {focus}', {factor:t(study.factor),focus:t(study.focus || 'World')})} onClick={() => persist(studies.filter(s => s.id !== study.id),'Saved report deleted.')}>×</button></div></article>)}</div>}
    </section>
    {evidence && <EvidenceDialog result={result} scenario={evidence.scenario} onClose={() => setEvidence(null)} t={t} formatDate={formatDate}/>}
  </div>;
}
