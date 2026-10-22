"""Bounded public-news retrieval for Pasion event evidence.

Two data channels: Google News search RSS (multiple editorial editions) and
GDELT DOC 2.0 ArtList. Provider failure is partial, never silently rewritten
to verified news. No arbitrary URLs are fetched from user input.
"""
import concurrent.futures
import html
from html.parser import HTMLParser
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime,timezone,timedelta
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError,URLError
from urllib.parse import urlencode,urlsplit
from urllib.request import HTTPRedirectHandler,Request,build_opener

# One user's search fans out to at most 6 fixed provider requests.
MAX_RESP=1_300_000
_REGION_ALIASES={
 "world":("World","",None), "global":("World","",None),
 "worldwide":("World","",None), "international":("World","",None),
 "all regions":("World","",None),"earth":("World","",None),
 "asia":("Asia","(Asia OR Asian OR ASEAN OR Southeast Asia)",None),
 "asian":("Asia","(Asia OR Asian OR ASEAN OR Southeast Asia)",None),
 "southeast asia":("Southeast Asia","(ASEAN OR Southeast Asia OR Vietnam OR Thailand OR Indonesia OR Malaysia)",None),
 "asean":("Southeast Asia","(ASEAN OR Southeast Asia OR Vietnam OR Thailand OR Indonesia OR Malaysia)",None),
 "vietnam":("Vietnam","(Vietnam OR Viet Nam OR Việt Nam)", "VN"),
 "viet nam":("Vietnam","(Vietnam OR Viet Nam OR Việt Nam)","VN"),
 "việt nam":("Vietnam","(Vietnam OR Viet Nam OR Việt Nam)","VN"),
 "us":("United States","(US OR USA OR United States)", "US"),
 "usa":("United States","(US OR USA OR United States)", "US"),
 "united states":("United States","(US OR USA OR United States)", "US"),
 "america":("United States","(US OR USA OR United States)", "US"),
 "europe":("Europe","(Europe OR European OR EU)",None),
 "european union":("Europe","(Europe OR European Union OR EU)",None),
 "africa":("Africa","(Africa OR African)",None),
 "middle east":("Middle East","(Middle East OR Gulf OR Israel OR Iran)",None),
 "latin america":("Latin America","(Latin America OR South America OR Brazil OR Mexico)",None)
}

class FeedError(Exception):pass
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  return None

_OPENER=build_opener(NoRedirect())

def geography(value):
 if not isinstance(value,str) or len(value)>120 or any(ch in value for ch in '\r\n\x00'):
  raise ValueError('Invalid focus')
 clean=' '.join(value.strip().split())
 if not clean:return ("World","",None)
 alias=_REGION_ALIASES.get(clean.casefold())
 if alias:return alias
 # Free-text search is supported but bounded. It cannot become URL or GDELT syntax.
 if not re.fullmatch(r"[\w\s.\-']{1,70}",clean,re.UNICODE):
  raise ValueError('Invalid focus query')
 if len(clean.split())>5:raise ValueError('Focus too broad')
 return (clean,'"'+clean.replace('"','')+'"',None)

def _text(value):
 return re.sub(r'\s+',' ',re.sub(r'<[^>]*>',' ',html.unescape(str(value or '')))).strip()[:500]

def _get(url,accept):
 parsed=urlsplit(url)
 if (parsed.scheme!='https' or parsed.hostname not in ('news.google.com','api.gdeltproject.org','www.federalreserve.gov','mykn.kuehne-nagel.com')
     or parsed.port not in (None,443) or parsed.username or parsed.password):
  raise FeedError("UNTRUSTED_PROVIDER")
 req=Request(url,headers={'User-Agent':'Pasion-Research/1.1 (public news search)','Accept':accept})
 try:
  with _OPENER.open(req,timeout=7) as response:
   if response.status!=200:raise FeedError("NEWS_HTTP_ERROR")
   raw=response.read(MAX_RESP+1)
 except (OSError,URLError,HTTPError,TimeoutError) as exc:
  raise FeedError("NEWS_NETWORK_OR_PROVIDER_ERROR") from exc
 if len(raw)>MAX_RESP:raise FeedError("NEWS_RESPONSE_TOO_LARGE")
 return raw

