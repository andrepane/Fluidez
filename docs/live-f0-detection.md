# Live F0 detection correction (PR27, same branch)

## Diagnosis established before changing settings
Audited microphone permission/settings, mono Float32 AudioWorklet transfers, actual AudioContext rate, endFrame sample counter, centered timestamps, PCM reconstruction, live points and drawing. Existing capture/flush/seek tests pass; no capture-loss bug was demonstrated. Worklet and WAV path are unchanged.

On two eight-second public connected readings replayed causally, the old detector accepted only 1/85 and 4/78 voiced-compatible analysis windows. Old male frame rejection counts: weak 22, clarity 101, range 3, confirmation 5, accepted 1 (132 processed). Female: clarity 114, range 2, confirmation 12, accepted 4. At 0.02 gain, weak-signal rejection dominated. These reproduce the reported sparse contour without assuming the user's microphone has the same cause.

Pitchy's `.98` **is relative NSDF peak selection against the strongest available peak**, not an absolute .98 confidence gate. The separate `.95` absolute clarity gate is the restrictive rejection. Keeping `.98` is justified by the strong-third-harmonic regression: lowering candidate selection indiscriminately can select the harmonic. The bundled vendor remains unchanged.

## Configuration selected by comparison
Exploratory sweep: 4096/3072/2048 samples, absolute clarity .95/.90/.85/.80; additional 20 ms hop/low-energy/onset/candidate variants (18 configurations). Same causal audio input for each. Reproducible scripts included. Smaller windows/20 ms hop help brief syllables; .80 admits more disagreement near boundaries, longer windows smear brief transitions. Conservative .85 selected on these fixtures. No universal clinical optimality claim.

| Setting | Before | Now |
|---|---:|---:|
| Pitchy candidate peak fraction | .98 | .98 (unchanged) |
| Absolute clarity rejection | <.95 | <.85 |
| RMS energy rejection | <.002 | <.0005 |
| Trailing window samples | 4096 | 2048 |
| Analysis hop | ~60 ms | 20 ms |
| PCM transfer / capture cadence | ~60 ms | ~60 ms (unchanged) |
| Jump confirmation | >7 semitones, two nearby candidates | unchanged |
| Track reset interval | >250 ms | unchanged |

Only the prosody controller uses the new LivePitchEngine config; LiveToneTracker's legacy default settings remain .95/.002. No adaptive SNR gate implemented: without labelled noise-only intervals, learning a noise floor from speech may wrongly classify soft vowels. Absolute energy + periodicity is limited and cannot distinguish periodic environmental sound from voice.

LivePitchEngine reconstructs trailing windows using a bounded ring buffer at real sample rate. It analyzes incremental samples every 20 ms; delivery remains batchwise ~60 ms. Every timestamp is `(processedSampleCount - size/2) / rate`. No future audio, hidden final-Praat feedback or fabricated F0. Missing sample-count continuity clears tracking/window and records a capture gap. Null estimates remain null. First onset/jump still needs confirmation; shortening hop reduces the support lost to that safeguard.

## Same-audio quantitative comparison
`python scripts/benchmark-live-f0.py /tmp/results.json` uses committed licensed fixtures, deterministic synthetic signals and the existing unmodified Praat endpoint's engine function. No network. Baseline reproduces former trailing4096/hop60/clarity.95/RMS.002/.98 selection/confirmation. New code is the exact incremental engine used by the app. Native replay at 48 kHz; both outputs compared at the same absolute Praat 10 ms grid. Nearest live sample only inside half its hop, no interpolation; exclude first/last 100 ms.

Praat is an operational reference, **not ground truth**. "Unvoiced accepted" is a disagreement with Praat, not proof of a false detection. Coverage denominator is reference-positive grid cells. Cents error is absolute `1200 log2(live/reference)` on jointly positive cells. Different coverage means medians/P90 do not evaluate identical subsets; the JSON also reports the much smaller intersection where both versions detect F0. Octave disagreement counts reference-grid cells with 1000–1400 cents error, not diagnoses.

