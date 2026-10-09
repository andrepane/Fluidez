// Local causal STFT of the original mono PCM. No F0 or voice classification.
export const SPECTRAL_CONFIG=Object.freeze({size:2048,hopSeconds:.005,bands:128,maxHz:8000,minDb:-90,maxDb:-20,maxSeconds:120});
export class SpectralEngine{
 constructor(rate,config=SPECTRAL_CONFIG,{retain=true}={}){
  this.retain=retain;this.columnCount=0;this.rate=rate;this.config=config;this.hop=Math.round(rate*config.hopSeconds);this.total=0;this.fill=0;this.write=0;this.gaps=0;this.columns=[];this.cpuMs=0;
  const n=config.size;this.ring=new Float32Array(n);this.re=new Float64Array(n);this.im=new Float64Array(n);this.window=Float64Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(n-1)));this.sum=this.window.reduce((a,b)=>a+b,0);
  this.twiddle=Float64Array.from({length:n},(_,i)=>i%2===0?Math.cos(-2*Math.PI*(i/2)/n):Math.sin(-2*Math.PI*((i-1)/2)/n));
 }
 push(samples,endFrame){
  const start=performance.now(),out=[],{size,bands,maxHz,minDb,maxDb,maxSeconds}=this.config;
  if(endFrame!==this.total+samples.length){this.total=endFrame-samples.length;this.fill=0;this.write=0;this.gaps++;}
  for(const sample of samples){
   this.ring[this.write]=sample;this.write=(this.write+1)%size;this.fill=Math.min(size,this.fill+1);this.total++;
   if(this.fill<size||this.total%this.hop!==0||this.total/this.rate>maxSeconds)continue;
   let mean=0;for(let i=0;i<size;i++)mean+=this.ring[i];mean/=size;
   for(let i=0;i<size;i++){this.re[i]=(this.ring[(this.write+i)%size]-mean)*this.window[i];this.im[i]=0;}
   // In-place radix-2 FFT. Arrays and twiddles are reused for every frame.
   for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const x=this.re[i];this.re[i]=this.re[j];this.re[j]=x;}}
   for(let len=2;len<=size;len*=2){const half=len/2,step=size/len;for(let at=0;at<size;at+=len)for(let j=0;j<half;j++){const k=j*step*2,c=this.twiddle[k],s=this.twiddle[k+1],a=at+j,b=a+half,tr=c*this.re[b]-s*this.im[b],ti=s*this.re[b]+c*this.im[b];this.re[b]=this.re[a]-tr;this.im[b]=this.im[a]-ti;this.re[a]+=tr;this.im[a]+=ti;}}
   const values=new Uint8Array(bands),power=new Float64Array(bands),counts=new Uint16Array(bands),top=Math.min(maxHz,this.rate/2);
   for(let k=1;k<=size/2;k++){const f=k*this.rate/size;if(f>top)break;const b=Math.min(bands-1,Math.floor(f/top*bands));power[b]+=4*(this.re[k]**2+this.im[k]**2)/this.sum**2;counts[b]++;}
   for(let b=0;b<bands;b++){const db=10*Math.log10(power[b]/Math.max(1,counts[b]));values[b]=Math.round(255*Math.max(0,Math.min(1,(db-minDb)/(maxDb-minDb))));}
   const column={time:(this.total-size/2)/this.rate,values};out.push(column);this.columnCount++;if(this.retain)this.columns.push(column);
  }
  this.cpuMs+=performance.now()-start;return out;
 }
 report(){return {columns:this.columnCount,bytes:this.columns.reduce((n,c)=>n+c.values.byteLength,0),cpuMs:this.cpuMs,gaps:this.gaps,windowMs:this.config.size/this.rate*1000,hopMs:this.hop/this.rate*1000,binHz:this.rate/this.config.size};}
}
export function spectralColor(value){const u=value/255;return [Math.round(242-212*u),Math.round(247-145*u),Math.round(245-147*u),255];}
// Raster cache: append only newly calculated columns, not the full recording each frame.
export class SpectralRaster{
 constructor(engine,createCanvas=()=>document.createElement('canvas')){this.engine=engine;this.canvas=createCanvas();this.canvas.width=Math.ceil(engine.config.maxSeconds/engine.config.hopSeconds)+2;this.canvas.height=engine.config.bands;this.ctx=this.canvas.getContext('2d');this.painted=0;this.ctx.fillStyle='#f2f7f5';this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);}
 update(){const {columns,config,rate,hop}=this.engine;for(;this.painted<columns.length;this.painted++){const c=columns[this.painted],image=this.ctx.createImageData(1,config.bands);for(let b=0;b<config.bands;b++)image.data.set(spectralColor(c.values[b]),(config.bands-1-b)*4);const slot=Math.round((c.time-(Math.ceil(config.size/hop)*hop-config.size/2)/rate)/(hop/rate));this.ctx.putImageData(image,slot,0);}}
 draw(ctx,{left,top,width,height,begin,end,reveal=end}){this.update();const e=this.engine,step=e.hop/e.rate,origin=(Math.ceil(e.config.size/e.hop)*e.hop-e.config.size/2)/e.rate-step/2,lo=Math.max(begin,origin),hi=Math.min(end,reveal,e.columns.at(-1)?.time+step/2||0);if(hi<=lo)return;ctx.save();ctx.beginPath();ctx.rect(left,top,width,height);ctx.clip();ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,(lo-origin)/step,0,(hi-lo)/step,e.config.bands,left+(lo-begin)/(end-begin)*width,top,(hi-lo)/(end-begin)*width,height);ctx.restore();}
}
