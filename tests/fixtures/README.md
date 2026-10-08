# Public human speech fixture

`public-speech.wav.b64` is a base64-encoded PCM16 mono WAV, resampled to 16 kHz from Parselmouth's `docs/examples/audio/the_north_wind_and_the_sun.wav`. Duration: 1.283265 seconds. Not a patient recording. Used only to check successful parsing, voiced/unvoiced windows and timestamps; no known F0 ground truth or Spanish clinical validation.

Source: https://github.com/YannickJadoul/Parselmouth/blob/master/docs/examples/audio/the_north_wind_and_the_sun.wav
Original: https://en.wikipedia.org/wiki/File:Recording_of_speaker_of_British_English_(Received_Pronunciation).ogg
Attribution: International Phonetic Association, English reading of *The North Wind and the Sun*.
License for this audio and its resampled adaptation: CC BY-SA 3.0, https://creativecommons.org/licenses/by-sa/3.0/
Adaptation: resampling only, no cropping or synthetic generation.
SHA256 of decoded adapted WAV: 07d4d498408a7e8544a1026adc29ca0457e63696e9bedf476d4ec864bd7edec3

## Connected readings (CC BY 4.0)

`reading-male.wav.zlib.b64` and `reading-female.wav.zlib.b64` are zlib-compressed PCM16 mono 16 kHz WAVs encoded as base64. Each contains the first eight seconds of a public LibriSpeech/LibriVox reading. No patients. Neither recording provides independently annotated F0 truth.

- Male corpus speaker 3436, Anders Lankford: *The Age of Chivalry*, Perceval. Source https://librosa.org/data/audio/3436-172162-0000.ogg and attribution/license https://librosa.org/data/audio/3436-172162-0000.txt
- Female corpus speaker 198, Heather Barnett: *Sense and Sensibility*, chapter 18. Source https://librosa.org/data/audio/198-209-0000.ogg and attribution/license https://librosa.org/data/audio/198-209-0000.txt
- Corpus and license: https://www.openslr.org/12/ ; https://creativecommons.org/licenses/by/4.0/
- Adaptations by Fluidez+: first-eight-second excerpt, mono conversion and resampling to 16 kHz/PCM16, lossless zlib packaging. Benchmark also creates 0.02-gain derivatives (not recordings of physiologically quiet phonation).
- Speaker M/F metadata copied from corpus SPEAKERS.TXT; these two English readings do not validate Spanish, children, questions, dysphonia or stuttering.
- Decoded WAV SHA256 male: 8140483baa9e8042bed0b3f59ac61bd2db14cc97919bfb8fd31cd8df6b3059d7
- Decoded WAV SHA256 female: 89503e6757ac74daabc9f0bf68b5193a516c8d22eb7e83733d098b109efab803
