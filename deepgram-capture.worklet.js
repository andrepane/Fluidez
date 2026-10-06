class DeepgramCapture extends AudioWorkletProcessor {
  constructor(options){super();this.size=options.processorOptions.frameSize;this.frame=new Int16Array(this.size);this.used=0;this.port.onmessage=({data})=>{if(data!=='flush')return;const audio=this.frame.slice(0,this.used).buffer;this.used=0;this.port.postMessage({type:'flushed',audio},[audio]);};}
  process(inputs){
    const channel=inputs[0]?.[0];if(!channel)return true;
    for(const x of channel){this.frame[this.used++]=Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767));
      if(this.used===this.frame.length){this.port.postMessage(this.frame.buffer,[this.frame.buffer]);this.frame=new Int16Array(this.size);this.used=0;}}
    return true;
  }
}
registerProcessor('fluidez-deepgram',DeepgramCapture);
