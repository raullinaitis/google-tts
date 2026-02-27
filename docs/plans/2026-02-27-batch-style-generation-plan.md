# Batch Style Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Generate 10 Styles" button to Style Creator that generates 10 maximally diverse TTS styles via a single Gemini call, then auto-generates audio for all styles x all selected voices.

**Architecture:** New `/api/generate-styles` endpoint makes one Gemini Flash call returning a JSON array of 10 style strings. The UI adds a second button in the Style Creator, displays results as a scrollable card list, and a "Generate All" button fires TTS for every style x voice combination through the existing concurrency queue.

**Tech Stack:** Next.js API route, Gemini Flash API, React state management (existing patterns)

---

### Task 1: Create `/api/generate-styles` endpoint

**Files:**
- Create: `app/api/generate-styles/route.ts`

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a Google Gemini TTS voice director. Your job is to write 10 diverse style instruction strings for a text-to-speech voice actor, given a user's goal.

Rules:
- Output ONLY a valid JSON array of 10 strings. No explanation, no markdown, no labels.
- Each string is a style instruction under 120 words.
- Structure each as: character identity → environment/vibe → performance notes (pace, tone, accent, dynamics). Flowing prose, not labeled sections.
- MAXIMIZE DIVERSITY: each style must be dramatically different from all others — vary tone, pace, accent, mood, persona, energy, setting, and delivery. Think opposite ends of every spectrum.
- Be geographically specific for accents.
- Do NOT over-specify. Leave space for natural performance.

Example output format:
["Late-night jazz radio host, mid-40s, Chicago South Side. Warm mahogany voice in a dim studio at 2am. Languid pacing — words bleed into each other with zero urgency. Slight Chicago vowels, never exaggerated. Intimacy over projection.", "Excited sports commentator, 30s, Rio de Janeiro. Electric energy at a packed stadium. Rapid-fire delivery that builds to crescendo. Brazilian Portuguese cadence bleeding into English. Volume and pitch swing wildly with the action."]`;

export async function POST(req: NextRequest) {
  let body: { description: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { description } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: description }] }],
    generationConfig: {
      responseModalities: ["TEXT"],
      temperature: 1.2,
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
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
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!raw) {
    return NextResponse.json({ error: "No styles generated" }, { status: 500 });
  }

  // Parse the JSON array — strip markdown fences if present
  let styles: string[];
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    styles = JSON.parse(cleaned);
    if (!Array.isArray(styles) || styles.length === 0) {
      throw new Error("Not an array");
    }
    // Ensure all items are strings
    styles = styles.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    return NextResponse.json({ error: "Failed to parse styles from AI response" }, { status: 500 });
  }

  return NextResponse.json({ styles });
}
```

**Step 2: Verify the route compiles**

