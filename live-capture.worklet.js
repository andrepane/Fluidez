class LiveCapture extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(2048);this.used=0;}
  process(inputs){
    const channel=inputs[0]?.[0];if(!channel)return true;
    for(const value of channel){this.buffer[this.used++]=value;if(this.used===this.buffer.length){const copy=this.buffer;this.port.postMessage(copy,[copy.buffer]);this.buffer=new Float32Array(2048);this.used=0;}}
    return true;
  }
}
registerProcessor('fluidez-live-capture',LiveCapture);
