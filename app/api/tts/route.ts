import { NextRequest, NextResponse } from "next/server";

// Gemini TTS returns raw PCM: 24kHz, 16-bit, mono
// We wrap it in a WAV header so browsers can play it
function pcmToWav(pcmBase64: string): string {
  const pcmBytes = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer).set(pcmBytes, 44);

  const wavBytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < wavBytes.length; i++) binary += String.fromCharCode(wavBytes[i]);
  return btoa(binary);
}

export async function POST(req: NextRequest) {
  let body: {
    model: string;
    voice: string;
    stylePreset: string;
    customStyle: string;
    text: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { model, voice, stylePreset, customStyle, text } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Custom style overrides preset; if no custom style, use preset
  const styleInstruction = customStyle?.trim() || stylePreset || "";
  // "Say: " prefix is required — without it the model tries to generate text instead of speech
  const fullPrompt = styleInstruction
    ? `${styleInstruction}: ${text}`
    : `Say: ${text}`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Network error contacting Gemini API" },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json(
      { error: `Google TTS error: ${error}` },
      { status: response.status }
    );
  }

  const data = await response.json();

  const pcmBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!pcmBase64) {
    return NextResponse.json({ error: "No audio returned from API" }, { status: 500 });
  }

  // Convert PCM to WAV so browsers can play it natively
  const wavBase64 = pcmToWav(pcmBase64);

  return NextResponse.json({
    audio: wavBase64,
    mimeType: "audio/wav",
  });
}