Run: `npx next lint app/api/generate-styles/route.ts` or just start the dev server and hit the endpoint.
Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/generate-styles/route.ts
git commit -m "feat: add /api/generate-styles endpoint for batch style generation"
```

---

### Task 2: Add batch style state to the UI

**Files:**
- Modify: `app/page.tsx:243-249` (state declarations area)

**Step 1: Add new state variables after the existing style state (line 249)**

Add these state variables right after `const [styleError, setStyleError] = useState("");` (line 249):

```typescript
const [batchStyles, setBatchStyles] = useState<string[]>([]);
const [batchStylesLoading, setBatchStylesLoading] = useState(false);
```

**Step 2: Add the batch generation handler**

Add this function after the existing `handleGenerateStyle` function (after line 501):

```typescript
async function handleGenerateBatchStyles() {
  if (!styleDescription.trim()) return;
  setBatchStylesLoading(true);
  setStyleError("");
  setBatchStyles([]);
  try {
    const res = await fetch("/api/generate-styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: styleDescription }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStyleError(data.error || "Failed to generate styles");
      return;
    }
    setBatchStyles(data.styles);
  } catch {
    setStyleError("Network error");
  } finally {
    setBatchStylesLoading(false);
  }
}
```

**Step 3: Add the "Generate All" handler**

This function sets each batch style as `customStyle` and fires TTS for all voices, creating results for every combination. Add after the batch handler above:

```typescript
async function handleGenerateAllStyles() {
  if (batchStyles.length === 0 || selectedVoices.length === 0 || !text.trim()) return;
  setError("");
  results.forEach((r) => {
    if (r.audioUrl) URL.revokeObjectURL(r.audioUrl);
  });
  setLoading(true);

  const newResults: GeneratedAudio[] = batchStyles.flatMap((style, styleIdx) =>
    selectedVoices.map((voice) => ({
      id: `${voice}-style${styleIdx}-${Date.now()}`,
      voice,
      model,
      modelLabel,
      stylePreset: "",
      styleLabel: `Style ${styleIdx + 1}`,
      customStyle: style,
      audioUrl: "",
      status: "loading" as const,
    }))
  );
  setResults(newResults);

  const CONCURRENCY = 5;
  const queue = [...newResults];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const r = queue.shift()!;
      // Inline TTS call with the style from the batch result
      const attempt = async (): Promise<boolean> => {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, voice: r.voice, stylePreset: "", customStyle: r.customStyle, text }),
        });
        const data = await res.json();
        if (res.status === 429) {
          const retryDelaySecs =
            data?.error?.details?.find(
              (d: { "@type": string; retryDelay?: string }) =>
                d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
            )?.retryDelay?.replace("s", "") ?? "10";
          const ms = Math.ceil(parseFloat(retryDelaySecs)) * 1000;
          await new Promise((resolve) => setTimeout(resolve, ms));
          return false;
        }
        if (!res.ok) {
          setResults((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, status: "error", error: data.error || "Failed" } : x
            )
          );
          return true;
        }
        const blob = new Blob(
          [Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))],
          { type: data.mimeType }
        );
        const url = URL.createObjectURL(blob);
        setResults((prev) =>
          prev.map((x) =>
            x.id === r.id ? { ...x, status: "done", audioUrl: url, audioBlob: blob } : x
          )
        );
        return true;
      };
      try {
        let done = await attempt();
        if (!done) done = await attempt();
        if (!done) {
          setResults((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, status: "error", error: "Rate limit exceeded, try again shortly" } : x
            )
          );
        }
      } catch {
        setResults((prev) =>
          prev.map((x) =>
            x.id === r.id ? { ...x, status: "error", error: "Network error" } : x
          )
        );
      }
    }
  });
  await Promise.allSettled(workers);
  setLoading(false);
}
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add batch style state and generation handlers"
```

---

### Task 3: Add "Generate 10 Styles" button to Style Creator UI

**Files:**
- Modify: `app/page.tsx:826-838` (the existing Generate Style button area in the initial description view)

**Step 1: Replace the single button with two buttons side by side**

Replace the existing button block (lines 826-838, the `<button>✦ Generate Style</button>`) with:

```tsx
<div className="flex gap-1.5">
  <button
    onClick={() => handleGenerateStyle(styleDescription)}
    disabled={styleLoading || batchStylesLoading || !styleDescription.trim()}
    className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150"
    style={{
      background: styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--bg-surface)" : "var(--accent-secondary-dim)",
      border: `1px solid ${styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--border-subtle)" : "color-mix(in srgb, var(--accent-secondary) 30%, transparent)"}`,
      color: styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--text-muted)" : "var(--accent-secondary)",
      cursor: styleLoading || batchStylesLoading || !styleDescription.trim() ? "not-allowed" : "pointer",
    }}
  >
    {styleLoading ? "Generating..." : "✦ Generate Style"}
  </button>
  <button
    onClick={handleGenerateBatchStyles}
    disabled={styleLoading || batchStylesLoading || !styleDescription.trim()}
    className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150"
    style={{
      background: styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--bg-surface)" : "var(--accent-dim)",
      border: `1px solid ${styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--border-subtle)" : "color-mix(in srgb, var(--accent) 30%, transparent)"}`,
      color: styleLoading || batchStylesLoading || !styleDescription.trim() ? "var(--text-muted)" : "var(--accent)",
      cursor: styleLoading || batchStylesLoading || !styleDescription.trim() ? "not-allowed" : "pointer",
    }}
  >
    {batchStylesLoading ? "Generating..." : "✦ Generate 10 Styles"}
  </button>