| Audio (8 s unless synthetic) | Reference-voiced coverage before → after | After median / P90 cents | Accepted on reference-unvoiced cells | Octave disagreements |
|---|---|---|---|---|
| Male reading | 1.2% → 38.1% | 5.8 / 26.9 | 0 / 281 | 0 |
| Female reading | 5.0% → 57.1% | 7.0 / 33.6 | 1 / 298 | 0 |
| Male reading ×0.02 gain | 1.2% → 35.1% | 5.6 / 26.7 | 0 / 284 | 0 |
| Female reading ×0.02 gain | 0% → 47.7% | 6.9 / 31.0 | 0 / 298 | 0 |
| Brief 100 ms synthetic syllables | 17.2% → 72.7% | <0.1 / 0.9 | 0 / 171 | 0 |
| Noise-only | no voiced reference | n/a | 0 / 380 | 0 |
| Digital silence | no voiced reference | n/a | 0 / 380 | 0 |

On common accepted timestamps: male 6 grid cells, median error 4.2→2.5 cents; female 24 cells, 11.1→3.7 cents. Too small to prove population accuracy. Greater agreement coverage is demonstrated on these recordings; generalized precision is not.

Known remaining error: tone+10 dB white noise has octave-family disagreements around 0.25–0.26 s (~1211 and1207 cents; two grid cells representing one20ms estimate). It reaches ~74.7% reference-voiced coverage, not perfect tracking. At 0 dB SNR, the conservative detector leaves gaps instead of accepting the noisy periodic tone. Many real reference-voiced regions still receive no F0: 38–57% coverage is an improvement over near-zero, not a complete solution. Low-pitch / irregular / pathological voices remain unvalidated.

Complete aggregate measurements and rejection distributions: live-f0-measurements.json. `python scripts/benchmark-live-f0.py --sweep /tmp/sweep.json` reproduces exploratory configurations.

## Diagnostic mode
Open Options → Professional settings → **Activar diagnóstico del directo** BEFORE recording. Off by default. Local-only, no persistent log, telemetry or network request added. Captures:
- Audio blocks/received samples and sample-count discontinuities.
- Analysis windows, raw candidate count, accepted count, rejection reasons (energy, periodicity, range, clipping, confirmation).
- RMS/clarity/sample-time interval/CPU/delivery-age distributions (min/P10/median/P90/max).
- Up to100 recent windows with raw F0 candidate vs accepted F0, reason, RMS, clarity and measured processing time.
- Render frame count and accepted points in visible/revealed window.

At most6500 readings per distribution and100 detailed windows; refresh text at most twice per second. No mathematical measure certifies true sonority: weak/low-periodicity readings may reflect silence, noise, voiceless consonants or irregular voice. Zero windows despite incoming blocks suggests pipeline/warmup failure; candidates rejected points to filtering; accepted points with no visible rendering requires checking time window/buffer. Microphone/capture startup errors remain explicit in main status.

## Timing/performance and tests
At48kHz window-center delay reduced from42.7 ms to21.3 ms; confirming a candidate requires another20ms analysis hop rather than60ms. Actual deliveries remain60ms; three windows may arrive together. Existing100ms rendering horizon remains; shorter analysis does not prove shorter perceived end-to-end latency. Approximate total latency includes audio block delivery, analysis, candidate confirmation and visual buffer; must be measured on target browser with microphone.

Measured incremental CPU with diagnostics on: roughly59–62 ms per8 seconds of real audio on this host, vs~38–43 ms old; another quiet fixture was~80ms. More frequent but smaller FFTs. Not browser paint/FPS or medium-laptop evidence. A main-thread cost increase exists; no unsupported browser responsiveness claim.

Tests: **105 JavaScript +12 Python passed**, 0 failures. Stable tones/low amplitude at44.1k/48k, deterministic broadband noise/silence, null gaps, strong harmonic, exact invariance under irregular chunking, no future samples, diagnostic caps/off state,119sec incremental capture, rendering/seek/import/attempt regressions and final Praat suite. Python integration independently replays19 same-audio examples through old/new/Praat. Syntax checks pass. Static frontend has no separate build command; check Vercel status separately.

Not tested: user's microphone, clinical validation, Spanish/children/disfluent/pathological voice, independently labelled phoneme/voicing truth, real quiet phonation (gain reduction is only a signal-level simulation), dedicated interrogative-vs-declarative recordings, diverse environmental noise, browser CPU/FPS/end-to-end latency. Sources/license in tests/fixtures/README.md. No Saarbrücken vowels used as connected-speech evidence. If Pitchy remains inadequate in human trials, benchmark YIN or a bounded-candidate periodicity tracker separately; neither has been implemented or shown superior here.

## Scope
Same PR27 and branch. Animated rendering retained. Praat/Parselmouth/backend/capture/download/attempts/comparison/production unchanged. Only live detection feeding prosody and optional diagnostic section changed. No paid service/key/dependency added. Preview availability/CI reported in PR.
