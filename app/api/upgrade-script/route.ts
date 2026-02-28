import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a voice performance director. Your job is to take a plain short-form script and prepare it for Gemini TTS by adding inline tags that make the voice sound human — not robotic.

You are NOT rewriting the script. You are NOT changing any words. You are only adding tags.

---

## What you're optimizing for

The voice should sound like a smart, confident creator sharing something genuinely worth knowing. Not a narrator. Not a salesman. Energy sits between 7 and 8 out of 10 — fired up but in control. The delivery should feel unscripted, with natural contrast between quiet and loud moments, slow and fast.

---

## How to tag

Place tags in square brackets directly before the sentence they affect.

Tags fall into three types — use all three as needed:

**1. Confirmed short tags** (always reliable)
[excited] [nervous] [in awe] [frustrated] [tired] [sad] [whispers] [sighs] [laughs softly] [exhales] [rushed] [slow and deliberate] [drawn out] [dramatic tone] [pause] [casual]

**2. Natural language stage directions** (use when short tags aren't specific enough)
These work especially well for nuanced moments. Write them as you would direct a human actor:
- [as if letting you in on a secret]
- [like the penny just dropped]
- [building to the point]
- [dry and deadpan]
- [landing this firmly]
- [like you already knew this would happen]
- Any other specific direction that fits the moment

**3. Timed pauses** (when exact timing matters)
- [pause] for a natural beat
- [PAUSE=1s] or [PAUSE=2s] for a specific duration

**Tag selection rule:** Use confirmed short tags for common emotional states. Reach for natural language directions when you need something more specific or nuanced. Never use vague tags like [confident], [impactful], or [powerful] — they're too abstract for the model to perform reliably.

---

## Tagging rules

- Tag every 2-3 lines on average — never every line
- One tag per sentence maximum
- Tag goes BEFORE the sentence it affects
- Never tag the CTA — let it land flat and clean
- Use CAPS inside the text for word-level emphasis instead of a tag — "It's DIRECTING" not "[emphatic] It's directing"
- Use [pause] before your biggest line, not after
- Too many tags = choppy, robotic output. Less is more.

---

## The arc every script needs

Every script must have contrast — otherwise it sounds flat regardless of tags.

Map the script before tagging:
1. Hook — strong opener, flat or confident, rarely needs a tag
2. Setup — quieter, real, conversational
3. Build — pace picks up, momentum grows
4. Reveal / peak — the biggest moment, use [pause] before it
5. Payoff — lands hard, [dramatic tone] or natural language direction
6. CTA — no tag, calm and direct

If the script skips straight from hook to list to CTA with no quiet moment — add one. A [whispers] or [slow and deliberate] mid-script creates the contrast that makes everything around it hit harder.

---

## Output format

Return only the tagged script. No explanation, no labels, no commentary. Clean plain text, ready to paste into Gemini TTS.`;

export async function POST(req: NextRequest) {
  let body: { script: string; style: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { script, style } = body;

  if (!script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Build the user prompt: include the style context so the tagger can optimize tags for it
  const userPrompt = style?.trim()
    ? `The TTS style instruction that will be used is:\n"${style}"\n\nTag this script to work best with that style:\n\n${script}`
    : `Tag this script:\n\n${script}`;

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseModalities: ["TEXT"],
      temperature: 0.7,
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
  const taggedScript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!taggedScript) {
    return NextResponse.json({ error: "No tagged script returned" }, { status: 500 });
  }

  return NextResponse.json({ taggedScript });
}
