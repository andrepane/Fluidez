# Prosodia y entonación: trial implementation

## Scope and reuse
Adapted existing pitch controller, PCM AudioWorklet capture, playback/download, mono resampling and memory-only Praat endpoint. Static ES modules, no build pipeline or new runtime dependency. Speed/Deepgram/Whisper, backend and vocal-quality prototype remain unchanged. Only F0 contour is measured: this is not a complete prosody evaluation or a demonstrated treatment for stuttering.

## Patient flow
The graph and primary record button appear immediately; default is Habla espontánea / Libre. Activity and guide options are in a collapsed panel below the graph. Optional “Mostrar texto” has a separate editor and visibility checkbox: hiding the reading card preserves its text, and every activity works without text. Select Frases or Lectura only if wanted. Choose Libre, Ascendente, Descendente, Estable or Variación prosódica. Guide bounds/duration and detector limits live in professional settings. Guides are dashed illustrative overlays in the main graph, labelled as references, without scores or normative claims. Record, observe the last 8 seconds, stop, listen, repeat into the other slot. Imported audio goes directly to final analysis, with no fabricated live curve.

Two attempts remain in this tab's memory. Green/violet curves share real elapsed-time and frequency axes, with no warping or alignment. Durations and provisional/final origins are identified. Toggle visibility, select an attempt to listen and click its timeline. A shorter attempt ends earlier. Slots are automatic: first attempt 1, then attempt 2. A third recording/import is blocked until an explicit “Sustituir intento 1/2” action; listen/download before replacement. Repeating resets the visible graph/timer/status to prepared without deleting saved attempts. Not persistent storage.

## Direct detector and display
Pitchy 4.1.0; 4096-sample centered windows at actual AudioContext rate, approximately every 60 ms, same capture clock as WAV. Existing clarity, energy, digital clipping and two-candidate jump checks remain. These can reject irregular voices and cannot guarantee elimination of octave errors. No clinical accuracy claim.

Optional display-only causal median of up to three valid windows, reset at null/gap >120 ms. Raw values/timestamps and all metrics are unchanged. Display smoothing may delay visible tonal change by about one update; no interpolation across gaps. Final curves show original Praat values without smoothing. Redraws coalesce using requestAnimationFrame. Vertical live scale moves 6% toward its target in logarithmic coordinates per render; minimum requested span is an octave, bounded by search limits. Stored data: at most two samples of 120 seconds, no unlimited collection.

Pause/resume deliberately deferred: concatenating paused capture would break correspondence between elapsed clock, sample count and graph. Existing stop/record/repeat is reliable.

## Final analysis
Original recorded/imported audio is decoded and mixed to mono by Web Audio, resampled to 16 kHz PCM16 and sent to existing `/api/voice-analysis`. It does not use live F0 points. Runtime verified locally: Parselmouth 0.4.7, embedded Praat 6.1.38. `to_pitch_ac`: raw autocorrelation, time_step .01, very_accurate True, silence_threshold .03, voicing_threshold .45, configured pitch bounds; remaining Praat defaults unchanged. This is not the newer filtered autocorrelation method.

Professional metrics: raw median, P10/P90 (sorted-index rounding), duration and valid/total returned windows. Valid means finite positive selected F0 within search bounds; not confidence or proportion of speaking time. Window centers exclude edge regions; denominator is returned windows, not duration/10 ms. Null means unestimated F0, not a classified respiratory pause. No jitter, shimmer, HNR, intensity or new clinical indices.

Backend operates in memory without saving audio, no Firebase/analytics added. Existing server feature flag, limits, instance-only throttling and timeout unchanged. Browser decoding support varies for imported codecs. Maximum upload 20 MB, maximum sample 120 s. Servers may be cold or unavailable; retain local audio/provisional curve and allow retry.

## Reproducible verification
`node --test tests/*.test.mjs`: 84 passed, 0 failed.
`python -m unittest discover -s tests -p 'test_voice*.py'`: 11 passed, 0 failed.
Tests include stable harmonics, ascending/descending F0, multiple changes, interspersed silence, public real human voice (fixture license in tests/fixtures), malformed/truncated data, capture flush/sample clocks, playback seeking, two attempts, immutable smoothing/gaps and guide shapes. 119-second synthetic Praat test: 11,893 windows, about 0.09 s on this development host (not Vercel timing).

Not performed: real microphone test, human F0 correctness review, mobile/mid-range device CPU benchmark, browser codec matrix or clinical validation. Real speech fixture checks operation, not ground-truth accuracy. Browser Preview verification must be reported separately in the PR; a successful deployment is not a microphone test. No separate frontend build exists.

## Manual preview test
1. Open Prosodia y entonación, type a phrase, select Ascendente and configure a comfortable guide.
2. Record with real microphone, include a pause; confirm the curve leaves gaps, text remains readable and stop preserves audio.
3. Listen/click the curve; repeat into attempt 2 with a different duration. Toggle each curve and select the audio.
4. Expand professional details; verify final source, raw metrics and valid-window denominator.
5. Import mono/stereo WAV and a browser-supported compressed file; verify original download and independent Praat final. Empty/corrupt/oversize audio must show an error without replacing the existing attempt.
6. Try speed module to check navigation and existing workflow.

Future PRs: human contour validation, optional calibrated reference recordings, microphone latency/performance measurements and sustained-vowel quality module. No automatic diagnostic interpretation.

## PR 26 UX correction
Same branch and PR, no main changes. Workspace remains in DOM at the same position in setup/record/results; removed obsolete CSS that hid/reordered it. Collapsed options and optional text editor are structurally placed below controls. References are dashed, labelled overlays using actual guide seconds/Hz; recorded F0 retains its original clock. Initial graph contains axes and an instruction, no fake data. Ready state clears stale final-analysis messages without deleting prior attempts. 84 JS + 11 Python passed locally. No separate frontend build command exists; syntax checks and Vercel deployment are the applicable checks. Previous Preview was login-protected; revised visual/microphone review remains pending until accessible.
