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

  let styles: string[];
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    styles = JSON.parse(cleaned);
    if (!Array.isArray(styles) || styles.length === 0) {
      throw new Error("Not an array");
    }
    styles = styles.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    return NextResponse.json({ error: "Failed to parse styles from AI response" }, { status: 500 });
  }

  return NextResponse.json({ styles });
}
