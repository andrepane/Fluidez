import {nearestPoint} from './pitch-data.mjs';
// Agreement with another estimate, not a ground truth or a clinical score.
export function comparePitchCurves(live,final,hopSeconds=.02){
 let referenceVoiced=0,bothVoiced=0,liveOnly=0;const errors=[];
 for(const p of final){const q=nearestPoint(live,p.time);if(!q||Math.abs(q.time-p.time)>hopSeconds/2+1e-6)continue;
  if(p.hz!==null){referenceVoiced++;if(q.hz!==null){bothVoiced++;errors.push(Math.abs(1200*Math.log2(q.hz/p.hz)));}}
  else if(q.hz!==null)liveOnly++;
 }
 errors.sort((a,b)=>a-b);return {reference:'Praat: estimación de referencia, no verdad clínica',referenceVoicedWindows:referenceVoiced,alsoDetectedLive:bothVoiced,missingLive:referenceVoiced-bothVoiced,liveWhenPraatNull:liveOnly,medianDifferenceCents:errors.length?errors[Math.round((errors.length-1)*.5)]:null,p90DifferenceCents:errors.length?errors[Math.round((errors.length-1)*.9)]:null};
}
