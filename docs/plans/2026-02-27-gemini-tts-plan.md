# Google Gemini TTS Web App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js 14 personal web app that calls the Google Gemini TTS API with a clean UI for model selection, voice selection (male/female), style presets, custom style, temperature, and text input.

**Architecture:** Single Next.js 14 App Router project. Frontend in `app/page.tsx`, server-side API call in `app/api/tts/route.ts`. API key stored in `.env.local` and Vercel env vars — never in browser.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Google Cloud TTS REST API (`texttospeech.googleapis.com`)

---

## Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local`, `app/layout.tsx`, `app/globals.css`

**Step 1: Create the Next.js app**

Run in `C:\Users\eiman\Documents\APPS\google-tts`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

When prompted, accept all defaults.

**Step 2: Verify it scaffolded correctly**

```bash
ls -la
```

Expected: `app/`, `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts` all present.

**Step 3: Create `.env.local` with the API key**

Create file `.env.local` at project root:

```
GOOGLE_API_KEY=your_api_key_here
```

**Step 4: Verify `.gitignore` includes `.env.local`**

Check that `.gitignore` already contains `.env.local` (create-next-app adds this by default). If not, add it.

**Step 5: Run dev server to confirm it works**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000 with the default Next.js page.

**Step 6: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 14 app with Tailwind"
```

---

## Task 2: Create the voice data file

**Files:**
- Create: `lib/voices.ts`

**Step 1: Create `lib/` directory and `voices.ts`**

Create `lib/voices.ts` with this exact content:

```typescript
export type Voice = {
  name: string;
  gender: "male" | "female";
};

export const VOICES: Voice[] = [
  // Female voices
  { name: "Achernar", gender: "female" },
  { name: "Aoede", gender: "female" },
  { name: "Autonoe", gender: "female" },
  { name: "Callirrhoe", gender: "female" },
  { name: "Despina", gender: "female" },
  { name: "Erinome", gender: "female" },
  { name: "Gacrux", gender: "female" },
  { name: "Kore", gender: "female" },
  { name: "Laomedeia", gender: "female" },
  { name: "Leda", gender: "female" },
  { name: "Pulcherrima", gender: "female" },
  { name: "Sulafat", gender: "female" },
  { name: "Vindemiatrix", gender: "female" },
  { name: "Zephyr", gender: "female" },
  // Male voices
  { name: "Achird", gender: "male" },
  { name: "Algenib", gender: "male" },
  { name: "Algieba", gender: "male" },
  { name: "Alnilam", gender: "male" },
  { name: "Charon", gender: "male" },
  { name: "Enceladus", gender: "male" },
  { name: "Fenrir", gender: "male" },
  { name: "Iapetus", gender: "male" },
  { name: "Orus", gender: "male" },
  { name: "Puck", gender: "male" },
  { name: "Rasalgethi", gender: "male" },
  { name: "Sadachbia", gender: "male" },
  { name: "Sadaltager", gender: "male" },
  { name: "Schedar", gender: "male" },
  { name: "Umbriel", gender: "male" },
];

export const MALE_VOICES = VOICES.filter((v) => v.gender === "male");
export const FEMALE_VOICES = VOICES.filter((v) => v.gender === "female");

export type Model = {
  id: string;
  label: string;
  description: string;
};

export const MODELS: Model[] = [
  {
    id: "gemini-2.5-flash-tts",
    label: "Flash",
    description: "Low latency, fast generation",
  },
  {
    id: "gemini-2.5-flash-lite-preview-tts",
    label: "Flash Lite",
    description: "Lightweight preview model",
  },
  {
    id: "gemini-2.5-pro-tts",
    label: "Pro",
    description: "High control, best for long-form",
  },
];

export type StylePreset = {
  label: string;
  tag: string; // empty string = no tag injected
};

export const STYLE_PRESETS: StylePreset[] = [
  { label: "Neutral", tag: "" },
  { label: "Whispering", tag: "[whispering]" },
  { label: "Sarcastic", tag: "[sarcasm]" },
  { label: "Laughing", tag: "[laughing]" },
  { label: "Shouting", tag: "[shouting]" },
  { label: "Robotic", tag: "[robotic]" },
  { label: "Extremely Fast", tag: "[extremely fast]" },
];
```

**Step 2: Commit**

```bash
git add lib/voices.ts
git commit -m "feat: add voice, model, and style preset data"
```

---

## Task 3: Create the API route

**Files:**
- Create: `app/api/tts/route.ts`

**Step 1: Create the API route**

Create `app/api/tts/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { model, voice, stylePreset, customStyle, temperature, text } =
    await req.json();

  // Build the style prompt
  const promptParts: string[] = [];
  if (stylePreset) promptParts.push(stylePreset);
  if (customStyle?.trim()) promptParts.push(customStyle.trim());
  const prompt = promptParts.join(" ");

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  const body: Record<string, unknown> = {
    input: {
      text,
      ...(prompt ? { prompt } : {}),
    },
    voice: {
      languageCode: "en-US",
      name: voice,
      modelName: model,
    },
    audioConfig: {
      audioEncoding: "MP3",
    },
  };

  if (temperature !== undefined && temperature !== null) {
    (body.audioConfig as Record<string, unknown>).temperature = temperature;
  }

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json(
      { error: `Google TTS error: ${error}` },
      { status: response.status }
    );
  }

  const data = await response.json();

  if (!data.audioContent) {
    return NextResponse.json(
      { error: "No audio returned from API" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    audio: data.audioContent,
    mimeType: "audio/mp3",
  });
}
```

**Step 2: Commit**

```bash
git add app/api/tts/route.ts
git commit -m "feat: add server-side TTS API route"
```

---

## Task 4: Build the main UI page

**Files:**
- Modify: `app/page.tsx` (replace entirely)
- Modify: `app/globals.css` (keep Tailwind directives, remove default styles)

**Step 1: Replace `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 2: Replace `app/page.tsx` with the full UI**

