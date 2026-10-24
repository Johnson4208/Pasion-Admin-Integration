"""Historical forecasts and news shares must never be mislabeled as each other."""
import unittest
from datetime import datetime,timezone
import event_forecasts
import event_scenario_presentation as presentation
from test_event_forecasts import specification,NOW

class DisplayTests(unittest.TestCase):
 def test_reviewed_10_outcome_reference_has_100_percent_and_exact_names(self):
  spec=specification(size=10)
  artifact=event_forecasts.build(spec,'synthetic automated test',NOW)
  record=event_forecasts.estimate(artifact,artifact['context'],NOW)
  view=presentation.historical_forecast(record)
  self.assertEqual(view['type'],'HISTORICAL_REFERENCE')
  self.assertEqual(len(view['rows']),10)
  self.assertAlmostEqual(sum(row['scenario_share_percent'] for row in view['rows']),100.0)
  self.assertEqual(view['total_percent'],100.0)
  self.assertEqual({r['id'] for r in view['rows']},set(record['probabilities']))
  self.assertTrue(all(row['scenario_share_status']=='HISTORICAL_REFERENCE_ESTIMATE' for row in view['rows']))

 def test_overlapping_marginals_must_not_be_normalized(self):
  model=event_forecasts.build(specification(basis='OCCURRENCE',size=10),
                              'synthetic automated test',NOW)
  record=event_forecasts.estimate(model,model['context'],NOW)
  self.assertIsNone(presentation.historical_forecast(record))

 def test_invalid_or_small_family_never_claims_ten_model_outcomes(self):
  model=event_forecasts.build(specification(size=3),'synthetic automated test',NOW)
  record=event_forecasts.estimate(model,model['context'],NOW)
  self.assertIsNone(presentation.historical_forecast(record))
  record['validation']['status']='WITHHELD_HOLDOUT_CHECK_FAILED'
  self.assertIsNone(presentation.historical_forecast(record))

 def test_only_news_fallback_when_no_valid_model(self):
  result={'scenario_forecast':event_forecasts.unavailable({'category':'Geopolitics','factor':'Conflict risk',
        'focus':'Vietnam','horizon':'30 days','basis':'END_STATE'}),
    'dynamic_scenarios':{'ranked_scenarios':[{'id':'first','scenario_share_percent':100.}],
                         'scenario_distribution':{'status':'NORMALIZED_EXPERIMENTAL_UNCALIBRATED',
                         'total_percent':100.,'quality':'LIMITED','estimated_scenario_count':1}}}
  view=presentation.display(result)
  self.assertEqual(view['type'],'RESEARCH_SHARE')
  self.assertEqual(view['confidence'],'LIMITED')
  self.assertEqual(view['total_percent'],100.)
  self.assertNotIn('outcome_probability',view['rows'][0])

 def test_missing_evidence_does_not_manufacture_distribution(self):
  view=presentation.display({'scenario_forecast':{},'dynamic_scenarios':{}})
  self.assertEqual(view['status'],'NOT_CALCULATED')
  self.assertIsNone(view['total_percent'])

if __name__=='__main__':unittest.main()
