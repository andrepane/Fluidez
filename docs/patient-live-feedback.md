# Patient live intonation feedback

Branch from main fc4a80df07090c233d4ab0da1975fec52b3c65da, containing merged PR28. Does not incorporate unrelated experimental branches. No automatic merge/production deployment.

## Patient presentation
Fix legacy `.pitch-plot canvas {min-height:360px}` that made the mini spectrum 360px rather than the intended compact band. New spectrum:120px desktop /92px mobile; explicit min-height override. F0 remains main graph. During recording hide intro, navigation, configuration, upload/start, view switch and technical legend; show curve, compact spectrum when enabled, simple instruction, secondary Hz readout/timer and sticky Terminar controls. Auto-scroll workspace into view when starting. View mode still selected before recording, and comparisons/playback/options return on stop. Stable vertical search bounds and original common axes preserved; no new auto calibration or normality bands.

Active recent portion emphasized, past trace slightly faded, rounded endpoint follows the bounded existing curve at its reveal horizon. No endpoint during a null run, no extension beyond measured support, no old-tone hold in the drawn curve. Animation interpolation is presentation only; raw F0/metrics untouched. Straight mode uses last real supported point. Existing causal visual median3 and100ms horizon remain. Theme redraw now reads inherited workspace colors rather than root-only light-theme variables.

## DSP separation and timing
AudioWorklet retains raw mono Float32 and original sample clock/WAV, but delivers round(rate*.02) frames rather than60ms frames. It remains only capture, not FFT/DSP. New dedicated module worker runs the same LivePitchEngine and real SpectralEngine. Renderer, PCM recording, and DSP are distinct. F0/STFT timestamps unchanged,20ms hops /2048 windows. UI appends returned estimates/columns, uses existing VisualClock/RAF and incremental spectral raster. No new dependency, upload/service or API change.

Worker client: one block in flight, at most six pending (~120ms with normal20ms capture). Under sustained overload older pending **analysis** blocks are dropped, latest clock retained, detector/STFT explicitly reset at sample discontinuity. All captured PCM remains recorded; final Praat always receives original complete WAV. Skips visible in professional diagnostic; no fake continuous F0 or shifted timestamps. This prioritizes recent feedback under overload at the cost of live-analysis gaps.

Transfer a copy to worker so original recording cannot be detached; spectra transferred back. Worker does not retain transferred spectral history; UI keeps bounded120s columns and one active raster. Two attempts retain original audio/spectrum. Normal processing finishes before flush acknowledgement; stopping waits for capture flush then worker drain (max3s), snapshots diagnostic, terminates worker, creates original WAV and independently runs Praat. Module/init failure explicit; mid-recording failure disables direct feedback but recording and final survive. No silent fallback to main-thread DSP. Init deadline5s; stale results older250ms remove readout/endpoint.

Smaller delivery cadence is configured, **not a measured end-to-end latency improvement**. Worker can add messaging overhead. Browser FPS/CPU/latency and target-laptop benefit pending microphone tests; no60FPS guarantee.

## Short tracking memory, not gap filling
Only live prosody config adds `retentionSeconds:.06`. Legacy tracker default remains0. Energy/clarity thresholds .0005/.85, relative Pitchy peak selector .98, >7-semitone confirmation, clipping/range gates and2048/hop20 unchanged.

After a rejected weak/nonperiodic window the engine may remember last accepted pitch for up to60ms. Rejected output remains **null**. If a new independently acceptable candidate is near previous pitch, it can resume without another onset confirmation. Longer gap, clipping or out-of-range invalidates memory; genuine large jump still requires two candidates. Sustained connected accepted candidates unchanged. No threshold relaxation, acoustic interpolation or guessing words/voicing.

## Reproducible same-audio evidence
`python scripts/benchmark-live-f0.py /tmp/results.json`
Script now returns `previousMain` with identical20ms/2048/.85/.0005 config and retention0, alongside current60ms retention. `before` remains old PR26 baseline for historical compatibility. Same audio/reference grids. Praat raw AC6.1.38 reference, not independent ground truth. Extra coverage does not establish greater accuracy; P90 uses different accepted subsets.

| Reading | Prior main coverage | New coverage | P90 cents prior → new | Accepted on Praat-null cells prior → new |
|---|---:|---:|---:|---:|
| Male |38.1%|41.7%|26.9→29.6|0→0|
| Female |57.1%|59.1%|33.6→33.9|1→1|
| Male gain×.02 |35.1%|38.3%|26.7→27.0|0→0|
| Female gain×.02 |47.7%|51.0%|31.0→33.7|0→0|

Tested40/60/80ms memory.80ms accepted one extra reference-null cell in female reading; selected60ms to preserve prior boundary disagreement count while improving reference-voiced coverage. Not universal clinical optimality. No octave disagreements in real fixtures, existing10dB noise octave disagreement(two grid cells) remains. Noise-only and digital silence:0accepted. Synthetic tones/glides/harmonic/intensity/pauses retain prior results. **Most missing real-voice sections remain; modest improvement, not complete reliable speech tracing.** Gain reduction is not physiological quiet phonation; English fixtures, no Spanish/children/pathological validation. YIN comparison proposed separately, not implemented or claimed superior here.

Aggregate19-audio measurements: patient-live-feedback-measurements.json.

## Executed tests
123 JS +12 Python pass (135 total). Includes worker initialization/error, transfer-copy preservation, bounded queue/skips, drain ordering, late message isolation and actual separate Node worker executing the production worker module; F0 output equals in-process processing and spectrum timestamps identical. Renderer tip stays within measured support and disappears at null gaps. Short-gap memory preserves nulls, expiry and large-jump safeguards. Existing live119s/spectral120s/44.1&48k/capture flush/WAV/attempts/playback/import/final Praat regressions pass. Flow harness proves final survives failed direct worker. Syntax checks pass.

Actual separate Node worker is not browser testing. No observed browser FPS/latency, patient utility or real microphone precision claimed. Python Praat backend untouched; speed/deepgram/whisper modules untouched. No new clinical metrics, automatic diagnostic interpretation or voice norms.

## Manual preview checks
Before starting, choose complete/simple view. Start and verify curve, timer and Terminar visible without scrolling, compact spectrum and no technical controls. Speak comfortably, include /s/ and pauses, vary tone, try softer voice. Endpoint disappears without reliable support; no continuing old value. Stop, listen/seek, second attempt/compare, retry final, import. Resize/mobile, dark/light and tab hide/resume. Use professional diagnostic to check skippedAnalysisBlocks, pendingBlocks, captureGaps and accepted windows. Measure screen/audio synchronization and CPU/FPS on Chrome/Edge/Safari and actual laptop. Access-protected preview cannot substitute these checks.
