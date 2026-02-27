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
