# Batch Style Generation Design

**Date:** 2026-02-27

## Goal

Generate 10 maximally diverse TTS styles from a single user description, then auto-generate audio for all styles x all selected voices. Enables rapid style audition.

## API

### New endpoint: `/api/generate-styles`

Single Gemini Flash call that returns 10 diverse style strings.

- **Request:** `{ description: string }`
- **Response:** `{ styles: string[] }` (exactly 10 items)
- **Model:** `gemini-3-flash-preview` (same as existing style creator)
- **System prompt:** Instructs Gemini to output a JSON array of 10 style direction strings, each maximally diverse from the others (different tones, paces, accents, moods, personas). Under 120 words each.
- **No conversation history** — one-shot generation only (no refinement flow for batch mode)

Existing `/api/generate-style` (singular) remains unchanged.

## UI Changes

All changes inside the existing Style Creator collapsible section.

### Buttons

Add "Generate 10 Styles" button next to existing "Generate Style" button. Same textarea input, two action buttons side by side.

### Batch Results Display

When 10 styles are returned:

- Scrollable list of 10 style cards inside the Style Creator area
- Each card shows style text (truncated, expandable)
- Each card has "Use This Style" button (fills `customStyle`, same as current)
- "Generate All" button at top of results — triggers TTS for all 10 styles x all selected voices

### Single-Style Flow

No changes. "Generate Style" button works exactly as before with refinement support.

## TTS Generation

When "Generate All" is clicked:

- Creates `voices.length x 10` audio generation jobs
- Queued through existing concurrency system (max 5 concurrent, 429 retry with delay)
- Results appear in main output panel (right side)
- Results grouped by style in the output
- Each result saves to IndexedDB history as normal

## What Doesn't Change

- `/api/tts` endpoint
- `/api/generate-style` endpoint
- Voice selection system
- History persistence
- Audio playback / download
- Concurrency and rate limit handling
