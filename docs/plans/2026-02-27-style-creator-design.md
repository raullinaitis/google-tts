# Style Creator — Design Document

**Date:** 2026-02-27
**Status:** Implemented

## Overview

A collapsible "Style Creator" section in the left sidebar that uses Gemini Flash (text-only) to generate a TTS style prompt from a plain-English description. Supports iterative refinement via multi-turn conversation history held on the client.

## Architecture

- `POST /api/generate-style` — stateless route, receives `{ description, history }`, returns `{ style: string }`
- Client holds `styleHistory: {role, content}[]`, appends each turn, sends full history on refinement
- Result auto-fills the existing `customStyle` field when user clicks "Use This Style"

## System Prompt Strategy

Gemini is instructed to output only the style string (no markdown, no labels, under 120 words), following Google's TTS director framework collapsed into flowing prose. Geographic specificity for accents, no over-specification.

## UI Placement

Between Style Presets pills and Custom Style input in the left sidebar. Toggle header shows "active" badge when a generated style exists but the panel is collapsed.
