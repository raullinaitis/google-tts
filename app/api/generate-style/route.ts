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

  const { description, history = [] } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Build contents array: conversation history + new user message
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
