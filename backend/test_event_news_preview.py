import unittest
from unittest.mock import patch
from datetime import datetime,timezone,timedelta
import event_news_preview as e

class LiveEventTests(unittest.TestCase):
 def setUp(self):
  self.now=datetime(2026,10,21,12,tzinfo=timezone.utc)
  with e._lock:e._cache.clear()
 def story(self,title,days=1,source='Newswire'):
  return {'title':title,'url':'https://news.google.com/a','source':source,'description':'Oil supply markets',
          'published_at':(self.now-timedelta(days=days)).isoformat()}
 def test_distinct_real_sources_produce_uncalibrated_shares(self):
  articles=[self.story('Oil supply disruption threatens markets'),
            self.story('Production recovers amid growing oil demand'),
            self.story('Supply stable with mixed demand')]
  with patch.object(e.event_feed_sources,'retrieve',return_value=(articles,{'region':'Vietnam','feed_successes':1})):
   r=e.analyze('Energy','Oil supply','Vietnam','30 days',self.now)
  self.assertEqual(r['status'],'EVIDENCE_AVAILABLE')
  self.assertAlmostEqual(sum(x['share_pct'] for x in r['outcomes']),100)
  self.assertFalse(r['model']['calibrated_probability'])
  self.assertIsNone(r['independent_source_count'])
 def test_missing_news_has_no_arbitrary_equal_baseline(self):
  with patch.object(e.event_feed_sources,'retrieve',return_value=([],{'region':'Vietnam','feed_successes':1})):
   r=e.analyze('Energy','Oil supply','Vietnam','30 days',self.now)
  self.assertEqual(r['status'],'UNAVAILABLE')
  self.assertEqual(r['outcomes'],[])
 def test_stale_and_duplicate_sources_withheld(self):
  with patch.object(e.event_feed_sources,'retrieve',return_value=([
    self.story('Oil supply disruption threatens markets',1),
    self.story('Oil supply disruption threatens markets',1,'Different outlet'),
    self.story('Oil supply disruption threatens markets',50)],{'region':'World','feed_successes':1})):
   r=e.analyze('Energy','Oil supply','', '30 days',self.now)
  self.assertEqual(r['source_count'],1)
  self.assertEqual(r['status'],'UNAVAILABLE')
 def test_unsupported_topic_and_focus_rejected(self):
  with self.assertRaises(ValueError):e.analyze('Unknown','Factor')
  with self.assertRaises(ValueError):e.analyze('Energy','Oil supply','\nhttps://evil.local')
 def test_provider_failure_never_invents_articles(self):
  with patch.object(e.event_feed_sources,'retrieve',side_effect=e.event_feed_sources.FeedError('NEWS_PROVIDER_UNREACHABLE')):
   with self.assertRaises(e.Unavailable):e.analyze('Energy','Oil supply')
if __name__=='__main__':unittest.main()
