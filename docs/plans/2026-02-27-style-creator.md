# Style Creator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible "Style Creator" section to the left sidebar that uses Gemini Flash (text-only) to generate and iteratively refine a custom TTS style prompt from a plain-English description.

**Architecture:** New `POST /api/generate-style` route calls Gemini Flash with a system prompt encoding Google's TTS director framework (Audio Profile → Scene → Director's Notes). The client holds conversation history as an array of `{role, content}` pairs and sends it on each call, keeping the server stateless. The result is a single style string that auto-fills the existing `customStyle` field.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, Gemini Flash text API (`gemini-2.5-flash-preview-05-20` with `text/plain` output), existing `GOOGLE_API_KEY` env var.

---

### Task 1: Create the generate-style API route

**Files:**
- Create: `app/api/generate-style/route.ts`

**Step 1: Create the file with the route handler**

```typescript
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a Google Gemini TTS voice director. Your job is to write a single, coherent style instruction string for a text-to-speech voice actor.

Rules:
- Output ONLY the style string. No explanation, no markdown, no labels, no quotes.
- Keep it under 120 words.
- Structure it mentally as: character identity → environment/vibe → performance notes (pace, tone, accent, dynamics). But output it as flowing prose, not labeled sections.
- Be geographically specific for accents: "Southern California valley girl from Laguna Beach" not "American accent".
- Do NOT over-specify. Leave space for natural performance.
- Make the character, setting, and delivery feel coherent and unified.
- When refining, keep what works and adjust only what the user asks to change.

Example output:
Late-night jazz radio host, mid-40s, Chicago South Side. Warm mahogany voice in a dim studio at 2am. Languid pacing — words bleed into each other with zero urgency. Slight Chicago vowels, never exaggerated. Intimacy over projection; the listener should feel like the only person awake.`;

type Message = { role: "user" | "model"; content: string };

export async function POST(req: NextRequest) {
  let body: { description: string; history: Message[] };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { description, history } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Build contents array: system instruction + conversation history + new user message
  const contents = [
    ...history.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
    {
      role: "user",
      parts: [{ text: description }],
    },
  ];

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      responseModalities: ["TEXT"],
      temperature: 1.0,
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
  } catch {
    return NextResponse.json({ error: "Network error contacting Gemini API" }, { status: 502 });
  }

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: `Gemini error: ${error}` }, { status: response.status });
  }

  const data = await response.json();
  const style = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!style) {
    return NextResponse.json({ error: "No style generated" }, { status: 500 });
  }

  return NextResponse.json({ style });
}
```

**Step 2: Test the route manually with curl**

```bash
curl -X POST http://localhost:3000/api/generate-style \
  -H "Content-Type: application/json" \
  -d '{"description":"calm authoritative documentary narrator","history":[]}'
```

Expected: `{"style":"...single style string under 120 words..."}`

**Step 3: Commit**

```bash
git add app/api/generate-style/route.ts
git commit -m "feat: add /api/generate-style route with Gemini Flash"
```

---

### Task 2: Add StyleCreator component to page.tsx

**Files:**
- Modify: `app/page.tsx`

The Style Creator sits between the Style Presets section and the Custom Style input in the left sidebar. It is a collapsible section.

**Step 1: Add state variables to the Home component**

Add these state vars inside the `Home` component, after the existing `customStyle` state:

```typescript
const [styleCreatorOpen, setStyleCreatorOpen] = useState(false);
const [styleDescription, setStyleDescription] = useState("");
const [generatedStyle, setGeneratedStyle] = useState("");
const [styleHistory, setStyleHistory] = useState<{ role: "user" | "model"; content: string }[]>([]);
const [styleRefine, setStyleRefine] = useState("");
const [styleLoading, setStyleLoading] = useState(false);
const [styleError, setStyleError] = useState("");
```

**Step 2: Add the handleGenerateStyle function**

Add this function inside `Home`, after `handleClearHistory`:

```typescript
async function handleGenerateStyle(description: string) {
  if (!description.trim()) return;
  setStyleLoading(true);
  setStyleError("");
  try {
    const res = await fetch("/api/generate-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, history: styleHistory }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStyleError(data.error || "Failed to generate style");
      return;
    }
    const newHistory: { role: "user" | "model"; content: string }[] = [
      ...styleHistory,
      { role: "user", content: description },
      { role: "model", content: data.style },
    ];
    setStyleHistory(newHistory);
    setGeneratedStyle(data.style);
    setStyleRefine("");
  } catch {
    setStyleError("Network error");
  } finally {
    setStyleLoading(false);
  }
}
```

**Step 3: Add the Style Creator UI section in the sidebar**

In the sidebar `<aside>`, locate the Style section (the `<div>` that starts with `<SectionLabel>Style`). Insert the Style Creator block **between** the preset pills `<div className="flex flex-wrap gap-1 mb-3">` closing tag and the `<input ... placeholder="Custom style overrides preset..."` element.

The block to insert:

```tsx
{/* Style Creator */}
<div
  className="rounded-lg overflow-hidden mb-3"
  style={{ border: "1px solid var(--border-subtle)" }}
