"""Public RSS event-research preview, adapted from SolvAI58 evidence weighting.

Not a probability estimator, trade signal, or approved news claim. No SSRF:
only fixed Google News RSS hosts and constructed queries. Fail closed on
stale/no content; deduplicate publisher-headline groups, not RSS entries.
"""
import hashlib,html,json,math,re,threading,time,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode,urlparse
from urllib.request import Request,urlopen
from urllib.error import URLError,HTTPError
import event_feed_sources
import event_bayesian

_TOPICS={
 'Geopolitics': {'Conflict risk':('conflict escalation ceasefire regional security','conflict escalation ceasefire stability'),
                 'Sanctions':('sanctions export restrictions exemptions','sanctions restrictions relief'),
                 'Trade disruption':('shipping trade route supply disruption','trade disruption normalization')},
 'Economy':{'Inflation':('inflation CPI consumer prices central bank','inflation acceleration deceleration'),
            'GDP growth':('GDP growth economic output recession','GDP contraction expansion'),
            'Labor market':('unemployment payroll jobs hiring layoffs','labor deterioration recovery')},
 'Energy':{'Oil supply':('crude oil OPEC oil supply disruption production','oil production shortages oversupply'),
           'Natural gas':('natural gas supply LNG disruptions demand','natural gas supply shortage surplus'),
           'Energy prices':('energy prices electricity fuel costs','energy price surge decline')},
 'Banking & Credit':{'Credit conditions':('bank lending credit conditions tightening','credit tightening easing'),
 'Bank lending':('bank loan demand lending standards','lending contraction expansion'),
 'Central bank policy':('interest rates central bank monetary policy','rates hike cut')},
 'Business':{'M&A activity':('mergers acquisitions deal activity','deal slowdown recovery'),
 'Earnings outlook':('corporate earnings guidance outlook','profit downside upside'),
 'Hiring plans':('corporate hiring freeze expansion','hiring freeze rebound')},
 'Consumer':{'Consumer demand':('retail spending consumer demand','consumer spending weak strong'),
 'Household spending':('household spending disposable income','household spending contraction rebound'),
 'Consumer confidence':('consumer confidence sentiment surveys','consumer confidence weak strong')},
 'Health':{'Drug approvals':('drug approval FDA clinical trial decision','FDA reject approve'),
 'Healthcare costs':('healthcare costs insurance premiums','healthcare inflation relief'),
 'Public health':('public health outbreak health agency','outbreak escalation containment')},
 'Markets':{'Equity volatility':('stock volatility VIX markets','market volatility surge settle'),
 'Market liquidity':('market liquidity funding stress','liquidity tightening improving'),
 'Risk appetite':('investor risk appetite equity markets','risk off risk on')},
 'Politics & Policy':{'Fiscal policy':('government budget stimulus deficit','fiscal tightening stimulus'),
 'Regulation':('financial regulation compliance rule','regulation tightening easing'),
 'Trade policy':('trade tariffs trade agreement negotiations','tariffs escalation reduction')},
 'Real Estate':{'Property prices':('housing home prices real estate','house prices downturn recovery'),
 'Mortgage rates':('mortgage rates housing finance','mortgage rates rising falling'),
 'Commercial demand':('commercial real estate occupancy leasing','commercial property slump recovery')},
 'Science':{'Research funding':('research funding science budget','research grant funding cut increase'),
 'Clinical progress':('clinical trial research outcomes','clinical trial failure success'),
 'Technology adoption':('technology deployment industry adoption','technology adoption slowdown acceleration')},
 'Technology':{'AI adoption':('artificial intelligence enterprise adoption','AI adoption slow accelerate'),
 'Semiconductor supply':('semiconductor chip production capacity','chip shortage surplus'),
 'Cybersecurity':('cybersecurity breaches threats regulation','cybersecurity incidents reduction')}
}
_NEG=('escalat','surge','increase','tighten','shortage','disrupt','risk','crisis','recession','inflation rises','sanction','declin','weak','cut','hike','fall','contract','drop','warn','stress','layoff')
_POS=('eas','improv','recover','rebound','cool','decline in inflation','ceasefire','expand','growth','relief','stabiliz','strong','surplus','deescalat','approve')
_lock=threading.RLock()
_cache={}
_TTL=900

class Unavailable(Exception):pass

def _clean(s):return re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',html.unescape(s or ''))).strip()[:400]
def _tokens(s):return set(re.findall(r'[a-z0-9]+',s.casefold()))
def _date(s):
 try:
  x=parsedate_to_datetime(s).astimezone(timezone.utc)
  return x
 except (TypeError,ValueError,OverflowError,AttributeError):return None
def _round_shares(xs):
 vals=[round(x*100,1) for x in xs]
 diff=round(100-sum(vals),1)
 vals[max(range(len(vals)),key=lambda i:xs[i])]=round(vals[max(range(len(vals)),key=lambda i:xs[i])]+diff,1)
 return vals

