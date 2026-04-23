"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { sliceWav } from "@/lib/wav-split";

const MARKER_COLORS = [
  "rgba(167,139,250,0.85)",
  "rgba(34,211,238,0.85)",
  "rgba(251,191,36,0.85)",
  "rgba(244,114,182,0.85)",
  "rgba(74,222,128,0.85)",
  "rgba(248,113,113,0.85)",
];

export function SplitModal({
  open,
  onClose,
  sourceBlob,
  sourceUrl,
  text,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  sourceBlob: Blob;
  sourceUrl: string;
  text: string;
  onSave: (segments: { name: string; blob: Blob }[]) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const markerRefs = useRef<Map<string, Region>>(new Map());
  const [duration, setDuration] = useState(0);
  const [cuts, setCuts] = useState<{ id: string; pos: number }[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);

  // Default to two cuts (three parts) on first load.
  const initialCuts = useMemo(() => [1 / 3, 2 / 3], []);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const container = containerRef.current;

    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container,
      url: sourceUrl,
      waveColor: "#6b7280",
      progressColor: "#a78bfa",
      cursorColor: "#a78bfa",
      height: 96,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    });

    wsRef.current = ws;
    regionsRef.current = regions;

    ws.on("ready", (d) => {
      setDuration(d);
      const initial = initialCuts.map((p, i) => ({
        id: `cut-${Date.now()}-${i}`,
        pos: d * p,
      }));
      setCuts(initial);
      setNames(Array.from({ length: initial.length + 1 }, (_, i) => `Part ${i + 1}`));
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("seeking", (t) => setCurrentTime(t));

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      markerRefs.current.clear();
    };
  }, [open, sourceUrl, initialCuts]);

  // Sync marker regions with cuts state.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || duration === 0) return;

    const markerWidth = Math.max(0.05, duration * 0.004);
    const seen = new Set<string>();

    cuts.forEach((cut, idx) => {
      seen.add(cut.id);
      const existing = markerRefs.current.get(cut.id);
      const color = MARKER_COLORS[idx % MARKER_COLORS.length];
      if (existing) {
        const mid = (existing.start + existing.end) / 2;
        if (Math.abs(mid - cut.pos) > 0.01) {
          existing.setOptions({
            start: cut.pos - markerWidth / 2,
            end: cut.pos + markerWidth / 2,
            color,
          });
        } else {
          existing.setOptions({ color });
        }
      } else {
        const r = regions.addRegion({
          start: cut.pos - markerWidth / 2,
          end: cut.pos + markerWidth / 2,
          color,
          drag: true,
          resize: false,
          id: cut.id,
        });
        r.on("update-end", () => {
          const mid = (r.start + r.end) / 2;
          setCuts((prev) => prev.map((c) => (c.id === cut.id ? { ...c, pos: mid } : c)));
        });
        markerRefs.current.set(cut.id, r);
      }
    });

    // Remove markers whose cut was deleted.
    for (const [id, region] of markerRefs.current.entries()) {
      if (!seen.has(id)) {
        region.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [cuts, duration]);

  // Sort-aware boundaries for slicing.
  const sortedPositions = useMemo(() => [...cuts.map((c) => c.pos)].sort((a, b) => a - b), [cuts]);

  const segmentRanges = useMemo(() => {
    const boundaries = [0, ...sortedPositions, duration];
    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      ranges.push({ start: boundaries[i], end: boundaries[i + 1] });
    }
    return ranges;
  }, [sortedPositions, duration]);

  // Keep names array length in sync with segment count.
  useEffect(() => {
    setNames((prev) => {
      const need = segmentRanges.length;
      if (prev.length === need) return prev;
      if (prev.length < need) {
        return [...prev, ...Array.from({ length: need - prev.length }, (_, i) => `Part ${prev.length + i + 1}`)];
      }
      return prev.slice(0, need);
    });
  }, [segmentRanges.length]);

  function addCut() {
    // Insert at the midpoint of the longest current segment.
    if (duration === 0) return;
    let bestIdx = 0;
    let bestLen = -1;
    segmentRanges.forEach((r, i) => {
      const len = r.end - r.start;
      if (len > bestLen) {
        bestLen = len;
        bestIdx = i;
      }
    });
    const target = segmentRanges[bestIdx];
    const mid = (target.start + target.end) / 2;
    setCuts((prev) => [...prev, { id: `cut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, pos: mid }]);
  }

  function removeCut(id: string) {
    setCuts((prev) => prev.filter((c) => c.id !== id));
  }

  function renameSegment(index: number, value: string) {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const blobs = await sliceWav(sourceBlob, segmentRanges.map((r) => ({ startSec: r.start, endSec: r.end })));
      const segments = blobs.map((blob, i) => ({
        name: (names[i] || `Part ${i + 1}`).trim() || `Part ${i + 1}`,
        blob,
      }));
      await onSave(segments);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function playSegment(start: number, end: number) {
    const ws = wsRef.current;
    if (!ws || end <= start) return;
    ws.setTime(start);
    ws.play();
    const check = () => {
      if (!wsRef.current) return;
      if (wsRef.current.getCurrentTime() >= end) {
        wsRef.current.pause();
      } else if (wsRef.current.isPlaying()) {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }

  if (!open) return null;

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00.0";
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return `${m}:${sec.padStart(4, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl p-5 space-y-4"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Split into {segmentRanges.length} {segmentRanges.length === 1 ? "file" : "files"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md"
            style={{ color: "var(--text-muted)" }}
            title="Close"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Drag markers to position cuts. Click the waveform to move the playhead, then press Play to hear from that point. Use Preview to audition a single segment.
        </p>

        <div
          ref={containerRef}
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
        />

        {/* Playhead + transport */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => (isPlaying ? wsRef.current?.pause() : wsRef.current?.play())}
              className="px-3 py-2 rounded-lg text-[11px] font-medium"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              title="Play from the current playhead position"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span
              className="text-[10px] tabular-nums"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
            >
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>
          <button
            onClick={addCut}
            disabled={duration === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-medium"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: duration === 0 ? "var(--text-muted)" : "var(--accent)",
              cursor: duration === 0 ? "not-allowed" : "pointer",
            }}
            title="Add another split"
          >
            + Add split
          </button>
        </div>

        {/* Segment list */}
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {segmentRanges.map((seg, i) => {
            const color = MARKER_COLORS[Math.max(0, i - 1) % MARKER_COLORS.length];
            const cutAfter = cuts.slice().sort((a, b) => a.pos - b.pos)[i];
            return (
              <div
                key={i}
                className="rounded-lg p-2.5 flex items-center gap-2"
                style={{
                  background: "var(--bg-surface)",
                  border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                }}
              >
                <input
                  type="text"
                  value={names[i] ?? ""}
                  placeholder={`Part ${i + 1}`}
                  onChange={(e) => renameSegment(i, e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[11px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                />
                <span
                  className="text-[10px] tabular-nums shrink-0"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  {fmt(seg.end - seg.start)}
                </span>
                <button
                  onClick={() => playSegment(seg.start, seg.end)}
                  className="shrink-0 px-2 py-1 rounded text-[10px] font-medium"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title="Preview this segment"
                >
                  ▶ Preview
                </button>
                {cutAfter && (
                  <button
                    onClick={() => removeCut(cutAfter.id)}
                    className="shrink-0 px-2 py-1 rounded text-[10px]"
                    style={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                    title="Remove the split after this segment"
                  >
                    × split
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-[11px] font-medium"
            style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
            title="The full audio is already saved in History"
          >
            Skip — keep full only
          </button>
          <button
            onClick={handleSave}
            disabled={saving || duration === 0 || segmentRanges.length === 0}
            className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{
              fontFamily: "var(--font-mono)",
              background: saving || duration === 0 ? "var(--bg-surface)" : "var(--accent)",
              color: saving || duration === 0 ? "var(--text-muted)" : "var(--bg-primary)",
              cursor: saving || duration === 0 ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : `Save as ${segmentRanges.length} ${segmentRanges.length === 1 ? "file" : "files"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
