"""Ten transparent, evidence-ranked conditional event pathways.

These hypotheses are NOT mutually exclusive events, and the support indices
below are NOT calibrated probabilities. Generation uses only retrieved source
metadata/snippets. No unsourced economic facts or expert conclusions are added.
"""
import math
import re
import event_horizons

VERSION="scenario-board-v1"

_PATHS=(
 ("rapid_deterioration","Rapid deterioration","Risk or conditions worsen abruptly",-1.0,("rapid","shock","emergency","sudden","abrupt","spike"),"SHORT"),
 ("sustained_deterioration","Sustained deterioration","Negative conditions persist",-0.9,("sustained","persist","prolong","contin","ongoing","extended"),"LONG"),
 ("moderate_deterioration","Moderate deterioration","Conditions weaken further",-0.65,("declin","weaken","risk","shortage","disrupt","escalat"),"BOTH"),
 ("temporary_deterioration","Temporary setback","Downside shock is short-lived",-0.35,("temporary","brief","short","transient"),"SHORT"),
 ("mixed_risks","Mixed with downside risks","Uncertain outcome with negative tail risk",-0.15,("uncertain","concern","risk","volatil","mixed"),"BOTH"),
 ("stable","Broadly stable","No material directional change",0.0,("steady","stable","unchanged","flat","hold","pause"),"BOTH"),
 ("mixed_recovery","Mixed with recovery signs","Improving signals emerge but remain contested",0.2,("mixed","recover","eas","improv","uncertain"),"BOTH"),
 ("temporary_improvement","Temporary relief","Positive development proves short-lived",0.4,("temporary","relief","brief","short"),"SHORT"),
 ("gradual_improvement","Gradual improvement","Conditions improve incrementally",0.65,("gradual","improv","recover","eas","growth"),"BOTH"),
 ("sustained_improvement","Sustained improvement","Positive conditions continue or strengthen",1.0,("sustain","persist","rebound","strong","stabili","expand"),"LONG")
)
def _bounded(value):
 try:return max(0.,min(1.,float(value)))
 except (ValueError,TypeError,OverflowError):return 0.

def candidates(items,factor,focus,horizon):
 """Rank 10 scenario *hypotheses* by directional and wording support.

 A scenario with no appropriate evidence is shown as PENDING_EVIDENCE. Scores
 are relative lexical support indices (not probabilities or confidence).
 """
 if not isinstance(items,list):items=[]
 long_term=event_horizons.info(horizon)['timeframe']=='LONG_TERM'
 scored=[]
 for ident,name,description,target,terms,scope in _PATHS:
  ranked=[]
  for entry in items:
   if not isinstance(entry,dict):continue
   direction=max(-1.,min(1.,float(entry.get('direction',0))))
   weight=max(0.,float(entry.get('weight',0)))
   if weight<=0:continue
   content=(str(entry.get('title',''))+' '+str(entry.get('description',''))).casefold()
   specificity=any(t in content for t in terms)
   # Match directional signals but do not equate generic sentiment with
   # evidence of a specific temporal shape.
   alignment=max(0.,1.-abs(direction-target)/1.6)
   if alignment<0.2:continue
   evidence_factor=1.0 if specificity else 0.25
   score=weight*alignment*evidence_factor
   if score>0:ranked.append((score,entry,specificity))
  ranked.sort(key=lambda x:(-x[0],str(x[1].get('id',''))))
  supported=[v for v in ranked if v[2]]
  summed=sum(v[0] for v in supported[:10])
  # No claimed "probability". Normalizing by all evidence weights only
  # yields a transparent coverage index, and is not a probability model.
  evidence_total=sum(max(0.,float(e.get('weight',0))) for e in items if isinstance(e,dict))
  support_index=round(summed/evidence_total,3) if evidence_total>0 and supported else None
  sources=[{'id':e.get('id'),'title':e.get('title'),'url':e.get('url'),
            'source':e.get('source'),'published_at':e.get('published_at'),
            'weight':e.get('weight'),'direction':e.get('direction')}
           for _,e,_ in supported[:3]]
  scored.append({'id':ident,'title':name,'definition':description,'factor':factor,'focus':focus or 'World',
    'temporal_fit':'LONG_TERM' if long_term else 'SHORT_TERM',
    'qualifier_fit':scope,'support_index':support_index,
    'status':'RESEARCH_SUPPORT_ONLY' if supported else 'PENDING_EVIDENCE',
    'supporting_source_count':len(supported),'sources':sources,'probability':None,
    'probability_status':'NOT_CALIBRATED','mutually_exclusive':False})
 scored.sort(key=lambda s:(s['support_index'] is None,-(s['support_index'] or 0),s['id']))
 for rank,s in enumerate(scored,1):s['rank']=rank
 return {'version':VERSION,'status':'RANKED_RESEARCH_HYPOTHESES','ranked_scenarios':scored,
         'minimum_display_count':10,'scenario_count':len(scored),'timeframe':'LONG_TERM' if long_term else 'SHORT_TERM',
         'ranking_metric':'LEXICAL_EVIDENCE_SUPPORT_INDEX_NOT_PROBABILITY',
         'calibrated_probability':False,'hypotheses_overlap':True,
         'notice':'Ten conditional research pathways, not ten mutually exclusive or calibrated forecast outcomes. Scores cannot be added to 100%.'}
