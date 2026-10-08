# Experimental hybrid live prosody

## Base and scope
Created from main df69001f58a7e3ee8efb1ffe5843e0025080ccc2. PR24 (Pitchy/Praat), PR25 (capture/results), PR26 (practice/attempts) and PR27 (F0 detection/rendering) are merged. Open PR19 is an older unrelated clinical prototype and is not incorporated. No production deployment or merge requested.

F0 algorithm, thresholds, tracker, original PCM capture/worklet/WAV, Praat backend/final metrics, reference exercises, imports and comparison remain unchanged. New view switch affects presentation only. Speed module is untouched.

## Implementation
SpectralEngine consumes exactly the same Float32 mono PCM blocks and endFrame sample clock as LivePitchEngine. Local causal STFT: 2048 samples, symmetric Hann window, DC subtraction, radix-2 FFT, hop round(sampleRate × 0.02). No extra dependency, network call or upload. Existing worklet delivery remains approximately 60 ms. FFT is computed in the receiving main-thread handler, separately from rendering; not an AudioWorklet FFT or worker. This is the simplest option for the measured cost; real-browser contention still needs testing.

At 48 kHz: 42.67 ms window / 23.44 Hz FFT bins / 20 ms hop. At 44.1 kHz: 46.44 ms / 21.53 Hz / 20 ms. Frequency display linear 0–8 kHz (or Nyquist if lower), 128 raster bands, average single-sided bin power per band. Hann coherent-gain normalization; fixed -90 to -20 dB relative to full-scale digital amplitude mapped into 8-bit colors. Not calibrated dB SPL or a clinical intensity measure. Display bands 62.5 Hz at 8 kHz: compact spectral activity, not a detailed professional phonetic spectrogram. Finite window spreads brief events; quiet input may fall below display range, strong input saturates. No auto gain/flicker or fake silence filling.

## Exact synchronization
Both use trailing 2048-sample frames on totalSamples % round(rate × .02) === 0. Timestamp is frame center (endFrame - 1024) / rate, not message arrival. Gaps reset the STFT window and leave blank raster slots. The same VisualClock, begin/end, margins and x transform control both canvases. Both clip to the existing 100 ms reveal horizon in animated mode; neither changes timestamps. Straight-line A/B rendering retains its previous no-buffer behavior for both. Upper temporal labels move to the lower shared axis in complete mode. An STFT column occupies one 20 ms display cell centered on its acoustic timestamp, not a point measurement of an instantaneous event.

Tests first caught a different hop origin between STFT and F0; corrected STFT to the existing F0 grid without changing F0. Exact timestamp-array equality at 44.1/48 kHz, onset at 0.5 s, offset at 1.5 s, digital silent interiors, irregular delivery, causal prefix and missing blocks now pass. This is numerical synchronization evidence, not measured microphone-to-screen latency.

## Presentation / review
F0 remains primary, with original nulls and limited interpolation. Compact neutral-to-teal spectrogram below, common moving 8 s axis; data remain available through 120 s. Single discrete **Vista completa** checkbox: checked = F0 + spectrum, unchecked = F0 only. Can toggle during recording, without resetting capture or estimates. Default complete. Explains F0 versus acoustic activity, including unvoiced sounds/noise.

After stopping, spectrum retains the selected attempt's captured audio view while F0 updates independently with final Praat. Switching attempt changes spectrum/audio; F0 comparison still uses original common duration. Spectrum is not a second-attempt overlay. Imports retain their existing workflow; this live experiment does not compute an imported-file spectrum and states that explicitly. Professional final measurements unaffected.

Canvas 2D uses an append-only 6002×128 cached raster (about 3.07 MB RGBA), painting new columns once. RAF only blits the visible source slice; no full-history spectral redraw. 5998 stored Uint8 columns in a 120 s run: 767744 payload bytes plus objects; small FFT buffers about 60 KB. Two attempts keep two payloads; one active raster. Recorded audio, canvas backing storage/DPR and JS object overhead are additional. Existing F0 render still follows its previous implementation. View switch does not disable the FFT, so both experiences use identical acoustic data.

## Executed verification
- 114 JavaScript and 12 Python tests, zero failures (126 total).
- Known tones at 44.1/48 kHz; ascending/descending chirps; amplitude ×10; reproducible broadband noise; digital silence; known onsets/interleaved pauses; irregular blocks, gaps, causal prefix, 120 s memory bound; cached raster append/clip.
- Two licensed real connected readings (male/female fixtures from PR27). Actual PCM bytes and LivePitchEngine outputs are identical before/after spectral processing, and energy exists in some windows with null F0.
- Flow harness regression: capture/flush/release, WAV playback/seek, attempts/replacement, final Praat success/failure/retry, resize both canvases, toggle mid-recording, selected-attempt label, RAF chain. Harness is not a real browser/microphone.
- Python final Praat suite passes unchanged, including long recording.
- Node processing benchmark: about 0.38–0.44 s summed STFT CPU for 120 s / 5998 frames in this host (~3.2–3.7 ms per second of audio); full test including generation/raster checks ~0.85–1.01 s. Hardware/runtime-dependent, excludes browser render/GC and F0. Not a measured FPS or phone battery benchmark.
- Syntax checks for new module/controller.

`node --test tests/*.test.mjs`
`python -m unittest discover -s tests -p 'test_voice*.py'`

## Same-signal comparison
[Calculated demonstration](hybrid-same-audio.svg): identical synthetic audio and unchanged F0 points in both panels, with actual STFT in the second. Ascending tone, 2.5–3.3 s broadband noise, silence from 6.7 s. This is an offline signal visualization, **not an application screenshot or recording**. Noise is visible without invented F0. Real-reading tests also verify that acoustic energy and F0 gaps coexist; no claim of improved F0 accuracy.

## Pending / limitations
Real browser microphone/FPS/resize/long-recording verification in Chrome, Edge, Safari and medium-range machines is pending; preview access may require Vercel account. No claim of 60 FPS, observed latency, browser stability or therapeutic benefit until actually tested. No independently labeled real consonant/speech boundaries: synthetic noise is a nonperiodic proxy, not a validated /s/ recording. Fixtures are English readings; Spanish, child/pathological voice and real microphone/environmental noise need evaluation. Existing F0 gaps/octave errors/coverage limitations remain. Spectrum represents ALL sound (including room noise) and cannot diagnose phonation, identify pauses clinically or fill F0 gaps.

## Manual preview checklist
1. Prosodia y entonación → Empezar práctica. Speak vowels, a sentence with /s/, include a pause, then vary tone. F0 may have gaps while acoustic energy remains.
2. Toggle Vista completa off/on on the same recording; compare clarity/response, no detector change.
3. Terminar → listen, click F0, check playback cursors/time; Praat may finish later.
4. Record second attempt, switch attempts, show both F0 curves; lower spectrum explicitly identifies selected attempt.
5. Resize/mobile portrait; test 120 s and browser tab hide/resume; check frame rate/CPU with DevTools on actual device. Repeat Chrome/Edge/Safari.