</div>
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add Generate 10 Styles button next to single style button"
```

---

### Task 4: Add batch results display with "Use" and "Generate All" actions

**Files:**
- Modify: `app/page.tsx` — inside the Style Creator expanded body, add batch results view

**Step 1: Add batch results section**

After the `styleError` display (line 842-844) and before the closing `</div>` of the expanded body (line 845), add the batch results UI:

```tsx
{/* Batch styles results */}
{batchStyles.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {batchStyles.length} Styles Generated
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={handleGenerateAllStyles}
          disabled={loading || !text.trim() || selectedVoices.length === 0}
          className="px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150"
          style={{
            background: loading || !text.trim() || selectedVoices.length === 0 ? "var(--bg-surface)" : "var(--accent-dim)",
            border: `1px solid ${loading || !text.trim() || selectedVoices.length === 0 ? "var(--border-subtle)" : "color-mix(in srgb, var(--accent) 30%, transparent)"}`,
            color: loading || !text.trim() || selectedVoices.length === 0 ? "var(--text-muted)" : "var(--accent)",
            cursor: loading || !text.trim() || selectedVoices.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating..." : `Generate All (${batchStyles.length * selectedVoices.length})`}
        </button>
        <button
          onClick={() => setBatchStyles([])}
          className="px-2 py-1 rounded-md text-[10px] transition-all duration-150"
          style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
        >
          Clear
        </button>
      </div>
    </div>
    <div className="max-h-[300px] overflow-y-auto space-y-1.5 rounded-md">
      {batchStyles.map((style, i) => (
        <div
          key={i}
          className="rounded-md px-3 py-2 text-[11px] leading-relaxed group/style"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[9px] font-medium shrink-0 mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {i + 1}.
            </span>
            <p className="flex-1 min-w-0">{style}</p>
            <button
              onClick={() => {
                setCustomStyle(style);
                setStyleCreatorOpen(false);
              }}
              className="shrink-0 px-2 py-0.5 rounded text-[9px] font-medium opacity-0 group-hover/style:opacity-100 transition-all duration-150"
              style={{
                background: "var(--accent-secondary-dim)",
                color: "var(--accent-secondary)",
                border: "1px solid color-mix(in srgb, var(--accent-secondary) 20%, transparent)",
              }}
            >
              Use
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 2: Also clear batchStyles in the Reset button handler**

In the existing Reset button's `onClick` (around line 758-764), add `setBatchStyles([]);`:

```typescript
onClick={() => {
  setGeneratedStyle("");
  setStyleHistory([]);
  setStyleDescription("");
  setStyleRefine("");
  setStyleError("");
  setBatchStyles([]);
}}
```

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add batch styles results display with Use and Generate All buttons"
```

---

### Task 5: Manual testing and final commit

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test the single-style flow still works**

1. Open Style Creator, type a description, click "Generate Style"
2. Verify it generates one style, Use/Reset/Refine all work

**Step 3: Test batch style generation**

1. Type a description, click "Generate 10 Styles"
2. Verify 10 styles appear as a scrollable list
3. Click "Use" on any style — verify it fills the custom style input
4. Select 2 voices, enter text, click "Generate All"
5. Verify audio cards appear in the output panel (2 voices x 10 styles = 20 cards)
6. Verify audio plays back, downloads work

**Step 4: Test edge cases**

- Click "Generate All" with no text entered — should be disabled
- Click "Generate All" with no voices selected — should be disabled
- Click "Clear" — batch styles disappear
- Click "Reset" in single-style view — batch styles also clear

**Step 5: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: address issues found during batch style testing"
```
