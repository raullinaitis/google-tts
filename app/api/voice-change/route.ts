import { NextRequest, NextResponse } from "next/server";

// ElevenLabs Speech-to-Speech returns raw PCM when output_format=pcm_24000.
// We wrap it in a WAV header so the browser (and our WAV slicer) can consume it.
function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer).set(pcm, 44);

  return new Uint8Array(buffer);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }

  let body: { audio: string; voiceId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { audio, voiceId } = body;
  if (!audio || !voiceId) {
    return NextResponse.json({ error: "audio and voiceId are required" }, { status: 400 });
  }

  // Decode base64 WAV from the client (Gemini TTS output).
  let inputBytes: Uint8Array;
  try {
    inputBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
  } catch {
    return NextResponse.json({ error: "audio must be base64" }, { status: 400 });
  }

  const form = new FormData();
  const audioBuffer = inputBytes.buffer.slice(
    inputBytes.byteOffset,
    inputBytes.byteOffset + inputBytes.byteLength,
  ) as ArrayBuffer;
  form.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "input.wav");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("output_format", "pcm_24000");

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      },
    );
  } catch {
    return NextResponse.json({ error: "Network error contacting ElevenLabs" }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `ElevenLabs error: ${errText}` },
      { status: res.status },
    );
  }

  const pcm = new Uint8Array(await res.arrayBuffer());
  const wav = pcmToWav(pcm, 24000);

  // Return base64 so client can turn it into a Blob exactly like Gemini output.
  let binary = "";
  for (let i = 0; i < wav.length; i++) binary += String.fromCharCode(wav[i]);
  const b64 = btoa(binary);

  return NextResponse.json({ audio: b64, mimeType: "audio/wav" });
}
