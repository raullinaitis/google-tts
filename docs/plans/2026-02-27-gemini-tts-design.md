# Google Gemini TTS Web App — Design Document

**Date:** 2026-02-27
**Status:** Approved

---

## Overview

A personal Next.js 14 web app that provides a clean UI for Google's Gemini Text-to-Speech API. Deployed to Vercel. No authentication required (personal tool).

---

## Architecture

- **Framework:** Next.js 14 (App Router)
- **Deployment:** Vercel
- **API Key:** Stored in `.env.local` locally and as a Vercel environment variable — never exposed to the browser
- **Frontend:** `app/page.tsx` — single page UI
- **Backend:** `app/api/tts/route.ts` — server-side API route that calls Google TTS

---

## Models

Three models selectable via tabs/buttons:

| Label | Model ID | Description |
|---|---|---|
| Flash | `gemini-2.5-flash-tts` | Low latency, fast generation |
| Flash Lite | `gemini-2.5-flash-lite-preview-tts` | Lightweight preview model |
| Pro | `gemini-2.5-pro-tts` | High control, best for long-form content |

---

## Voices

29 prebuilt voices, hardcoded with correct gender labels from API docs.

**Female (14):** Achernar, Aoede, Autonoe, Callirrhoe, Despina, Erinome, Gacrux, Kore, Laomedeia, Leda, Pulcherrima, Sulafat, Vindemiatrix, Zephyr

**Male (15):** Achird, Algenib, Algieba, Alnilam, Charon, Enceladus, Fenrir, Iapetus, Orus, Puck, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel

Displayed as two clearly labeled columns (Male | Female) with clickable cards.

---

## UI Layout (top to bottom)

1. **Model selector** — 3 buttons: Flash | Flash Lite | Pro
2. **Voice selector** — two columns: Male voices | Female voices (clickable cards)
3. **Style presets** — chips: Neutral, Whispering, Sarcastic, Laughing, Shouting, Robotic, Extremely Fast
4. **Custom style prompt** — free-text field, combined with preset into the API `prompt` field
5. **Temperature slider** — 0.0 to 2.0, default 1.0, with label
6. **Text input** — large textarea, 4,000 byte limit with live counter (turns red when close)
7. **Generate button**
8. **Audio player** — inline `<audio>` element + Download button (appears after generation)

---

## Data Flow

1. User fills form, clicks Generate
2. Browser POSTs to `/api/tts`: `{ model, voice, stylePreset, customStyle, temperature, text }`
3. API route builds prompt: `"[preset tag] [customStyle]"` combined, calls Google TTS REST API
   - Endpoint: `POST https://texttospeech.googleapis.com/v1/text:synthesize`
   - Auth: `Authorization: Bearer {GOOGLE_API_KEY}`
4. Google returns audio bytes (MP3)
5. API route returns `{ audio: "<base64 string>", mimeType: "audio/mp3" }`
6. Browser decodes base64 → Blob URL → feeds `<audio>` element + Download button

---

## Style Presets → API Markup

| Preset label | API tag injected |
|---|---|
| Neutral | (none) |
| Whispering | `[whispering]` |
| Sarcastic | `[sarcasm]` |
| Laughing | `[laughing]` |
| Shouting | `[shouting]` |
| Robotic | `[robotic]` |
| Extremely Fast | `[extremely fast]` |

Custom style text is appended to the prompt as natural language (e.g. "speak warmly and slowly").

---

## Error Handling

- Text exceeds 4,000 bytes → client-side warning, Generate button disabled
- API error (quota, bad key, network) → friendly error message below Generate button
- Empty response → "Generation failed, please try again" message

---

## Environment Variables

```
GOOGLE_API_KEY=your_key_here
```

---

## File Structure

```
google-tts/
├── app/
│   ├── page.tsx          # Main UI
│   ├── layout.tsx        # Root layout
│   ├── globals.css       # Global styles
│   └── api/
│       └── tts/
│           └── route.ts  # Server-side TTS API route
├── lib/
│   └── voices.ts         # Voice list with gender labels
├── docs/
│   └── plans/
│       └── 2026-02-27-gemini-tts-design.md
├── .env.local            # API key (gitignored)
├── .gitignore
├── next.config.ts
├── package.json
└── tsconfig.json
```