```typescript
"use client";

import { useState, useRef } from "react";
import {
  MODELS,
  MALE_VOICES,
  FEMALE_VOICES,
  STYLE_PRESETS,
} from "@/lib/voices";

const MAX_BYTES = 4000;

function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

export default function Home() {
  const [model, setModel] = useState(MODELS[0].id);
  const [voice, setVoice] = useState(MALE_VOICES[0].name);
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0].tag);
  const [customStyle, setCustomStyle] = useState("");
  const [temperature, setTemperature] = useState(1.0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const textBytes = byteLength(text);
  const textTooLong = textBytes > MAX_BYTES;

  async function handleGenerate() {
    setError("");
    setAudioUrl("");
    setLoading(true);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          voice,
          stylePreset,
          customStyle,
          temperature,
          text,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Generation failed, please try again.");
        return;
      }

      const blob = new Blob(
        [Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))],
        { type: data.mimeType }
      );
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTimeout(() => audioRef.current?.play(), 100);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `tts-${voice}-${Date.now()}.mp3`;
    a.click();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Gemini TTS
        </h1>

        {/* Model selector */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Model
          </h2>
          <div className="flex gap-3 flex-wrap">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  model === m.id
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-500"
                }`}
              >
                <span className="font-semibold">{m.label}</span>
                <span className="ml-2 text-xs opacity-70">{m.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Voice selector */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Voice
          </h2>
          <div className="grid grid-cols-2 gap-6">
            {/* Male */}
            <div>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">
                Male
              </p>
              <div className="flex flex-wrap gap-2">
                {MALE_VOICES.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setVoice(v.name)}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      voice === v.name
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            {/* Female */}
            <div>
              <p className="text-xs font-semibold text-pink-400 uppercase tracking-widest mb-2">
                Female
              </p>
              <div className="flex flex-wrap gap-2">
                {FEMALE_VOICES.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setVoice(v.name)}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      voice === v.name
                        ? "bg-pink-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Style presets */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Style Preset
          </h2>
          <div className="flex flex-wrap gap-2">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.label}
                onClick={() => setStylePreset(s.tag)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  stylePreset === s.tag
                    ? "bg-violet-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* Custom style */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Custom Style{" "}
            <span className="normal-case font-normal text-gray-500">
              (optional — e.g. "speak warmly and slowly")
            </span>
          </h2>
          <input
            type="text"
            value={customStyle}
            onChange={(e) => setCustomStyle(e.target.value)}
            placeholder="e.g. speak with a British accent, slowly"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </section>

        {/* Temperature */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Temperature{" "}
            <span className="normal-case font-normal text-gray-500">
              ({temperature.toFixed(1)} — lower = more consistent, higher = more varied)
            </span>
          </h2>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.0 (consistent)</span>
            <span>2.0 (varied)</span>
          </div>
        </section>

        {/* Text input */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Text to Speak
          </h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Enter the text you want to convert to speech..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
          />
          <p
            className={`text-xs mt-1 text-right ${
              textTooLong ? "text-red-400 font-semibold" : "text-gray-500"
            }`}
          >
            {textBytes} / {MAX_BYTES} bytes
            {textTooLong && " — text is too long"}
          </p>
        </section>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || textTooLong || text.trim().length === 0}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors"
        >
          {loading ? "Generating..." : "Generate Speech"}
        </button>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {/* Audio player */}
        {audioUrl && (
          <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
              Generated Audio
            </h2>
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="w-full"
            />
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-white transition-colors"
            >
              Download MP3
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
```

**Step 3: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: build main TTS UI with model/voice/style/text controls"
```

---

## Task 5: Update layout and metadata

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Update `app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gemini TTS",
  description: "Google Gemini Text-to-Speech generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
```

**Step 2: Test the full app locally**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Model buttons render and select
- Male/Female voice columns show correctly labeled and colored
- Style preset chips work
- Custom style input works
- Temperature slider moves
- Text counter updates and turns red over 4000 bytes
- Generate button calls the API and plays audio
- Download button saves an MP3 file

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: update layout metadata"
```

---

## Task 6: Set up GitHub and deploy to Vercel

**Files:**
- No code changes — deployment configuration only

**Step 1: Create GitHub repo**

```bash
gh repo create google-tts --public --source=. --remote=origin --push
```

Expected: Repo created and code pushed.

**Step 2: Deploy to Vercel**

```bash
npx vercel --yes
```

When prompted for environment variables, skip — we'll add via Vercel dashboard.

**Step 3: Add API key to Vercel**

```bash
npx vercel env add GOOGLE_API_KEY production
```

Paste the API key when prompted.

**Step 4: Redeploy with env var**

```bash
npx vercel --prod
```

**Step 5: Verify production deployment**

Open the Vercel URL. Test generating audio in production. Confirm it works end-to-end.

---

## Summary

| Task | What it builds |
|---|---|
| 1 | Next.js project scaffold |
| 2 | Voice/model/style data (`lib/voices.ts`) |
| 3 | Server-side API route (`/api/tts`) |
| 4 | Full UI page (`app/page.tsx`) |
| 5 | Layout and metadata |
| 6 | GitHub + Vercel deployment |
