// Analysis-only zero-phase low-pass evidence. Never changes saved PCM or STFT.
// Two forward/backward biquad passes reduce high-frequency dominance; original
// NSDF support is still required before a filtered candidate can be selected.
export class PitchEvidenceFilter {
 constructor(size,rate){this.a=new Float32Array(size);this.b=new Float32Array(size);const w=2*Math.PI*Math.min(1200,rate*.2)/rate,c=Math.cos(w),s=Math.sin(w),alpha=s/(2*Math.SQRT1_2),a0=1+alpha;this.coefficients=[(1-c)/2/a0,(1-c)/a0,(1-c)/2/a0,-2*c/a0,(1-alpha)/a0];}
 pass(input,output,reverse){const [b0,b1,b2,a1,a2]=this.coefficients;let x1=input[reverse?input.length-1:0],x2=x1,y1=x1,y2=x1;for(let n=0;n<input.length;n++){const i=reverse?input.length-1-n:n,x=input[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;output[i]=y;x2=x1;x1=x;y2=y1;y1=y;}}
 process(input){this.pass(input,this.a,false);this.pass(this.a,this.b,true);return this.b;}
}
