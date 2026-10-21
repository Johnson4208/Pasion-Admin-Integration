import unittest
import event_scenario_board as board

class ScenarioBoardTests(unittest.TestCase):
 def test_rank_ten_and_withhold_probabilities(self):
  rows=[{'id':'one','title':'Supply disruptions and shortage persist','description':'Oil shortages escalate','weight':.7,'direction':-.8,'url':'https://example.org/news','source':'Example','published_at':'2026-10-21T00:00:00Z'},
  {'id':'two','title':'Production recovers gradually','description':'Recovery improves supply','weight':.4,'direction':.7,'url':'https://example.org/news2','source':'Example','published_at':'2026-10-21T00:00:00Z'}]
  r=board.candidates(rows,'Oil supply','Asia','30 days')
  self.assertEqual(len(r['ranked_scenarios']),10)
  self.assertEqual([x['rank'] for x in r['ranked_scenarios']],list(range(1,11)))
  self.assertTrue(all(x['probability'] is None for x in r['ranked_scenarios']))
  self.assertTrue(r['hypotheses_overlap'])
  self.assertEqual(r['timeframe'],'SHORT_TERM')
 def test_long_term_and_no_evidence(self):
  r=board.candidates([], 'Inflation','World','180 days')
  self.assertEqual(r['timeframe'],'LONG_TERM')
  self.assertTrue(all(x['support_index'] is None for x in r['ranked_scenarios']))
  self.assertTrue(all(x['status']=='PENDING_EVIDENCE' for x in r['ranked_scenarios']))

if __name__=='__main__':unittest.main()
