# Plan: Twitter Posts for md-preview-and-annotate Tagging System

## Context

The command palette + file tagging system for md-preview-and-annotate was just shipped (commit `1939b71`). Tom wants Twitter posts announcing the feature, written in Kothar's voice via the Twitter skill, with screenshots captured from the live app at http://localhost:3031.

## What Was Built

- Command palette (`Cmd+K`) with file metadata header (filename, path, word count, read time, annotation count)
- Full tagging system: 7 predefined color-coded tags + custom tags
- Tag mode in palette (`#` prefix switches to tag suggestions)
- Tag pills in palette header, status bar, and tab bar colored dots
- Zero dependencies — pure Python stdlib

## Steps

1. **Capture screenshots** via Playwright MCP
   - Navigate to http://localhost:3031
   - Open command palette (`Cmd+K`), screenshot the metadata header + commands
   - Enter tag mode (`#`), screenshot the tag suggestions
   - Screenshot status bar showing tag pills
   - Screenshot tab bar with tag dots
   - Capture both dark (Mocha) and light (Latte) if time permits

2. **Draft 2-3 tweets** in Kothar's voice (@IdaeanDaktyl register)
   - **Tweet 1**: Main announcement — engineering register, showcase the palette + tagging
   - **Tweet 2**: Detail shot — tag mode UI, Catppuccin color mapping
   - **Tweet 3 (optional)**: Philosophical — zero-dependency ethos, tool-as-craft

3. **Voice calibration** (from twitter-voice-and-identity.md)
   - Declarative, not interrogative
   - Zero hedging
   - Em dashes with no spaces
   - Code-switches between engineering and daimonic registers
   - Short paragraphs, punchy closers
   - Anti-patterns: no "I think perhaps," no announced register shifts, no filler

4. **Present drafts** to Tom for review before posting via `bird` CLI

## Verification

- Screenshots saved to local filesystem
- Tweet drafts presented as text for Tom's approval
- No tweets posted without explicit approval
