import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {queryKey, reviewedProbability, referenceForecast, comparisonRows, evidenceScore, sourceUrl, studySnapshot, readStudies} from '../src/eventScenarios.js';

test('query identity distinguishes filters while normalizing surrounding spaces and global focus', () => {
  const query = {category:'Economy',factor:'GDP growth',focus:' Vietnam ',horizon:'30 days'};
  assert.equal(queryKey(query),queryKey({...query,focus:'vietnam'}));
  assert.notEqual(queryKey(query),queryKey({...query,focus:'Japan'}));
  assert.notEqual(queryKey(query),queryKey({...query,horizon:'730 days'}));
  assert.notEqual(queryKey(query),queryKey({...query,basis:'OCCURRENCE'}));
  assert.equal(queryKey({...query,focus:''}),queryKey({...query,focus:'World'}));
});

test('experimental numbers and incomplete eligibility never become displayed probabilities', () => {
  const result = {horizon:'30 days',calibrated_probability:true,dynamic_scenarios:{ranked_scenarios:[{id:'a'},{id:'b'}]},bayesian_forecast:{status:'CALIBRATED_MODEL_ELIGIBLE',
    model_version:'reviewed-v1',holdout_sample_count:200,horizon:'30 days',posterior:{a:.7,b:.3}}};
  assert.equal(reviewedProbability(result,'a'),.7);
  for (const invalid of [
    {...result,calibrated_probability:false},
    {...result,bayesian_forecast:{...result.bayesian_forecast,horizon:'1 day'}},
    {...result,bayesian_forecast:{...result.bayesian_forecast,holdout_sample_count:undefined}},
    {...result,bayesian_forecast:{...result.bayesian_forecast,holdout_sample_count:'200'}},
    {...result,bayesian_forecast:{...result.bayesian_forecast,posterior:{a:NaN,b:.3}}},
    {...result,bayesian_forecast:{...result.bayesian_forecast,posterior:{a:.8,b:.4}}},
    {...result,dynamic_scenarios:{ranked_scenarios:[{id:'a'},{id:'c'}]}},
    {...result,dynamic_scenarios:{ranked_scenarios:[{id:'a'}]}},
    {experimental_probability:{probability_estimate:.9}},
  ]) assert.equal(reviewedProbability(invalid,'a'),null);
  assert.equal(evidenceScore({evidence_score:0}),0);
  for (const value of [NaN,Infinity,101,-101,'72']) assert.equal(evidenceScore({evidence_score:value}),null);
});

const referenceFixture = () => JSON.parse(readFileSync(new URL('../tests/fixtures/event-reference-forecast.json',import.meta.url),'utf8'));
function referenceReport() {
  const scenario_forecast = referenceFixture();
  return {...scenario_forecast.context,scenario_forecast};
}

test('every reference outcome is validated together and close alternatives remain visible without a forced winner', () => {
  const report = referenceReport(), model = referenceForecast(report);
  assert.ok(model);
  const rows = comparisonRows(model);
  assert.equal(rows.length,3);
  assert.ok(rows.every(r => r.close));
  assert.ok(rows.every(r => r.probability > .30 && r.probability < .35));
  const reordered = {...model,scenarios:[...model.scenarios].reverse()};
  assert.deepEqual(Object.fromEntries(comparisonRows(reordered).map(r => [r.id,r.probability])),model.probabilities);
  assert.deepEqual(comparisonRows(model,'probability').map(r => r.probability),rows.map(r => r.probability).sort((a,b) => b-a));
});

test('one missing outcome, wrong context, bad range, expired model or dishonest holdout withholds all reference estimates', () => {
  const edits = [
    m => {delete m.probabilities[m.scenarios[1].id];},
    m => {m.scenarios.pop();},
    m => {m.context.focus='Japan';},
    m => {m.context.basis='OCCURRENCE';},
    m => {m.expires_at=m.as_of;},
    m => {m.holdout_sample_count=99;},
    m => {m.probabilities[m.scenarios[0].id]=.99;},
    m => {m.intervals[m.scenarios[0].id]=[.9,1];},
    m => {m.intervals[m.scenarios[0].id]=[NaN,1];},
    m => {m.training_resolved_through=m.holdout_origin_from;},
    m => {m.validation.brier_score=NaN;},
    m => {m.holdout_counts[m.scenarios[0].id]=1;},
  ];
  for (const edit of edits) {
    const report=referenceReport();
    edit(report.scenario_forecast);
    assert.equal(referenceForecast(report),null);
  }
});

test('legacy snapshots retain their original query without exposing experimental probability as a score', () => {
  const study = {id:'old',category:'Economy',factor:'GDP growth',focus:'Vietnam',horizon:'30 days',createdAt:'2026-10-22T00:00:00Z',
    research:{status:'EVIDENCE_AVAILABLE',dynamic_scenarios:{ranked_scenarios:[{id:'a',experimental_probability:{probability_estimate:.72}}]}}};
  const snapshot = studySnapshot(study);
  assert.equal(snapshot.focus,'Vietnam');
  assert.equal(snapshot.legacy_snapshot,true);
  assert.equal(evidenceScore(snapshot.dynamic_scenarios.ranked_scenarios[0]),null);
  assert.equal(reviewedProbability(snapshot,'a'),null);
  assert.equal(studySnapshot({}),null);
});

test('source links cannot execute scripts or carry embedded credentials', () => {
  assert.equal(sourceUrl('https://example.org/news'),'https://example.org/news');
  for (const url of ['javascript:alert(1)','data:text/html,test','https://user:password@example.org','http://example.org',null]) assert.equal(sourceUrl(url),null);
});

test('malformed archive entries are ignored without discarding valid reports', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = {getItem:() => JSON.stringify([null,{}, {id:'ok',factor:'Inflation',horizon:'30 days'}])};
    assert.equal(readStudies('archive').length,1);
    globalThis.localStorage = {getItem:() => '{broken'};
    assert.deepEqual(readStudies('archive'),[]);
  } finally {globalThis.localStorage = original;}
});
