"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MODELS,
  MALE_VOICES,
  FEMALE_VOICES,
  STYLE_PRESETS,
} from "@/lib/voices";
import {
  saveGeneration,
  getAllGenerations,
  deleteGeneration,
  clearHistory,
  type HistoryEntry,
} from "@/lib/history";

const MAX_BYTES = 4000;

function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function WaveformLoader() {
  return (
    <div className="flex items-center gap-[3px] h-6 py-1">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

type GeneratedAudio = {
  id: string;
  voice: string;
  model: string;
  modelLabel: string;
  stylePreset: string;
  styleLabel: string;
  customStyle: string;
  audioUrl: string;
  audioBlob?: Blob;
  status: "loading" | "done" | "error";
  error?: string;
};

type HistoryItem = HistoryEntry & {
  audioUrl: string;
};

/* ── Shared tag pill ── */
function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium"
      style={{
        background: color ? undefined : "var(--bg-surface)",
        backgroundColor: color ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
        color: color || "var(--text-secondary)",
        fontFamily: "var(--font-mono)",
        border: color ? `1px solid color-mix(in srgb, ${color} 25%, transparent)` : "none",
      }}
    >
      {children}
    </span>
  );
}

/* ── Audio card used in both results & history ── */
function AudioCard({
  voice,
  modelLabel,
  styleLabel,
  customStyle,
  text,
  audioUrl,
  audioRef,
  status,
  error,
  timestamp,
  onDownload,
  onDelete,
  onPlay,
}: {
  voice: string;
  modelLabel: string;
  styleLabel: string;
  customStyle: string;
  text?: string;
  audioUrl: string;
  audioRef?: React.Ref<HTMLAudioElement>;
  status: "loading" | "done" | "error";
  error?: string;
  timestamp?: string;
  onDownload: () => void;
  onDelete?: () => void;
  onPlay?: (el: HTMLAudioElement) => void;
}) {
  return (
    <div
      className="rounded-xl p-4 space-y-3 animate-fade-in group"
      style={{
        background: "var(--bg-raised)",
        border: `1px solid ${status === "done" ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--border-dim)"}`,
      }}
    >
      {/* Top row: tags + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag>{voice}</Tag>
          <Tag>{modelLabel}</Tag>
          {(customStyle || styleLabel !== "Neutral") && (
            <Tag color="var(--accent-secondary)">
              {customStyle || styleLabel}
            </Tag>
          )}
          {timestamp && (
            <span
              className="text-[10px] tabular-nums ml-0.5"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.5 }}
            >
              {timestamp}
            </span>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-150 hover:!opacity-100"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--danger)";
              e.currentTarget.style.background = "var(--danger-dim)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Text preview */}
      {text && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {text.length > 100 ? text.slice(0, 100) + "..." : text}
        </p>
      )}

      {/* Audio / Loading / Error */}
      {status === "loading" && (
        <div className="flex items-center gap-3">
          <WaveformLoader />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Generating...</span>
        </div>
      )}
      {status === "error" && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>
      )}
      {status === "done" && (
        <div className="space-y-2">
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            className="w-full"
            onPlay={(e) => onPlay?.(e.currentTarget)}
          />
          <button
            onClick={onDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all duration-150"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 2a.75.75 0 0 1 .75.75v6.69l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V2.75A.75.75 0 0 1 8 2Z" />
              <path d="M3.5 10a.75.75 0 0 1 .75.75v1.5h7.5v-1.5a.75.75 0 0 1 1.5 0v1.5A1.5 1.5 0 0 1 11.75 14h-7.5A1.5 1.5 0 0 1 2.75 12.5v-1.5a.75.75 0 0 1 .75-.75Z" />
            </svg>
            WAV
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Section label ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[10px] font-medium uppercase tracking-[0.2em] mb-2.5"
      style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
    >
      {children}
    </label>
  );
}

/* ════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [model, setModel] = useState(MODELS[0].id);
  const [selectedVoices, setSelectedVoices] = useState<string[]>([
    MALE_VOICES[0].name,
  ]);
  const [stylePreset, setStylePreset] = useState(STYLE_PRESETS[0].tag);
  const [customStyle, setCustomStyle] = useState("");
  const [styleCreatorOpen, setStyleCreatorOpen] = useState(false);
  const [styleDescription, setStyleDescription] = useState("");
  const [generatedStyle, setGeneratedStyle] = useState("");
  const [styleHistory, setStyleHistory] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [styleRefine, setStyleRefine] = useState("");
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleError, setStyleError] = useState("");
  const [batchStyles, setBatchStyles] = useState<string[]>([]);
  const [batchStylesLoading, setBatchStylesLoading] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GeneratedAudio[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const firstAudioRef = useRef<HTMLAudioElement>(null);
  const allAudioRefs = useRef<Set<HTMLAudioElement>>(new Set());

  const handleAudioPlay = useCallback((el: HTMLAudioElement) => {
    allAudioRefs.current.add(el);
    allAudioRefs.current.forEach((other) => {
      if (other !== el) other.pause();
    });
  }, []);

  const textBytes = byteLength(text);
  const textTooLong = textBytes > MAX_BYTES;
  const hasCustomStyle = customStyle.trim().length > 0;

  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const styleLabel =
    STYLE_PRESETS.find((s) => s.tag === stylePreset)?.label ?? "Neutral";

  // Load history on mount
  useEffect(() => {
    getAllGenerations().then((entries) => {
      setHistory(
        entries.map((e) => ({
          ...e,
          audioUrl: URL.createObjectURL(e.audioBlob),
        }))
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      history.forEach((h) => URL.revokeObjectURL(h.audioUrl));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const firstDone = results.find((r) => r.status === "done");
    if (firstDone && firstAudioRef.current) {
      firstAudioRef.current.play().catch(() => {});
    }
  }, [results]);

  useEffect(() => {
    return () => {
      results.forEach((r) => {
        if (r.audioUrl) URL.revokeObjectURL(r.audioUrl);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleVoice(name: string) {
    setSelectedVoices((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    );
  }

  const generateForVoice = useCallback(
    async (voice: string, id: string) => {
      const attempt = async (): Promise<boolean> => {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, voice, stylePreset, customStyle, text }),
        });
        const data = await res.json();
        if (res.status === 429) {
          // Parse retryDelay from error details, fall back to 10s
          const retryDelaySecs =
            data?.error?.details?.find(
              (d: { "@type": string; retryDelay?: string }) =>
                d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
            )?.retryDelay?.replace("s", "") ?? "10";
          const ms = Math.ceil(parseFloat(retryDelaySecs)) * 1000;
          await new Promise((r) => setTimeout(r, ms));
          return false; // signal: retry
        }
        if (!res.ok) {
          setResults((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: "error", error: data.error || "Failed" } : r
            )
          );
          return true; // signal: done (with error)
        }
        const blob = new Blob(
          [Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))],
          { type: data.mimeType }
        );
        const url = URL.createObjectURL(blob);
        setResults((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "done", audioUrl: url, audioBlob: blob } : r
          )
        );
        return true; // signal: done (success)
      };

      try {
        let done = await attempt();
        if (!done) done = await attempt(); // retry once after delay
        if (!done) {
          // second attempt also got 429
          setResults((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: "error", error: "Rate limit exceeded, try again shortly" } : r
            )
          );
        }
      } catch {
        setResults((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "error", error: "Network error" } : r
          )
        );
      }
    },
    [model, stylePreset, customStyle, text]
  );

  const saveResultsToHistory = useCallback(
    async (completedResults: GeneratedAudio[]) => {
      const successful = completedResults.filter(
        (r) => r.status === "done" && r.audioBlob
      );
      const newHistoryItems: HistoryItem[] = [];
      for (const r of successful) {
        const entry: HistoryEntry = {
          id: r.id,
          voice: r.voice,
          model: r.model,
          modelLabel: r.modelLabel,
          stylePreset: r.stylePreset,
          styleLabel: r.styleLabel,
          customStyle: r.customStyle,
          text,
          audioBlob: r.audioBlob!,
          createdAt: new Date().toISOString(),
        };
        await saveGeneration(entry);
        newHistoryItems.push({
          ...entry,
          audioUrl: URL.createObjectURL(r.audioBlob!),
        });
      }
      if (newHistoryItems.length > 0) {
        setHistory((prev) => [...newHistoryItems, ...prev]);
      }
    },
    [text]
  );

  async function handleGenerate() {
    setError("");
    results.forEach((r) => {
      if (r.audioUrl) URL.revokeObjectURL(r.audioUrl);
    });
    if (selectedVoices.length === 0) {
      setError("Select at least one voice.");
      return;
    }
    setLoading(true);
    const newResults: GeneratedAudio[] = selectedVoices.map((voice) => ({
      id: `${voice}-${Date.now()}`,
      voice,
      model,
      modelLabel,
      stylePreset,
      styleLabel,
      customStyle,
      audioUrl: "",
      status: "loading",
    }));
    setResults(newResults);
    // Max 5 concurrent requests to avoid hitting RPM limits
    const CONCURRENCY = 5;
    const queue = [...newResults];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const r = queue.shift()!;
        await generateForVoice(r.voice, r.id);
      }
    });
    await Promise.allSettled(workers);
    setLoading(false);
  }

  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading && results.length > 0) {
      saveResultsToHistory(results);
    }
    prevLoadingRef.current = loading;
  }, [loading, results, saveResultsToHistory]);

  function handleDownload(audioUrl: string, voice: string) {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `tts-${voice}-${Date.now()}.wav`;
    a.click();
  }

  async function handleDeleteHistoryItem(id: string) {
    await deleteGeneration(id);
    setHistory((prev) => {
      const item = prev.find((h) => h.id === id);
      if (item) URL.revokeObjectURL(item.audioUrl);
      return prev.filter((h) => h.id !== id);
    });
  }

  async function handleClearHistory() {
    await clearHistory();
    history.forEach((h) => URL.revokeObjectURL(h.audioUrl));
    setHistory([]);
  }

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

  const canGenerate =
    !loading && !textTooLong && text.trim().length > 0 && selectedVoices.length > 0;

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 70%)",
          opacity: 0.25,
        }}
      />

      {/* Header bar */}
      <header
        className="relative shrink-0 flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-dim)" }}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent-glow)" }}
        />
        <h1
          className="text-lg font-bold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Gemini TTS
        </h1>
        <span
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
        >
          Studio
        </span>
      </header>

      {/* Two-panel body */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* ═══ LEFT: Controls ═══ */}
        <aside
          className="w-[420px] shrink-0 overflow-y-auto p-5 space-y-5"
          style={{ borderRight: "1px solid var(--border-dim)" }}
        >
          {/* Model */}
          <div>
            <SectionLabel>Model</SectionLabel>
            <div className="flex gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className="flex-1 py-2 px-2.5 rounded-lg text-center transition-all duration-200"
                  style={{
                    background: model === m.id ? "var(--accent-dim)" : "var(--bg-surface)",
                    border: `1px solid ${model === m.id ? "var(--accent)" : "var(--border-subtle)"}`,
                    color: model === m.id ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <span className="block text-[12px] font-semibold">{m.label}</span>
                  <span className="block text-[9px] mt-0.5 opacity-50">{m.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voices */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <SectionLabel>Voices</SectionLabel>
              {selectedVoices.length > 0 && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                  }}
                >
                  {selectedVoices.length}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {/* Male */}
              <div>
                <p
                  className="text-[9px] font-medium uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5"
                  style={{ color: "var(--male-accent)" }}
                >
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--male-accent)" }} />
                  Male
                </p>
                <div className="flex flex-wrap gap-1">
                  {MALE_VOICES.map((v) => {
                    const sel = selectedVoices.includes(v.name);
                    return (
                      <button
                        key={v.name}
                        onClick={() => toggleVoice(v.name)}
                        className="px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150"
                        style={{
                          background: sel ? "var(--male-dim)" : "var(--bg-surface)",
                          border: `1px solid ${sel ? "var(--male-accent)" : "transparent"}`,
                          color: sel ? "var(--male-accent)" : "var(--text-secondary)",
                        }}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Female */}
              <div>
                <p
                  className="text-[9px] font-medium uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5"
                  style={{ color: "var(--female-accent)" }}
                >
                  <span className="w-1 h-1 rounded-full" style={{ background: "var(--female-accent)" }} />
                  Female
                </p>
                <div className="flex flex-wrap gap-1">
                  {FEMALE_VOICES.map((v) => {
                    const sel = selectedVoices.includes(v.name);
                    return (
                      <button
                        key={v.name}
                        onClick={() => toggleVoice(v.name)}
                        className="px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150"
                        style={{
                          background: sel ? "var(--female-dim)" : "var(--bg-surface)",
                          border: `1px solid ${sel ? "var(--female-accent)" : "transparent"}`,
                          color: sel ? "var(--female-accent)" : "var(--text-secondary)",
                        }}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Style */}
          <div>
            <SectionLabel>
              Style
              {hasCustomStyle && (
                <span className="normal-case tracking-normal opacity-50 ml-1">
                  — custom active
                </span>
              )}
            </SectionLabel>
            <div className="flex flex-wrap gap-1 mb-3">
              {STYLE_PRESETS.map((s) => {
                const isActive = stylePreset === s.tag;
                return (
                  <button
                    key={s.label}
                    onClick={() => setStylePreset(s.tag)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150"
                    style={{
                      background: isActive ? "var(--accent-secondary-dim)" : "var(--bg-surface)",
                      border: `1px solid ${isActive ? "var(--accent-secondary)" : "transparent"}`,
                      color: isActive ? "var(--accent-secondary)" : "var(--text-secondary)",
                      opacity: hasCustomStyle ? 0.35 : 1,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
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
                            setBatchStyles([]);
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
                          {batchStylesLoading ? "Generating..." : "✦ 10 Styles"}
                        </button>
                      </div>
                    </>
                  )}

                  {styleError && (
                    <p className="text-[10px]" style={{ color: "var(--danger)" }}>{styleError}</p>
                  )}

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
                </div>
              )}
            </div>
            <input
              type="text"
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="Custom style overrides preset..."
              className="w-full rounded-lg px-3 py-2 text-[12px] placeholder:opacity-25 focus:outline-none transition-all duration-200"
              style={{
                background: "var(--bg-surface)",
                border: `1px solid ${hasCustomStyle ? "var(--accent-secondary)" : "var(--border-subtle)"}`,
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Text */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <SectionLabel>Text</SectionLabel>
              <span
                className="text-[10px] tabular-nums"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: textTooLong ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                {textBytes}/{MAX_BYTES}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Enter the text you want to convert to speech..."
              className="w-full rounded-lg px-3 py-2.5 text-[12px] leading-relaxed placeholder:opacity-25 focus:outline-none resize-y transition-all duration-200"
              style={{
                background: "var(--bg-surface)",
                border: `1px solid ${textTooLong ? "var(--danger)" : "var(--border-subtle)"}`,
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-3 rounded-xl text-[12px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
              loading ? "pulse-glow" : ""
            }`}
            style={{
              fontFamily: "var(--font-mono)",
              background: loading ? "var(--accent-dim)" : canGenerate ? "var(--accent)" : "var(--bg-surface)",
              color: loading ? "var(--accent)" : canGenerate ? "var(--bg-primary)" : "var(--text-muted)",
              cursor: canGenerate ? "pointer" : "not-allowed",
              opacity: canGenerate || loading ? 1 : 0.4,
            }}
          >
            {loading
              ? `Generating${selectedVoices.length > 1 ? ` (${selectedVoices.length})` : ""}...`
              : selectedVoices.length > 1
                ? `Generate ${selectedVoices.length} Variations`
                : "Generate"}
          </button>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-[11px] animate-fade-in"
              style={{ background: "var(--danger-dim)", border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              {error}
            </div>
          )}
        </aside>

        {/* ═══ RIGHT: Output + History feed ═══ */}
        <main className="flex-1 overflow-y-auto p-5">
          {/* Empty state */}
          {results.length === 0 && history.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="flex justify-center gap-1 opacity-20">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full"
                      style={{
                        background: "var(--text-muted)",
                        height: `${12 + Math.sin(i * 1.2) * 10}px`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.4 }}>
                  Generate speech to see results here
                </p>
              </div>
            </div>
          )}

          {/* Current results */}
          {results.length > 0 && (
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: loading ? "var(--accent)" : "var(--text-muted)",
                    boxShadow: loading ? "0 0 6px var(--accent-glow)" : "none",
                  }}
                />
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.2em]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  {loading ? "Generating" : "Output"}
                </span>
              </div>
              {results.map((r, i) => (
                <AudioCard
                  key={r.id}
                  voice={r.voice}
                  modelLabel={r.modelLabel}
                  styleLabel={r.styleLabel}
                  customStyle={r.customStyle}
                  audioUrl={r.audioUrl}
                  audioRef={i === 0 ? firstAudioRef : undefined}
                  status={r.status}
                  error={r.error}
                  onDownload={() => handleDownload(r.audioUrl, r.voice)}
                  onPlay={handleAudioPlay}
                />
              ))}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-3">
              {results.length > 0 && (
                <div
                  className="h-px w-full my-4"
                  style={{ background: "linear-gradient(to right, transparent, var(--border-subtle), transparent)" }}
                />
              )}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium uppercase tracking-[0.2em]"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                  >
                    History
                  </span>
                  <span
                    className="text-[9px] tabular-nums px-1.5 py-0.5 rounded"
                    style={{ fontFamily: "var(--font-mono)", background: "var(--bg-surface)", color: "var(--text-muted)" }}
                  >
                    {history.length}
                  </span>
                </div>
                <button
                  onClick={handleClearHistory}
                  className="text-[10px] font-medium uppercase tracking-[0.1em] px-2 py-1 rounded-md transition-all duration-150"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--danger)";
                    e.currentTarget.style.background = "var(--danger-dim)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Clear All
                </button>
              </div>
              {history.map((h) => (
                <AudioCard
                  key={h.id}
                  voice={h.voice}
                  modelLabel={h.modelLabel}
                  styleLabel={h.styleLabel}
                  customStyle={h.customStyle}
                  text={h.text}
                  audioUrl={h.audioUrl}
                  status="done"
                  timestamp={timeAgo(h.createdAt)}
                  onDownload={() => handleDownload(h.audioUrl, h.voice)}
                  onDelete={() => handleDeleteHistoryItem(h.id)}
                  onPlay={handleAudioPlay}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