def fetch(query,focus):
 # User text only becomes a query parameter, never a URL or hostname.
 terms=' '.join([query,focus]).strip()[:220]
 params=urlencode({'q':terms,'hl':'en-US','gl':'US','ceid':'US:en'})
 url='https://news.google.com/rss/search?'+params
 req=Request(url,headers={'User-Agent':'Pasion-EventResearch/1.0 (public RSS preview)','Accept':'application/rss+xml,application/xml'})
 try:
  with urlopen(req,timeout=9) as response:
   if response.status!=200:raise Unavailable('NEWS_PROVIDER_HTTP_FAILURE')
   data=response.read(1_000_001)
 except (TimeoutError,OSError,HTTPError,URLError) as exc:raise Unavailable('NEWS_PROVIDER_UNREACHABLE') from exc
 if len(data)>1_000_000:raise Unavailable('NEWS_FEED_TOO_LARGE')
 try:root=ET.fromstring(data)
 except ET.ParseError as exc:raise Unavailable('INVALID_RSS') from exc
 rows=[]
 for node in root.findall('.//channel/item')[:50]:
  title=_clean(node.findtext('title'));link=(node.findtext('link') or '').strip()
  when=_date(node.findtext('pubDate'))
  if not title or not link.startswith('https://') or not when:continue
  if when>datetime.now(timezone.utc):continue
  origin=_clean(node.findtext('source') or title.rsplit(' - ',1)[-1])[:100]
  desc=_clean(node.findtext('description'))
  rows.append({'title':title,'url':link,'source':origin,'published_at':when.isoformat(),'description':desc})
 return rows

def analyze(category,factor,focus='',horizon='30 days',now=None):
 now=now or datetime.now(timezone.utc)
 if factor not in _TOPICS.get(category,{}):raise ValueError('Unsupported category or event factor')
 if horizon not in ('7 days','30 days','90 days','180 days'):raise ValueError('Unsupported research horizon')
 if not isinstance(focus,str) or len(focus)>120 or any(c in focus for c in '\r\n\x00'):raise ValueError('Invalid geographical focus')
 lookback=int(horizon.split(' ')[0])
 key=(category,factor,focus,horizon)
 with _lock:
  saved=_cache.get(key)
  if saved and time.monotonic()-saved[0]<_TTL:return json.loads(json.dumps(saved[1]))
 terms,_=_TOPICS[category][factor]
 try:rows,coverage=event_feed_sources.retrieve(terms,focus)
 except event_feed_sources.FeedError as exc:raise Unavailable(str(exc)) from exc
 seen=set();items=[];age_limit=max(lookback,30)
 for row in rows:
  t=datetime.fromisoformat(row['published_at'])
  age=(now-t).total_seconds()/86400
  if age<0 or age>age_limit:continue
  # Source title and normalized headline are a rough story cluster.
  tokens=sorted(_tokens(row['title'])-_tokens(row['source']))
  group=hashlib.sha256((' '.join(tokens)).encode()).hexdigest()[:16]
  if group in seen:continue
  seen.add(group)
  query_relevance=len(_tokens(row['title']+' '+row['description'])&_tokens(terms+' '+focus)) /max(1,len(_tokens(terms+' '+focus)))
  if query_relevance<.06:continue
  text=(row['title']+' '+row['description']).casefold()
  positive=sum(1 for w in _POS if w in text);negative=sum(1 for w in _NEG if w in text)
  direction=(positive-negative)/max(1,positive+negative)
  # Relevance/recency are heuristic research weights, not truth confidence.
  freshness=math.exp(-age/10)
  provenance_multiplier=1.15 if row.get('source_tier')=='PRIMARY_OFFICIAL_UNVERIFIED_CLAIM' else 1.0
  weight=max(.02,query_relevance)*(.25+.75*freshness)*provenance_multiplier
  items.append({**row,'id':group,'cluster_id':group,'age_days':round(age,1),'relevance':round(query_relevance,3),
    'direction':round(direction,3),'weight':round(weight,5),'provenance_multiplier':provenance_multiplier,'source_tier':row.get('source_tier','RSS_AGGREGATED_UNVERIFIED')})
 # An independent source count is NOT measured from one aggregator.
 if len(items)<2:
  return {'version':1,'status':'UNAVAILABLE','reason_code':'INSUFFICIENT_RECENT_DISTINCT_STORIES',
   'items':items,'outcomes':[],'source_count':len(items),'independent_source_count':None,'coverage':coverage,'bayesian_forecast':event_bayesian.unavailable(),
   'calibrated_probability':False,'probability_status':'UNAVAILABLE_NO_CALIBRATED_EVENT_MODEL'}
 total=sum(x['weight'] for x in items)
 tilt=sum(x['direction']*x['weight'] for x in items)/total
 # Softmax with strong shrinkage: evidence comparison only, cannot be calibrated.
 raw=[math.exp(-.9*tilt),math.exp(.25-.75*abs(tilt)),math.exp(.9*tilt)]
 denom=sum(raw);shares=_round_shares([x/denom for x in raw])
 counts=[sum(1 for x in items if x['direction']<-.1),sum(1 for x in items if abs(x['direction'])<=.1),sum(1 for x in items if x['direction']>.1)]
 result={'version':1,'status':'EVIDENCE_AVAILABLE','category':category,'factor':factor,'focus':focus,'horizon':horizon,
  'outcomes':[{'id':key,'share_pct':pct,'evidence_count':count} for key,pct,count in zip(('weakening','mixed','supportive'),shares,counts)],
  'items':sorted(items,key=lambda x:x['weight'],reverse=True)[:24],'source_count':len(items),
  'independent_source_count':None,'coverage':coverage,'generated_at':now.isoformat(),
  'bayesian_forecast':event_bayesian.unavailable(),
  'model':{'name':'solvai58-inspired-rss-evidence-share-v2','components':['recent RSS','query relevance','directional lexicon','deduplicated headlines','explicit primary-source provenance uplift (heuristic)'],
   'calibrated_probability':False,'label':'Evidence-weighted share','warning':'Not a probability. News publication and sentiment are not proof of event outcomes.'},
  'probability_status':'UNAVAILABLE_NO_CALIBRATED_EVENT_MODEL'}
 with _lock:_cache[key]=(time.monotonic(),result)
 return result
