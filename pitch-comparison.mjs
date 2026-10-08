import {nearestPoint} from './pitch-data.mjs';
// Agreement with another estimate, not a ground truth or a clinical score.
export function comparePitchCurves(live,final,hopSeconds=.02){
 let referenceVoiced=0,bothVoiced=0,liveOnly=0;const errors=[];
 for(const p of final){const q=nearestPoint(live,p.time);if(!q||Math.abs(q.time-p.time)>hopSeconds/2+1e-6)continue;
  if(p.hz!==null){referenceVoiced++;if(q.hz!==null){bothVoiced++;errors.push(Math.abs(1200*Math.log2(q.hz/p.hz)));}}
  else if(q.hz!==null)liveOnly++;
 }
 errors.sort((a,b)=>a-b);return {actualFrameAgreement:compareMeasuredFrames(live,final),reference:'Praat: estimación de referencia, no verdad clínica',referenceVoicedWindows:referenceVoiced,alsoDetectedLive:bothVoiced,missingLive:referenceVoiced-bothVoiced,liveWhenPraatNull:liveOnly,medianDifferenceCents:errors.length?errors[Math.round((errors.length-1)*.5)]:null,p90DifferenceCents:errors.length?errors[Math.round((errors.length-1)*.9)]:null};
}

// Compare each measured live frame at its own center time, rather than counting
// one 30 ms frame repeatedly on the 10 ms reference grid. Keep grid coverage
// separately: the denominators are deliberately different.
export function compareMeasuredFrames(points,reference){
 let voiced=0,both=0,unvoiced=0,falsePositive=0,stableUnvoiced=0;const errors=[],voicedReference=reference.filter(r=>r.hz!==null);
 for(const p of points){if(!reference.length||p.time<.1||p.time>reference.at(-1).time-.1)continue;const r=nearestPoint(reference,p.time);if(!r||Math.abs(r.time-p.time)>.005001)continue;
  if(r.hz!==null){voiced++;if(p.hz!==null){both++;errors.push(Math.abs(1200*Math.log2(p.hz/r.hz)));}}
  else {unvoiced++;if(p.hz!==null){falsePositive++;const v=nearestPoint(voicedReference,p.time);if(!v||Math.abs(v.time-p.time)>.05)stableUnvoiced++;}}
 }
 errors.sort((a,b)=>a-b);return {referenceToleranceMs:5,excludedEdgeMs:100,matchedVoicedWindows:voiced,bothVoiced:both,matchedUnvoicedWindows:unvoiced,directWhenPraatNull:falsePositive,stableUnvoicedAccepted:stableUnvoiced,p90Cents:errors.length?errors[Math.round((errors.length-1)*.9)]:null,octaveDisagreements:errors.filter(c=>c>=1000&&c<=1400).length};
}
