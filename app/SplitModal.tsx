"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { sliceWav } from "@/lib/wav-split";
import type { SegmentType } from "@/lib/history";

type SegmentSpec = { type: SegmentType; startSec: number; endSec: number };

// Parse [HOOK]...[BODY]...[CTA] and return char-offset-based proportions.
// Falls back to even thirds when brackets aren't present or don't match the 3-segment pattern.
function proportionsFromText(text: string): [number, number] {
  if (!text) return [1 / 3, 2 / 3];

  const re = /\[(HOOK|BODY|CTA)\]/gi;
  type Hit = { type: SegmentType; idx: number };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    hits.push({ type: m[1].toUpperCase() as SegmentType, idx: m.index });
  }

  const hook = hits.find((h) => h.type === "HOOK");
  const body = hits.find((h) => h.type === "BODY");
  const cta = hits.find((h) => h.type === "CTA");
  if (!hook || !body || !cta) return [1 / 3, 2 / 3];

  const total = text.length;
  // Boundaries are where each segment ENDS (= where the next tag starts).
  return [body.idx / total, cta.idx / total];
}

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
  onSave: (segments: { type: SegmentType; blob: Blob }[]) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const region1Ref = useRef<Region | null>(null);
  const region2Ref = useRef<Region | null>(null);
  const [duration, setDuration] = useState(0);
  const [cut1, setCut1] = useState(0); // end of HOOK
  const [cut2, setCut2] = useState(0); // end of BODY
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  const [p1, p2] = useMemo(() => proportionsFromText(text), [text]);

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
      const c1 = d * p1;
      const c2 = d * p2;
      setCut1(c1);
      setCut2(c2);

      // Two regions represent the *boundaries*. We use narrow regions as draggable markers.
      const markerWidth = Math.max(0.05, d * 0.004);
      const r1 = regions.addRegion({
        start: c1 - markerWidth / 2,
        end: c1 + markerWidth / 2,
        color: "rgba(167,139,250,0.85)",
        drag: true,
        resize: false,
        id: "cut1",
      });
      const r2 = regions.addRegion({
        start: c2 - markerWidth / 2,
        end: c2 + markerWidth / 2,
        color: "rgba(34,211,238,0.85)",
        drag: true,
        resize: false,
        id: "cut2",
      });
      region1Ref.current = r1;
      region2Ref.current = r2;

      r1.on("update-end", () => {
        const mid = (r1.start + r1.end) / 2;
        setCut1(mid);
      });
      r2.on("update-end", () => {
        const mid = (r2.start + r2.end) / 2;
        setCut2(mid);
      });
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      region1Ref.current = null;
      region2Ref.current = null;
    };
  }, [open, sourceUrl, p1, p2]);

  // Ensure cut1 <= cut2 on change (swap if user drags past)
  const [lowCut, highCut] = cut1 <= cut2 ? [cut1, cut2] : [cut2, cut1];

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const ranges = [
        { startSec: 0, endSec: lowCut },
        { startSec: lowCut, endSec: highCut },
        { startSec: highCut, endSec: duration },
      ];
      const blobs = await sliceWav(sourceBlob, ranges);
      await onSave([
        { type: "HOOK", blob: blobs[0] },
        { type: "BODY", blob: blobs[1] },
        { type: "CTA", blob: blobs[2] },
      ]);
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
    const stopAt = end;
    const check = () => {
      if (!wsRef.current) return;
      if (wsRef.current.getCurrentTime() >= stopAt) {
        wsRef.current.pause();
      } else if (wsRef.current.isPlaying()) {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }

  if (!open) return null;

  const fmt = (s: number) => {
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
            Split into 3 files
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
          Drag the purple and cyan markers to set the HOOK/BODY and BODY/CTA boundaries. Initial positions
          come from <code className="opacity-80">[HOOK]/[BODY]/[CTA]</code> tags in your script.
        </p>

        <div
          ref={containerRef}
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
        />

        {/* Segment controls */}
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { label: "HOOK", color: "var(--accent)", start: 0, end: lowCut },
              { label: "BODY", color: "var(--accent-secondary)", start: lowCut, end: highCut },
              { label: "CTA", color: "var(--female-accent)", start: highCut, end: duration },
            ] as const
          ).map((seg) => (
            <div
              key={seg.label}
              className="rounded-lg p-2.5 space-y-1.5"
              style={{
                background: "var(--bg-surface)",
                border: `1px solid color-mix(in srgb, ${seg.color} 30%, transparent)`,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.15em]"
                  style={{ fontFamily: "var(--font-mono)", color: seg.color }}
                >
                  {seg.label}
                </span>
                <span
                  className="text-[10px] tabular-nums"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                >
                  {fmt(seg.end - seg.start)}
                </span>
              </div>
              <button
                onClick={() => playSegment(seg.start, seg.end)}
                className="w-full py-1 rounded text-[10px] font-medium"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                ▶ Preview
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => (isPlaying ? wsRef.current?.pause() : wsRef.current?.play())}
            className="px-3 py-2 rounded-lg text-[11px] font-medium"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            {isPlaying ? "Pause" : "Play full"}
          </button>
          <div className="flex gap-2">
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
              disabled={saving || duration === 0}
              className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{
                fontFamily: "var(--font-mono)",
                background: saving || duration === 0 ? "var(--bg-surface)" : "var(--accent)",
                color: saving || duration === 0 ? "var(--text-muted)" : "var(--bg-primary)",
                cursor: saving || duration === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save as 3 files"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
