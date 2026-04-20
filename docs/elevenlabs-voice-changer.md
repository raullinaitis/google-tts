# ElevenLabs Voice Changer (Speech-to-Speech) — integration notes

## What it does
Takes an audio file (any voice) + a target `voice_id` and returns audio of the
same speech rendered in the target voice. Preserves pacing, emotion, pauses —
only the voice timbre changes.

Endpoint: `POST /v1/speech-to-speech/{voice_id}` (via `@elevenlabs/elevenlabs-js` → `elevenlabs.speechToSpeech.convert`).

## Auth
- Env var: `ELEVENLABS_API_KEY`
- Stored in `.env.local`, read server-side only. **Never expose to the browser.**

## Key parameters
| Field | Value we'll use | Notes |
|---|---|---|
| `voice_id` | user-selected from ElevenLabs voice library | path param |
| `audio` | the raw WAV/MP3 blob from Gemini TTS | `Blob` |
| `modelId` | `eleven_multilingual_sts_v2` | current STS model |
| `outputFormat` | `mp3_44100_128` (default) or `pcm_24000` | PCM easier to slice; MP3 smaller |

## Minimal TS example (from docs)
```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const elevenlabs = new ElevenLabsClient(); // reads ELEVENLABS_API_KEY
const audioStream = await elevenlabs.speechToSpeech.convert(voiceId, {
  audio: audioBlob,
  modelId: "eleven_multilingual_sts_v2",
  outputFormat: "mp3_44100_128",
});
```

## Text-to-Speech (for reference — we are NOT using this; Gemini still does TTS)
`elevenlabs.textToSpeech.convert(voiceId, { text, modelId: "eleven_v3", outputFormat: "mp3_44100_128" })`

## How this fits our app
Flow becomes: **Gemini TTS → ElevenLabs STS (voice swap) → user hears only the swapped version → user clicks Split → we slice → 3 files saved with groupId.**

The raw Gemini audio is *not* shown in the UI when STS is enabled — it's a throwaway intermediate.

## Webhook? — No.
Speech-to-Speech is a synchronous HTTP call. You `await` the response and get the audio back. No webhook, no polling, no async job setup needed. Webhooks in ElevenLabs are for long-running dubbing/projects, not for STS.

## Gotchas
- **Output format vs our slicer:** our `lib/wav-split.ts` only parses WAV. If we take MP3 back from ElevenLabs, splitting won't work without re-decoding. Use `pcm_24000` and wrap it in a WAV header server-side (we already do this for Gemini in `app/api/tts/route.ts`) — then the existing splitter keeps working.
- **Rate limits / cost:** each STS call is billed by character count of the *source* audio's transcript. Double-generation (Gemini + 11L) = 2x cost per take.
- **Concurrent requests:** ElevenLabs free/starter plans cap concurrency; batch generation (Advanced mode's multi-voice / multi-style) may need queueing if we pipe every Gemini clip through STS.
- **Latency:** STS adds 2–10s per clip on top of Gemini's 3–8s. User waits longer for a result.