def _rss(query,edition):
 hl,gl,ceid=edition
 address="https://news.google.com/rss/search?"+urlencode({'q':query,'hl':hl,'gl':gl,'ceid':ceid})
 try:root=ET.fromstring(_get(address,'application/rss+xml, application/xml'))
 except ET.ParseError as exc:raise FeedError("RSS_PARSE_FAILED") from exc
 now=datetime.now(timezone.utc);result=[]
 for node in root.findall('.//channel/item')[:65]:
  title=_text(node.findtext('title'))
  url=str(node.findtext('link') or '').strip()
  source=_text(node.findtext('source') or title.rsplit(' - ',1)[-1])
  try:published=parsedate_to_datetime(node.findtext('pubDate') or '').astimezone(timezone.utc)
  except (TypeError,ValueError,OverflowError,AttributeError):continue
  if not title or not source or urlsplit(url).hostname!='news.google.com' or published>now:continue
  result.append({'title':title,'url':url,'source':source,'published_at':published.isoformat(),
    'description':_text(node.findtext('description')),'provider':'Google News RSS',
    'time_basis':'PUBLISHED','edition':gl})
 return result

def _gdelt(query):
 # GDELT may reject, throttle, or temporarily return HTML; treat as optional.
 url="https://api.gdeltproject.org/api/v2/doc/doc?"+urlencode({'query':query,'mode':'artlist',
     'format':'json','sort':'datedesc','maxrecords':50,'timespan':'30d'})
 try:data=json.loads(_get(url,'application/json'))
 except (ValueError,UnicodeError) as exc:raise FeedError("GDELT_INVALID_JSON") from exc
 now=datetime.now(timezone.utc)
 result=[]
 for article in (data.get('articles') or [])[:60]:
  if not isinstance(article,dict):continue
  url=str(article.get('url') or '')
  parsed=urlsplit(url)
  if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:continue
  title=_text(article.get('title'))
  source=_text(article.get('domain') or parsed.hostname)
  raw=str(article.get('seendate') or '')
  try:when=datetime.strptime(raw[:14],'%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc)
  except ValueError:
   try:when=datetime.strptime(raw[:8],'%Y%m%d').replace(tzinfo=timezone.utc)
   except ValueError:continue
  if not title or when>now:continue
  result.append({'title':title,'url':url,'source':source,'published_at':when.isoformat(),
    'description':'','provider':'GDELT DOC 2.0','time_basis':'FIRST_SEEN','edition':article.get('language') or 'global'})
 return result

def _variants(topic_terms,focus,location):
 if 'shipping trade route supply disruption' in topic_terms and location[0]=='Vietnam':
  return [
   ('("port congestion" OR "shipping delays" OR "Gemalink" OR "Cat Lai") Vietnam when:30d',('en-US','US','US:en')),
   ('("vessel delays" OR "port congestion" OR "Vietnam ports") Vietnam when:30d',('en-GB','GB','GB:en')),
   ('("ùn tắc cảng" OR "tàu chờ cảng" OR "chậm thông quan") Việt Nam when:30d',('vi-VN','VN','VN:vi')),
   ('("Cát Lái" OR "Cái Mép" OR "Gemalink") (ùn tắc OR trễ tàu OR chậm) when:30d',('vi-VN','VN','VN:vi'))]

 # Do not require every word of a long keyword sequence to appear in one article.
 all_terms=[w for w in re.findall(r"[A-Za-z][A-Za-z-]*",topic_terms) if len(w)>2]
 a=all_terms[:3]
 if not a:raise ValueError("No search terms")
 topic='('+' OR '.join(a)+')'
 specialized=' '.join(all_terms[:2])
 geographical=location[1]
 local_query=(topic+' '+geographical).strip()
 fallback=(specialized+' '+geographical).strip()
 if location[0]=='World':
  local_query=topic
  fallback=' '.join(all_terms[:3])
 return [(local_query,('en-US','US','US:en')),
         (fallback,('en-GB','GB','GB:en')),
         ((topic+' '+geographical).strip(),('en-SG','SG','SG:en')),
         ((topic+' '+geographical).strip(),('vi-VN','VN','VN:vi'))]

def _fed_official():
 # A directly published Federal Reserve RSS channel; unlike aggregators, provenance
 # is the publishing institution itself. Other topics do not use this source.
 address='https://www.federalreserve.gov/feeds/press_monetary.xml'
 try:root=ET.fromstring(_get(address,'application/rss+xml, application/xml'))
 except ET.ParseError as exc:raise FeedError('FED_RSS_PARSE_FAILED') from exc
 results=[];now=datetime.now(timezone.utc)
 for node in root.findall('.//channel/item')[:50]:
  title=_text(node.findtext('title'))
  link=str(node.findtext('link') or '').strip()
  if urlsplit(link).hostname not in ('www.federalreserve.gov','federalreserve.gov'):continue
  try:published=parsedate_to_datetime(node.findtext('pubDate') or '').astimezone(timezone.utc)
  except (TypeError,ValueError,OverflowError,AttributeError):continue
  if not title or published>now:continue
  results.append({'title':title,'url':link,'source':'Board of Governors of the Federal Reserve System',
   'published_at':published.isoformat(),'description':_text(node.findtext('description')),
   'provider':'Federal Reserve official RSS','time_basis':'PUBLISHED','edition':'US',
   'source_tier':'PRIMARY_OFFICIAL_UNVERIFIED_CLAIM'})
 return results

class _PlainText(HTMLParser):
 def __init__(self):
  super().__init__()
  self.parts=[]
  self.silent=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','noscript'):self.silent+=1
 def handle_endtag(self,tag):
  if tag in ('script','style','noscript'):self.silent=max(0,self.silent-1)
 def handle_data(self,data):
  if not self.silent and data.strip():self.parts.append(data.strip())

def _port_report_vietnam():
 """Fetch recent first-party weekly port operations, scoped to Vietnam paragraph.

 This is not an official government feed; report first published by a logistics
 operator. Only URLs constructed from the observed public weekly path pattern.
 A failed report does not contaminate or satisfy other providers.
 """
 now=datetime.now(timezone.utc)
 # Reports dated on Tuesdays; attempt current and preceding two Tuesdays.
 offset=(now.weekday()-1)%7
 tuesday=(now-timedelta(days=offset)).date()
 results=[]
 for weeks in (0,1,2):
  report_day=tuesday-timedelta(days=7*weeks)
  if (now.date()-report_day).days>30:continue
  link='https://mykn.kuehne-nagel.com/news/article/port-operational-updates-from-'+report_day.strftime('%d-%m-%Y')
  try:payload=_get(link,'text/html')
  except FeedError:continue
  parser=_PlainText()
  try:parser.feed(payload.decode('utf-8','replace'))
  except (UnicodeError,ValueError):continue
  full=' '.join(parser.parts)
  # Restrict to a local paragraph, not the entire global market report.
  segments=[]
  for m in re.finditer(r'\bVietnam\b',full,re.I):
   excerpt=full[m.end():m.end()+650]
   if re.search(r'\b(?:Cat Lai|Vung Tau|Gemalink|Ho Chi Minh City|Cai Mep)\b',excerpt,re.I):
    segments.append(excerpt)
  if not segments:continue
  content=segments[-1]
  if not re.search(r'congestion|delay|waiting|berth|yard|disrupt',content,re.I):continue
  results.append({'title':'Vietnam port congestion and shipping delays — operational bulletin',
   'description':_text(content),'url':link,'source':'Kuehne+Nagel Sea Logistics',
   'published_at':datetime.combine(report_day,datetime.min.time(),tzinfo=timezone.utc).isoformat(),
   'provider':'Kuehne+Nagel public port operations','time_basis':'REPORT_DATE',
   'source_tier':'INDUSTRY_OPERATOR_UNVERIFIED'})
 return results

def retrieve(topic_terms,focus):
 region=geography(focus)
 jobs=[('Google News RSS',query,edition) for query,edition in _variants(topic_terms,focus,region)]
 gdeltquery=('"shipping disruption" Vietnam' if 'shipping trade route supply disruption' in topic_terms and region[0]=='Vietnam' else ' '.join(re.findall(r"[A-Za-z]+",topic_terms)[:2])+' '+region[1]).strip()
 jobs.append(('GDELT DOC 2.0',gdeltquery,None))
 if region[0]=='Vietnam' and 'shipping trade route supply disruption' in topic_terms:
  jobs.append(('Kuehne+Nagel public port operations','',None))
 if any(word in topic_terms.lower() for word in ('central bank','interest rates','inflation','credit conditions','mortgage rates','monetary policy')):
  jobs.append(('Federal Reserve official RSS','',None))
 results=[];failed=[];succeeded=0
 def job(spec):
  name,q,edition=spec
  try:return name,(_port_report_vietnam() if name=='Kuehne+Nagel public port operations' else _fed_official() if name=='Federal Reserve official RSS' else _gdelt(q) if edition is None else _rss(q,edition)),None
  except (FeedError,ValueError,TypeError,KeyError) as e:return name,[],getattr(e,'args',['PROVIDER_ERROR'])[0]
 with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
  futures=[pool.submit(job,s) for s in jobs]
  for future in concurrent.futures.as_completed(futures):
   name,items,issue=future.result()
   if issue:failed.append({'provider':name,'reason':str(issue)[:80]})
   else:succeeded+=1;results.extend(items)
 if succeeded==0:raise FeedError("ALL_NEWS_FEEDS_UNAVAILABLE")
 # No claim of source independence: providers can syndicate the same article.
 return results,{'region':region[0],'scope_query':region[1],'requests':len(jobs),
   'feed_successes':succeeded,'feed_failures':failed,'raw_results':len(results),
   'providers':sorted({r['provider'] for r in results})}
