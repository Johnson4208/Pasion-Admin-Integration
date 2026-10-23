// The live service supplies evidence, not calibrated probabilities. Keep this
// distinction when loading historical snapshots or incomplete API responses.
export const HORIZONS = {
  short: [['1 day','1 day'],['3 days','3 days'],['7 days','1 week'],['30 days','1 month'],['90 days','3 months']],
  long: [['180 days','6 months'],['365 days','1 year'],['730 days','2 years']],
};

export function queryKey(query) {
  return JSON.stringify([query.category, query.factor, (query.focus?.trim() || 'World').toLowerCase(), query.horizon, query.basis || 'END_STATE']);
}

export function reviewedProbability(result, scenarioId) {
  const model = result?.bayesian_forecast;
  const ids = result?.dynamic_scenarios?.ranked_scenarios?.filter(s => s.horizon_eligible !== false).map(s => s.id);
  if (result?.calibrated_probability !== true || model?.status !== 'CALIBRATED_MODEL_ELIGIBLE' ||
      typeof model.model_version !== 'string' || !model.model_version.trim() ||
      !Number.isInteger(model.holdout_sample_count) || model.holdout_sample_count < 100 ||
      model.horizon !== result.horizon || !Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length ||
      Object.keys(model.posterior || {}).length !== ids.length || ids.some(id => !Object.hasOwn(model.posterior || {},id))) return null;
  const probabilities = Object.values(model.posterior || {});
  if (probabilities.length < 2 || probabilities.some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) ||
      Math.abs(probabilities.reduce((sum,p) => sum+p,0)-1) > 1e-7) return null;
  const value = model.posterior[scenarioId];
  return typeof value === 'number' ? value : null;
}

// One invalid or missing outcome withholds the whole comparison. Never
// normalize a partly covered set or match changing scenarios by row position.
export function referenceForecast(result) {
  const model = result?.scenario_forecast;
  if (model?.schema_version !== 1 || model.status !== 'REFERENCE_ESTIMATE_AVAILABLE' ||
      model.method !== 'HISTORICAL_REFERENCE_CLASS_V1' || queryKey(model.context || {}) !== queryKey(result) ||
      !['END_STATE','OCCURRENCE'].includes(model.context.basis) || model.validation?.status !== 'PASSED_HOLDOUT_CHECK' ||
      !Number.isInteger(model.training_sample_count) || model.training_sample_count < 100 || model.training_sample_count > 100000 ||
      !Number.isInteger(model.holdout_sample_count) || model.holdout_sample_count < 100 || model.holdout_sample_count > 100000 ||
      ['model_version','family_id','definition_version','question','sampling_policy','dataset_sha256'].some(k => typeof model[k] !== 'string' || !model[k].trim())) return null;
  if (['brier_score','log_loss','maximum_rate_error'].some(k => typeof model.validation[k] !== 'number' || !Number.isFinite(model.validation[k]) || model.validation[k] < 0)) return null;
  const asOf = Date.parse(model.as_of), reviewed = Date.parse(model.reviewed_at), expires = Date.parse(model.expires_at);
  const trainingEnd = Date.parse(model.training_resolved_through), holdoutStart = Date.parse(model.holdout_origin_from), holdoutEnd = Date.parse(model.holdout_resolved_through);
  if (![asOf,reviewed,expires,trainingEnd,holdoutStart,holdoutEnd].every(Number.isFinite) ||
      !(trainingEnd < holdoutStart && holdoutStart < holdoutEnd && holdoutEnd <= reviewed && reviewed <= asOf && asOf < expires)) return null;
  if (!Array.isArray(model.scenarios) || model.scenarios.length < 2 || model.scenarios.length > 100 ||
      model.scenarios.some(s => !s || ['id','title','resolution_rule'].some(k => typeof s[k] !== 'string' || !s[k].trim()))) return null;
  const ids = model.scenarios.map(s => s.id);
  if (new Set(ids).size !== ids.length) return null;
  for (const map of [model.probabilities,model.intervals,model.training_counts,model.holdout_counts]) {
    if (!map || Object.keys(map).length !== ids.length || ids.some(id => !Object.hasOwn(map,id))) return null;
  }
  const endState = model.context.basis === 'END_STATE';
  if (model.mutually_exclusive !== endState || model.exhaustive !== endState || model.interval_level !== .95 || model.news_adjusted !== false) return null;
  const denominator = model.training_sample_count+(endState ? ids.length/2 : 1);
  for (const id of ids) {
    const p = model.probabilities[id], interval = model.intervals[id];
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1 ||
        !Array.isArray(interval) || interval.length !== 2 || interval.some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
        !(0 <= interval[0] && interval[0] <= p && p <= interval[1] && interval[1] <= 1)) return null;
    for (const [counts,n] of [[model.training_counts,model.training_sample_count],[model.holdout_counts,model.holdout_sample_count]]) {
      if (!Number.isInteger(counts[id]) || counts[id] < 5 || counts[id] > n || (!endState && n-counts[id] < 5)) return null;
    }
    if (Math.abs(p-(model.training_counts[id]+.5)/denominator) > 1e-8) return null;
    const observed = model.holdout_counts[id]/model.holdout_sample_count;
    const tolerance = Math.min(.10,1.96*Math.sqrt(p*(1-p)*(1/model.training_sample_count+1/model.holdout_sample_count)));
    if (Math.abs(p-observed) > tolerance+1e-12) return null;
  }
  if (endState && (Math.abs(ids.reduce((sum,id) => sum+model.probabilities[id],0)-1) > 1e-7 ||
      ids.reduce((sum,id) => sum+model.training_counts[id],0) !== model.training_sample_count ||
      ids.reduce((sum,id) => sum+model.holdout_counts[id],0) !== model.holdout_sample_count)) return null;
  return model;
}

