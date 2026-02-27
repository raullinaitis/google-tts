# TTS Generation History — Design

## Goal

Persist all generated TTS audio so the user can browse, replay, and manage a full history of past generations. Single-user, local-only.

## Storage: IndexedDB

- Database: `tts-history`
- Object store: `generations`, keyPath: `id`
- No external dependencies

### Data Model

```ts
type HistoryEntry = {
  id: string;            // unique key (voice-timestamp)
  voice: string;
  model: string;
  modelLabel: string;
  stylePreset: string;
  styleLabel: string;
  customStyle: string;
  text: string;          // full text that was spoken
  audioBlob: Blob;       // WAV audio blob
  createdAt: string;     // ISO timestamp
};
```

## Storage Layer — `lib/history.ts`

Simple async functions wrapping IndexedDB:
- `saveGeneration(entry: HistoryEntry)` — put into store
- `getAllGenerations(): HistoryEntry[]` — return all, sorted newest-first by createdAt
- `deleteGeneration(id: string)` — remove one
- `clearHistory()` — wipe all entries

## UI Changes — `app/page.tsx`

1. **Auto-save on generation**: each successful result is saved to IndexedDB immediately when it finishes
2. **History section** below current "Generated Audio" results:
   - Reverse-chronological list of all past generations
   - Each entry shows: voice tag, model tag, style tag, text (truncated ~80 chars), relative timestamp
   - Audio player + download button per entry
   - Delete button (x) per entry
   - "Clear All History" button at section top
3. **On page load**: load history from IndexedDB
4. **Blob URL management**: create URLs on render, revoke when component unmounts

## What stays the same

- Current generation flow (select voices, type text, generate)
- Current results section (shows loading/error states)
- New generations appear in current results AND get appended to history
