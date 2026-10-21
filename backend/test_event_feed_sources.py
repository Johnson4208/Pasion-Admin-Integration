import unittest
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
if __name__=='__main__':unittest.main()
