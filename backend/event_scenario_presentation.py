"""Choose what Pasion may call a scenario forecast.

A reviewed, temporally held-out END_STATE reference family is the only source
of outcome probabilities in this adapter. A news-weighted ten-pathway display
is explicitly a separate research *share* and not an event forecast.

Do not infer missing scenarios, rename fixed historical outcomes, or combine
marginal OCCURRENCE probabilities by normalizing them to 100%.
"""
import math

VERSION="event-scenario-presentation-v1"


def _rounded_percentages(probabilities):
    """Largest remainder at tenths of a percent; deterministic and sum 100."""
    keys=sorted(probabilities)
    raw=[probabilities[k]*1000 for k in keys]
    whole=[math.floor(x) for x in raw]
    remainder=1000-sum(whole)
    if not 0<=remainder<=len(keys):
        raise ValueError("INVALID_PROBABILITY_ROUNDING")
    order=sorted(range(len(keys)),key=lambda i:(-(raw[i]-whole[i]),keys[i]))
    for i in order[:remainder]:
        whole[i]+=1
    return {k:whole[i]/10 for i,k in enumerate(keys)}


def historical_forecast(model):
    """Only display a complete, independently reviewed 10+ outcome family.

    A rate reference is not guaranteed prospective calibration. Exactly the
    reviewed outcomes are displayed; no generic overlapping event-path labels.
    """
    if not isinstance(model,dict):
        return None
    if model.get("status")!="REFERENCE_ESTIMATE_AVAILABLE" or model.get("schema_version")!=1:
        return None
    if model.get("method")!="HISTORICAL_REFERENCE_CLASS_V1":
        return None
    if not model.get("mutually_exclusive") or not model.get("exhaustive"):
        return None
    if model.get("context",{}).get("basis")!="END_STATE":
        return None
    if model.get("validation",{}).get("status")!="PASSED_HOLDOUT_CHECK":
        return None
    if any(type(model.get(k)) is not int or model[k]<100 for k in ("training_sample_count","holdout_sample_count")):
        return None
    outcomes=model.get("scenarios")
    values=model.get("probabilities")
    if not isinstance(outcomes,list) or len(outcomes)<10 or len(outcomes)>20 or not isinstance(values,dict):
        return None
    ids=[r.get("id") for r in outcomes if isinstance(r,dict)]
    if len(ids)!=len(outcomes) or len(set(ids))!=len(ids) or set(ids)!=set(values):
        return None
    if any(not isinstance(k,str) or not k for k in ids):
        return None
    if any(type(v) not in (float,int) or not math.isfinite(v) or v<0 or v>1 for v in values.values()):
        return None
    if not math.isclose(sum(values.values()),1.0,abs_tol=1e-6):
        return None
    if any(not isinstance(r.get("title"),str) or not r["title"].strip()
           or not isinstance(r.get("resolution_rule"),str) or not r["resolution_rule"].strip()
           for r in outcomes):
        return None
    rounded=_rounded_percentages(values)
    ordered=sorted(outcomes,key=lambda r:(-values[r["id"]],r["id"]))
    rows=[]
    for i,outcome in enumerate(ordered,1):
        ident=outcome["id"]
        rows.append({"id":ident,"rank":i,"title":outcome["title"],
            "definition":outcome["resolution_rule"],
            "scenario_share_percent":rounded[ident],
            "scenario_share_status":"HISTORICAL_REFERENCE_ESTIMATE",
            "supporting_source_count":0,"opposing_source_count":0,
            "sources":[],"probability_status":"HISTORICAL_REFERENCE_ESTIMATE",
            "outcome_probability":values[ident]})
    return {
        "schema_version":1,"version":VERSION,
        "type":"HISTORICAL_REFERENCE",
        "status":"HISTORICAL_REFERENCE_ESTIMATE",
        "model_version":model.get("model_version"),
        "rows":rows,"total_percent":sum(rounded.values()),
        "sample_size":model["training_sample_count"],
        "holdout_sample_count":model["holdout_sample_count"],
        "label":"Historical estimate",
        "confidence":"REVIEWED_HISTORICAL_REFERENCE",
        "notice":"Historical reference rates passed a held-out check, but are not guaranteed to be calibrated forecasts for the future. News has NOT adjusted these estimates."
    }


def display(result):
    """Choose optional historical family, otherwise retain separate news study."""
    historical=historical_forecast(result.get("scenario_forecast"))
    if historical:return historical
    board=result.get("dynamic_scenarios") or {}
    dist=board.get("scenario_distribution") or {}
    if dist.get("status")=="NORMALIZED_EXPERIMENTAL_UNCALIBRATED":
        return {"schema_version":1,"version":VERSION,"type":"RESEARCH_SHARE",
            "status":"UNCALIBRATED_RESEARCH_SHARE","label":"Research estimate",
            "rows":board.get("ranked_scenarios") or [],
            "total_percent":dist.get("total_percent"),
            "estimated_scenario_count":dist.get("estimated_scenario_count"),
            "confidence":dist.get("quality","LOW"),
            "notice":"News-evidence research shares add to 100% by normalization. They are NOT measured probabilities of real-world events."}
    return {"schema_version":1,"version":VERSION,"type":"UNAVAILABLE",
        "status":"NOT_CALCULATED","label":"Not calculated","rows":[],"total_percent":None,
        "confidence":"UNAVAILABLE"}
