import unittest
import event_scenario_board as board

class ScenarioBoardTests(unittest.TestCase):
 def test_rank_ten_and_withhold_probabilities(self):
  rows=[{'id':'one','title':'Supply disruptions and shortage persist','description':'Oil shortages escalate','weight':.7,'direction':-.8,'direction_status':'DIRECTIONAL','geographic_relation':'DIRECT_SCOPE','url':'https://example.org/news','source':'Example','published_at':'2026-10-21T00:00:00Z'},
  {'id':'two','title':'Production recovers gradually','description':'Recovery improves supply','weight':.4,'direction':.7,'direction_status':'DIRECTIONAL','geographic_relation':'DIRECT_SCOPE','url':'https://example.org/news2','source':'Example','published_at':'2026-10-21T00:00:00Z'}]
  r=board.candidates(rows,'Oil supply','Asia','30 days')
  self.assertEqual(len(r['ranked_scenarios']),10)
  self.assertEqual([x['rank'] for x in r['ranked_scenarios']],list(range(1,11)))
  self.assertTrue(all(x['probability'] is None for x in r['ranked_scenarios']))
  self.assertTrue(any(x['experimental_probability'] for x in r['ranked_scenarios']))
  self.assertTrue(all(not x['experimental_probability'] or not x['experimental_probability']['calibrated'] for x in r['ranked_scenarios']))
  self.assertEqual(r['ranking_metric'],'POSITIVE_NET_EVIDENCE_SCENARIO_SHARE')
  self.assertTrue(any(x['evidence_score'] is not None for x in r['ranked_scenarios']))
  self.assertTrue(r['hypotheses_overlap'])
  self.assertEqual(r['scenario_distribution']['status'],'NORMALIZED_EXPERIMENTAL_UNCALIBRATED')
  self.assertEqual(sum(x['scenario_share_percent'] for x in r['ranked_scenarios']),100.0)
  self.assertEqual(r['scenario_distribution']['total_percent'],100.0)
  self.assertEqual(r['timeframe'],'SHORT_TERM')
 def test_long_term_and_no_evidence(self):
  r=board.candidates([], 'Inflation','World','180 days')
  self.assertEqual(r['timeframe'],'LONG_TERM')
  self.assertTrue(all(x['support_index'] is None for x in r['ranked_scenarios']))
  self.assertTrue(all(x['status']=='PENDING_EVIDENCE' for x in r['ranked_scenarios'] if x['horizon_eligible']))
  self.assertTrue(all(x['experimental_probability'] is None for x in r['ranked_scenarios']))
  self.assertEqual(r['scenario_distribution']['status'],'NOT_CALCULATED')
  self.assertEqual(sum(x['scenario_share_percent'] for x in r['ranked_scenarios']),0.0)

 def test_net_support_only_not_prior_creates_shares(self):
  items=[
   {'id':'a','support_weight':.569,'opposition_weight':0.,'supporting_source_count':2,'horizon_eligible':True},
   {'id':'b','support_weight':.418,'opposition_weight':.1,'supporting_source_count':2,'horizon_eligible':True},
   {'id':'c','support_weight':.373,'opposition_weight':0.,'supporting_source_count':1,'horizon_eligible':True},
   {'id':'d','support_weight':0.,'opposition_weight':.8,'supporting_source_count':0,'horizon_eligible':True},
   {'id':'e','support_weight':.8,'opposition_weight':0.,'supporting_source_count':2,'horizon_eligible':False},
   {'id':'f','support_weight':.1,'opposition_weight':.8,'supporting_source_count':1,'horizon_eligible':True},
  ]
  state=board._normalize_scenario_shares(items)
  self.assertEqual(state['total_percent'],100.0)
  self.assertAlmostEqual(sum(x['scenario_share_percent'] for x in items),100.0)
  self.assertEqual(items[3]['scenario_share_percent'],0.)
  self.assertEqual(items[4]['scenario_share_percent'],0.)
  self.assertEqual(items[5]['scenario_share_percent'],0.)
  self.assertEqual(items[3]['scenario_share_status'],'NOT_CALCULATED')
  self.assertGreater(items[0]['scenario_share_percent'],items[1]['scenario_share_percent'])

 def test_contradictions_reduce_ranking_share(self):
  good=[self.row('good'+str(i),'GDP improves gradually',1) for i in range(3)]
  contrary=[self.row('bad'+str(i),'GDP contracts',-1) for i in range(2)]
  a=board.candidates(good,'GDP growth','World','30 days')
  b=board.candidates(good+contrary,'GDP growth','World','30 days')
  get=lambda result:next(x for x in result['ranked_scenarios'] if x['id']=='gradual_improvement')
  self.assertGreater(get(a)['support_index'],get(b)['support_index'])

 def test_no_evidence_never_manufactures_a_100_percent_forecast(self):
  items=[{'id':'a','experimental_probability':None,'horizon_eligible':True},
         {'id':'b','experimental_probability':None,'horizon_eligible':False}]
  state=board._normalize_scenario_shares(items)
  self.assertEqual(state['status'],'NOT_CALCULATED')
  self.assertEqual(state['total_percent'],0.)
  self.assertTrue(all(x['scenario_share_status']=='NOT_CALCULATED' for x in items))

 def row(self,ident,title,direction,**extra):
  return {'id':ident,'title':title,'description':'','weight':.7,'direction':direction,'direction_status':'DIRECTIONAL',
          'url':'https://example.org/'+ident,'source':'Example',**extra}

 def pathway(self,rows,ident='gradual_improvement',horizon='30 days'):
  return next(x for x in board.candidates(rows,'GDP growth','World',horizon)['ranked_scenarios'] if x['id']==ident)

 def test_twenty_opposing_stories_reduce_the_score(self):
  positive=[self.row(str(i),'GDP improves gradually',1) for i in range(3)]
  negative=[self.row('opposing-'+str(i),'GDP contracts into recession',-1) for i in range(20)]
  before=self.pathway(positive);after=self.pathway(positive+negative)
  self.assertEqual(before['evidence_score'],100)
  self.assertLess(after['evidence_score'],0)
  self.assertEqual(after['supporting_source_count'],3)
  self.assertEqual(after['opposing_source_count'],20)
  self.assertEqual(len(after['sources']),23)
  self.assertTrue(all('contribution' in s and 'description' in s for s in after['sources']))

 def test_full_source_trace_matches_formula_and_duplicate_cannot_boost_score(self):
  rows=[self.row(str(i),'GDP improves gradually',1) for i in range(20)]
  result=self.pathway(rows+[rows[0]])
  self.assertEqual(result['supporting_source_count'],20)
  self.assertEqual(len(result['sources']),20)
  self.assertAlmostEqual(sum(s['contribution'] for s in result['sources'])/result['total_weight'],result['support_index'])

 def test_unknown_language_does_not_support_stability(self):
  result=self.pathway([self.row('a','GDP report released',0,direction_status='UNKNOWN')],'stable')
  self.assertIsNone(result['evidence_score'])
  result=self.pathway([self.row('a','GDP stable and unchanged',0,direction_status='NEUTRAL')],'stable')
  self.assertEqual(result['evidence_score'],100)

 def test_external_context_is_visible_without_influencing_local_score(self):
  rows=[self.row('a','GDP improves gradually',1),self.row('b','GDP contracts',-1,geographic_relation='EXTERNAL_CONTEXT')]
  result=self.pathway(rows)
  self.assertEqual(result['evidence_score'],100)
  self.assertEqual(result['context_source_count'],1)
  self.assertEqual(len(result['sources']),2)

 def test_horizon_filters_path_shapes_without_inventing_a_time_probability(self):
  rows=[self.row('a','GDP declines suddenly after shock',-1)]
  short=self.pathway(rows,'rapid_deterioration','1 day')
  long=self.pathway(rows,'rapid_deterioration','730 days')
  self.assertTrue(short['horizon_eligible'])
  self.assertFalse(long['horizon_eligible'])
  self.assertIsNone(long['evidence_score'])
  self.assertIsNone(short['probability'])

 def test_vietnamese_evidence_can_support_a_pathway(self):
  result=self.pathway([self.row('a','GDP Việt Nam dần phục hồi',1)])
  self.assertEqual(result['evidence_score'],100)

 def test_directional_paths_do_not_require_words_describing_the_opposite_factor(self):
  rows=[self.row('a','Vietnam CPI rises 5 percent',-1)]
  result=self.pathway(rows,'moderate_deterioration')
  self.assertEqual(result['evidence_score'],100)
  self.assertEqual(result['title'],'Deterioration')
  self.assertEqual(result['sources'][0]['evidence_role'],'SUPPORTS')
  self.assertLess(self.pathway(rows)['evidence_score'],0)

if __name__=='__main__':unittest.main()
