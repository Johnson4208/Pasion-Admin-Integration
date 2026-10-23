"""Ten transparent, evidence-ranked conditional event pathways.

These hypotheses are NOT mutually exclusive events, and the support indices
below are NOT calibrated probabilities. Generation uses only retrieved source
metadata/snippets. No unsourced economic facts or expert conclusions are added.
"""
import math
import re
import event_horizons

VERSION="scenario-board-v2"

_PATHS=(
 ("rapid_deterioration","Rapid deterioration","Risk or conditions worsen abruptly",-1.0,("rapid","shock","emergency","sudden","abrupt","spike"),"SHORT"),
 ("sustained_deterioration","Sustained deterioration","Negative conditions persist",-0.9,("sustained","persist","prolong","contin","ongoing","extended"),"LONG"),
 ("moderate_deterioration","Deterioration","Conditions worsen",-0.65,("declin","weaken","risk","shortage","disrupt","escalat"),"BOTH"),
 ("temporary_deterioration","Temporary setback","Downside shock is short-lived",-0.35,("temporary","brief","short","transient"),"SHORT"),
 ("mixed_risks","Mixed with downside risks","Uncertain outcome with negative tail risk",-0.15,("uncertain","concern","risk","volatil","mixed"),"BOTH"),
 ("stable","Broadly stable","No material directional change",0.0,("steady","stable","unchanged","flat","hold","pause"),"BOTH"),
 ("mixed_recovery","Mixed with recovery signs","Improving signals emerge but remain contested",0.2,("mixed","recover","eas","improv","uncertain"),"BOTH"),
 ("temporary_improvement","Temporary relief","Positive development proves short-lived",0.4,("temporary","relief","brief","short"),"SHORT"),
 ("gradual_improvement","Improvement","Conditions improve",0.65,("gradual","improv","recover","eas","growth"),"BOTH"),
 ("sustained_improvement","Sustained improvement","Positive conditions continue or strengthen",1.0,("sustain","persist","rebound","strong","stabili","expand"),"LONG")
)
_LOCAL_TERMS = {
 'rapid_deterioration':('dot ngot','khan cap','soc','tang vot'),
 'sustained_deterioration':('keo dai','tiep dien','dai dang'),
 'moderate_deterioration':('suy giam','suy yeu','rui ro','thieu hut','gian doan','leo thang'),
 'temporary_deterioration':('tam thoi','ngan han'),
 'mixed_risks':('bat dinh','lo ngai','rui ro','bien dong','trai chieu'),
 'stable':('on dinh','khong doi','di ngang','giu nguyen'),
 'mixed_recovery':('trai chieu','phuc hoi','cai thien','ha nhiet'),
 'temporary_improvement':('tam thoi','ngan han','giam bot'),
 'gradual_improvement':('dan','tung buoc','cai thien','phuc hoi'),
 'sustained_improvement':('ben vung','keo dai','manh len','mo rong'),
}

def _number(value, default=0.):
 try:
  if isinstance(value,bool):return default
  number=float(value)
  return number if math.isfinite(number) else default
 except (TypeError,ValueError,OverflowError):return default