export function comparisonRows(model, sort='definition') {
  if (!model) return [];
  const highest = Math.max(...Object.values(model.probabilities));
  const rows = model.scenarios.map(s => ({...s, probability:model.probabilities[s.id],
    interval:model.intervals[s.id], gap:highest-model.probabilities[s.id],
    close:highest-model.probabilities[s.id] <= .03+1e-12}));
  if (sort === 'probability') rows.sort((a,b) => b.probability-a.probability || a.id.localeCompare(b.id));
  return rows;
}

export function readStudies(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data.filter(s => s && typeof s === 'object' && typeof s.id === 'string' &&
      typeof s.factor === 'string' && typeof s.horizon === 'string') : [];
  } catch { return []; }
}

export function studySnapshot(study) {
  const value = study.snapshot || study.research;
  if (!value || typeof value !== 'object') return null;
  const rows = Array.isArray(value.dynamic_scenarios?.ranked_scenarios) ? value.dynamic_scenarios.ranked_scenarios : [];
  return {...value, items:Array.isArray(value.items) ? value.items.filter(x => x && typeof x === 'object') : [],
    dynamic_scenarios:{...value.dynamic_scenarios,ranked_scenarios:rows.filter(x => x && typeof x.id === 'string')
      .map(x => ({...x,sources:Array.isArray(x.sources) ? x.sources.filter(s => s && typeof s === 'object') : []}))},
    category: study.category, factor: study.factor, focus: study.focus || 'World',
    horizon: study.horizon, generated_at: value.generated_at || study.createdAt,
    basis: study.basis || value.basis || 'END_STATE',
    legacy_snapshot: !study.snapshot};
}

export function evidenceScore(scenario) {
  return typeof scenario?.evidence_score === 'number' && Number.isFinite(scenario.evidence_score) &&
    scenario.evidence_score >= -100 && scenario.evidence_score <= 100 ? scenario.evidence_score : null;
}

export function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
