import unittest
import json
from unittest.mock import patch
import event_feed_sources as s

class RegionalNewsTests(unittest.TestCase):
 def test_world_global_are_not_lexical_search_terms(self):
  self.assertEqual(s.geography('World')[1],'')
  self.assertEqual(s.geography('global')[1],'')
 def test_regions_are_explicit(self):
  self.assertEqual(s.geography('Asia')[0],'Asia')
  self.assertEqual(s.geography('Southeast Asia')[0],'Southeast Asia')
  self.assertEqual(s.geography('Vietnam')[2],'VN')
  self.assertEqual(s.geography('United States')[2],'US')
 def test_user_text_cannot_change_provider_host(self):
  with self.assertRaises(ValueError):s.geography('https://private.example')
  with self.assertRaises(ValueError):s.geography('Asia\nattack')
 def test_success_with_secondary_source_available(self):
  def job(q,edition):
   return [{'title':'Oil supply tightens','url':'https://news.google.com/articles/x','source':'Example',
      'description':'Crude production','published_at':'2026-10-20T02:00:00+00:00','provider':'Google News RSS'}]
  with patch.object(s,'_rss',side_effect=job),patch.object(s,'_gdelt',side_effect=s.FeedError('GDELT unavailable')):
   rows,coverage=s.retrieve('oil supply','Asia')
  self.assertEqual(coverage['region'],'Asia')
  self.assertEqual(coverage['feed_successes'],4)
  self.assertEqual(coverage['requests'],5)
  self.assertTrue(rows)

 def test_gdelt_preserves_seconds_and_first_seen_time_basis(self):
  payload={'articles':[{'title':'GDP report','url':'https://example.org/gdp','domain':'example.org','seendate':'20200102T123456Z'}]}
  with patch.object(s,'_get',return_value=json.dumps(payload).encode()):
   rows=s._gdelt('GDP')
  self.assertEqual(rows[0]['published_at'],'2020-01-02T12:34:56+00:00')
  self.assertEqual(rows[0]['time_basis'],'FIRST_SEEN')

 def test_scope_is_distinct_from_foreign_and_unconfirmed_context(self):
  self.assertEqual(s.scope_relation('Lạm phát Việt Nam hạ nhiệt','','Vietnam'),'DIRECT_SCOPE')
  self.assertEqual(s.scope_relation('US inflation rises','','Vietnam','Federal Reserve'),'EXTERNAL_CONTEXT')
  self.assertEqual(s.scope_relation('Inflation report released','','Vietnam'),'UNVERIFIED_SCOPE')
  self.assertEqual(s.scope_relation('Inflation report released','','World'),'GLOBAL_SCOPE')
  self.assertEqual(s.scope_relation('US inflation rises','','United States'),'DIRECT_SCOPE')
  self.assertEqual(s.scope_relation('U.S. inflation rises','','Vietnam'),'EXTERNAL_CONTEXT')
  self.assertEqual(s.scope_relation('Tell us about inflation','','United States'),'UNVERIFIED_SCOPE')

 def test_publisher_name_cannot_establish_the_articles_geographical_scope(self):
  self.assertEqual(s.scope_relation('Iran conflict could spread - Vietnam.vn','Iran conflict Vietnam.vn','Vietnam','Vietnam.vn'),'EXTERNAL_CONTEXT')
  self.assertEqual(s.scope_relation('Inflation report - Vietnam.vn','Inflation data Vietnam.vn','Vietnam','Vietnam.vn'),'UNVERIFIED_SCOPE')
  self.assertEqual(s.scope_relation('Vietnam inflation cools - Vietnam.vn','','Vietnam','Vietnam.vn'),'DIRECT_SCOPE')
if __name__=='__main__':unittest.main()