def candidates(items,factor,focus,horizon):
 """A signed evidence balance, never a probability or confidence estimate.

 Every eligible story stays in the denominator and source trace. Opposing
 direction reduces support even when the story lacks the pathway's wording.
 Unknown language is context; it is not evidence of a stable outcome.
 """
 from event_topic_matcher import normalize
 if not isinstance(items,list):items=[]
 info=event_horizons.info(horizon)
 long_term=info['timeframe']=='LONG_TERM'
 # Deduplicate by story cluster here as well as at the retrieval boundary.
 unique={}
 for entry in items:
  if not isinstance(entry,dict):continue
  ident=str(entry.get('cluster_id') or entry.get('id') or entry.get('url') or '').strip()
  if ident and ident not in unique and _number(entry.get('weight'))>0:unique[ident]=entry
 stories=list(unique.values())
 eligible=[e for e in stories if e.get('geographic_relation') not in ('EXTERNAL_CONTEXT','UNVERIFIED_SCOPE')]
 total=sum(_number(e.get('weight')) for e in eligible)
 scored=[]
 for ident,name,description,target,terms,scope in _PATHS:
  fits=scope=='BOTH' or scope==('LONG' if long_term else 'SHORT')
  sources=[];support=opposition=0.;counts={'SUPPORTS':0,'CHALLENGES':0,'CONTEXT':0}
  for entry in stories:
   direction=max(-1.,min(1.,_number(entry.get('direction'))))
   weight=_number(entry.get('weight'))
   text=normalize(str(entry.get('title',''))+' '+str(entry.get('description','')))
   # Prefix stems are bounded at word starts: "short" cannot match "shortage".
   specific=(any(re.search(r'\b'+re.escape(normalize(t))+r'\w*\b',text) for t in terms if t!='short')
             or any(re.search(r'\b'+re.escape(t)+r'\b',text) for t in _LOCAL_TERMS[ident])
             or ('short' in terms and bool(re.search(r'\bshort (?:lived|term)\b',text))))
   known=entry.get('direction_status', 'DIRECTIONAL' if direction else 'UNKNOWN')
   role,contribution,reason='CONTEXT',0.,'NO_PATH_SPECIFICITY'
   if entry.get('geographic_relation') in ('EXTERNAL_CONTEXT','UNVERIFIED_SCOPE'):
    reason=entry['geographic_relation']
   elif known in ('UNKNOWN','UNCONFIRMED','MIXED'):
    reason='UNCLEAR_DIRECTION'
   elif abs(target)<.1:
    if abs(direction)<.1 and specific and known=='NEUTRAL':
     role,contribution,reason='SUPPORTS',weight,'EXPLICIT_STABILITY'
    elif abs(direction)>.1:
     role,contribution,reason='CHALLENGES',-weight*abs(direction),'DIRECTIONAL_CHANGE'
   elif direction*target<0:
    role,contribution,reason='CHALLENGES',-weight*abs(direction),'OPPOSITE_DIRECTION'
   elif direction*target>0 and (specific or ident in ('moderate_deterioration','gradual_improvement')):
    # Generic directional pathways do not imply a speed, duration or magnitude.
    # e.g. rising CPI supports deterioration even without the word "decline".
    role,contribution,reason='SUPPORTS',weight*abs(direction),'PATH_AND_DIRECTION' if specific else 'REPORTED_DIRECTION'
   if not fits:role,contribution,reason='CONTEXT',0.,'OUTSIDE_HORIZON'
   counts[role]+=1
   support+=max(0.,contribution);opposition+=max(0.,-contribution)
   sources.append({**entry,'evidence_role':role,'contribution':round(contribution,5),'match_reason':reason})
  sources.sort(key=lambda e:(-abs(e['contribution']),str(e.get('id',''))))
  measured=fits and total>0 and (counts['SUPPORTS']+counts['CHALLENGES']>0)
  balance=round((support-opposition)/total,4) if measured else None
  status=('OUTSIDE_HORIZON' if not fits else 'EVIDENCE_SCORED' if measured else 'PENDING_EVIDENCE')
  scored.append({'id':ident,'title':name,'definition':description,'factor':factor,'focus':focus or 'World',
   'temporal_fit':info['timeframe'],'qualifier_fit':scope,'horizon_eligible':fits,
   'support_index':balance,'evidence_score':round(balance*100) if balance is not None else None,
   'support_weight':round(support,5),'opposition_weight':round(opposition,5),'total_weight':round(total,5),
   'status':status,'supporting_source_count':counts['SUPPORTS'],'opposing_source_count':counts['CHALLENGES'],
   'context_source_count':counts['CONTEXT'],'source_count':len(sources),'sources':sources,
   'probability':None,'experimental_probability':None,'probability_status':'UNAVAILABLE_NO_CALIBRATED_EVENT_MODEL',
   'mutually_exclusive':False})
 scored.sort(key=lambda s:(not s['horizon_eligible'],s['evidence_score'] is None,-(s['support_index'] if s['support_index'] is not None else -2),s['id']))
 for rank,scenario in enumerate(scored,1):scenario['rank']=rank
 return {'version':VERSION,'status':'RANKED_RESEARCH_HYPOTHESES','ranked_scenarios':scored,
  'scenario_count':len(scored),'eligible_scenario_count':sum(s['horizon_eligible'] for s in scored),
  'timeframe':info['timeframe'],'ranking_metric':'SIGNED_EVIDENCE_BALANCE',
  'calibrated_probability':False,'hypotheses_overlap':True,'horizon_model_status':'NO_VALIDATED_HORIZON_MODEL',
  'score_formula':'100 * (supporting weight - opposing weight) / all scope-eligible story weight',
  'notice':'Evidence balance ranges from -100 to +100. It is not a probability, confidence level or horizon forecast.'}
