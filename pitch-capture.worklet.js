// Raw mono float samples. Both recording and live timestamps share this clock.
class PitchCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.frameSize;
    this.frame = new Float32Array(this.size);
    this.used = 0;
    this.total = 0;
    this.active = true;
    this.maxFrames=options.processorOptions.maxFrames;
    this.port.onmessage = ({data}) => {
      if (data !== 'flush' || !this.active) return;
      this.active = false;
      this.send(true);
    };
  }
  send(done=false) {
    const audio = this.frame.slice(0, this.used);
    this.port.postMessage({audio:audio.buffer,endFrame:this.total,audioTime:currentTime,done}, [audio.buffer]);
    this.used=0;
  }
  process(inputs) {
    if (!this.active) return true;
    const channel=inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.frame[this.used++]=sample;
      this.total++;
      if(this.total>=this.maxFrames){this.active=false;this.send(true);return true;}
      if (this.used===this.size) this.send();
    }
    return true;
  }
}
registerProcessor('fluidez-pitch-capture',PitchCapture);
