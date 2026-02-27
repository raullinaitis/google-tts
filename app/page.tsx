"use client";

import { useState, useRef, useEffect } from "react";
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
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const textBytes = byteLength(text);
  const textTooLong = textBytes > MAX_BYTES;

  // Revoke the blob URL when it changes or the component unmounts to avoid memory leaks.
  // Also trigger autoplay whenever a new URL is set.
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play().catch(() => {
        // Autoplay blocked by browser policy — not an error
      });
    }
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

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
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
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
    a.download = `tts-${voice}-${Date.now()}.wav`;
    a.click();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Gemini TTS</h1>

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
              (optional — e.g. &ldquo;speak warmly and slowly&rdquo;)
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
              textTooLong
                ? "text-red-400 font-semibold"
                : "text-gray-500"
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
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-white transition-colors"
            >
              Download WAV
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