>
  {/* Toggle header */}
  <button
    onClick={() => setStyleCreatorOpen((o) => !o)}
    className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors duration-150"
    style={{
      background: styleCreatorOpen ? "var(--bg-surface)" : "transparent",
      color: "var(--text-secondary)",
    }}
  >
    <span className="flex items-center gap-2 text-[11px] font-medium">
      <span style={{ color: "var(--accent-secondary)" }}>✦</span>
      Style Creator
      {generatedStyle && !styleCreatorOpen && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded"
          style={{ background: "var(--accent-secondary-dim)", color: "var(--accent-secondary)" }}
        >
          active
        </span>
      )}
    </span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3 transition-transform duration-200"
      style={{
        color: "var(--text-muted)",
        transform: styleCreatorOpen ? "rotate(180deg)" : "rotate(0deg)",
      }}
    >
      <path
        fillRule="evenodd"
        d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  </button>

  {/* Expanded body */}
  {styleCreatorOpen && (
    <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      {generatedStyle ? (
        <>
          {/* Result display */}
          <div
            className="rounded-md px-3 py-2 text-[11px] leading-relaxed"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid color-mix(in srgb, var(--accent-secondary) 20%, transparent)",
            }}
          >
            {generatedStyle}
          </div>

          {/* Use / Reset actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCustomStyle(generatedStyle);
                setStyleCreatorOpen(false);
              }}
              className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150"
              style={{
                background: "var(--accent-secondary-dim)",
                border: "1px solid color-mix(in srgb, var(--accent-secondary) 30%, transparent)",
                color: "var(--accent-secondary)",
              }}
            >
              Use This Style
            </button>
            <button
              onClick={() => {
                setGeneratedStyle("");
                setStyleHistory([]);
                setStyleDescription("");
                setStyleRefine("");
                setStyleError("");
              }}
              className="px-3 py-1.5 rounded-md text-[11px] transition-all duration-150"
              style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
            >
              Reset
            </button>
          </div>

          {/* Refine input */}
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Refine
            </p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={styleRefine}
                onChange={(e) => setStyleRefine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !styleLoading && styleRefine.trim()) {
                    handleGenerateStyle(styleRefine);
                  }
                }}
                placeholder="make it warmer, add more urgency..."
                className="flex-1 rounded-md px-2.5 py-1.5 text-[11px] placeholder:opacity-25 focus:outline-none"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={() => handleGenerateStyle(styleRefine)}
                disabled={styleLoading || !styleRefine.trim()}
                className="px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150"
                style={{
                  background: styleLoading || !styleRefine.trim() ? "var(--bg-surface)" : "var(--accent-secondary-dim)",
                  border: "1px solid var(--border-subtle)",
                  color: styleLoading || !styleRefine.trim() ? "var(--text-muted)" : "var(--accent-secondary)",
                  cursor: styleLoading || !styleRefine.trim() ? "not-allowed" : "pointer",
                }}
              >
                {styleLoading ? "..." : "↵"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Initial description input */}
          <textarea
            value={styleDescription}
            onChange={(e) => setStyleDescription(e.target.value)}
            rows={2}
            placeholder="Describe the voice you need... e.g. calm authoritative documentary narrator with a slight British accent"
            className="w-full rounded-md px-2.5 py-2 text-[11px] leading-relaxed placeholder:opacity-25 focus:outline-none resize-none"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={() => handleGenerateStyle(styleDescription)}
            disabled={styleLoading || !styleDescription.trim()}
            className="w-full py-1.5 rounded-md text-[11px] font-medium transition-all duration-150"
            style={{
              background: styleLoading || !styleDescription.trim() ? "var(--bg-surface)" : "var(--accent-secondary-dim)",
              border: `1px solid ${styleLoading || !styleDescription.trim() ? "var(--border-subtle)" : "color-mix(in srgb, var(--accent-secondary) 30%, transparent)"}`,
              color: styleLoading || !styleDescription.trim() ? "var(--text-muted)" : "var(--accent-secondary)",
              cursor: styleLoading || !styleDescription.trim() ? "not-allowed" : "pointer",
            }}
          >
            {styleLoading ? "Generating..." : "✦ Generate Style"}
          </button>
        </>
      )}

      {styleError && (
        <p className="text-[10px]" style={{ color: "var(--danger)" }}>{styleError}</p>
      )}
    </div>
  )}
</div>
```

**Step 4: Verify in browser**

- Run `npm run dev`
- Open `http://localhost:3000`
- In the Style section, you should see a "✦ Style Creator" collapsible row between the preset pills and custom style input
- Click to expand → textarea + Generate Style button appears
- Type a description, click Generate → loading state, then result + "Use This Style" / "Reset" + refine input
- Click "Use This Style" → fills Custom Style field, collapses the creator
- Type in refine input, press Enter or ↵ button → updated style result

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add Style Creator sidebar section with iterative refinement"
```

---

### Task 3: Write design doc and final commit

**Files:**
- Create: `docs/plans/2026-02-27-style-creator-design.md`

**Step 1: Write the design doc**

```markdown
# Style Creator — Design Document

**Date:** 2026-02-27
**Status:** Implemented

## Overview

A collapsible "Style Creator" section in the left sidebar that uses Gemini Flash (text-only) to generate a TTS style prompt from a plain-English description. Supports iterative refinement via multi-turn conversation history held on the client.

## Architecture

- `POST /api/generate-style` — stateless route, receives `{ description, history }`, returns `{ style: string }`
- Client holds `styleHistory: {role, content}[]`, appends each turn, sends full history on refinement
- Result auto-fills the existing `customStyle` field when user clicks "Use This Style"

## System Prompt Strategy

Gemini is instructed to output only the style string (no markdown, no labels, under 120 words), following Google's TTS director framework collapsed into flowing prose. Geographic specificity for accents, no over-specification.

## UI Placement

Between Style Presets pills and Custom Style input in the left sidebar. Toggle header shows "active" badge when a generated style exists but the panel is collapsed.
```

**Step 2: Commit**

```bash
git add docs/plans/2026-02-27-style-creator-design.md
git commit -m "docs: add style creator design document"
```
