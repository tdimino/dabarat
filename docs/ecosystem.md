# The ~/.claude/ Ecosystem

This document describes the directory structure and conventions that Claude Code uses for persistent configuration, memory, and tool integration. The bookmark index produced by `Dabarat` is one component of this larger system.

## The `~/.claude/` Directory

Claude Code maintains a global configuration directory at `~/.claude/`. This is not just a dotfile—it's a structured workspace that persists across sessions, projects, and machines.

```
~/.claude/
├── CLAUDE.md              # Global instructions (always loaded into every session)
├── settings.json          # Tool permissions, MCP servers, hooks
├── projects/              # Per-project memory and session transcripts
│   └── {project-hash}/
│       └── memory/
│           └── MEMORY.md  # Auto-maintained notes per project
├── plans/                 # Implementation plans (persisted across sessions)
│   └── {project}-{date}-{topic}.md
├── handoffs/              # Session continuity (crash recovery, context handoff)
│   ├── INDEX.md
│   └── {session_id}.yaml
├── hooks/                 # Shell commands triggered by tool events
├── commands/              # Custom slash commands
├── skills/                # Reusable skill definitions
├── agents/                # Custom agent definitions
├── agent_docs/            # Reference documentation (loaded on demand)
├── userModels/            # User personality models and social dossiers
│   └── tomModel.md
├── bookmarks/             # ← Global bookmark index (from Dabarat)
│   ├── INDEX.md           #   Most-recent-first list of all bookmarks
│   └── snippets/          #   Individual bookmark files
│       └── 2026-02-15-some-passage.md
└── teams/                 # Multi-agent team configurations
```

## CLAUDE.md

The `CLAUDE.md` file at `~/.claude/CLAUDE.md` is loaded into every Claude Code session. It contains:

- **Identity and principles** — who the user is, how they think, what they value
- **Tool references** — which tools are available and how to invoke them
- **Interaction rules** — when to ask vs. act, commit conventions, formatting
- **Project registry** — active projects with paths, plans, and session history
- **On-demand references** — files to read only when relevant

Project-level `CLAUDE.md` files (in repo roots) add project-specific instructions that override or supplement the global ones.

## soul.md

In the Open Souls paradigm, a `soul.md` file defines the personality, knowledge, and behavioral constraints of an AI entity. It is loaded into the "core" memory region at initialization and shapes all subsequent interactions.

The `soul.md` pattern exists in:
- AI soul directories (e.g., `~/souls/kothar/soul.md`)
- Website souls (e.g., a portfolio site's `soul/soul.md`)

## Where Bookmarks Fit

When you create a **bookmark** annotation in `Dabarat`, it persists in two places:

1. **Locally** — in the sidecar `file.md.annotations.json` alongside the document
2. **Globally** — in `~/.claude/bookmarks/`

The global bookmark index (`INDEX.md`) serves as a cross-project knowledge base. Snippets bookmarked from any document—research papers, legal correspondence, technical specs—accumulate in one searchable location.

Each snippet file contains:
- The bookmarked text
- Source file path
- Author and timestamp
- Section heading (if available)
- User's note/comment

This makes `~/.claude/bookmarks/` a form of **persistent, cross-project memory**—Claude Code can read the index to recall what you've flagged as important across all your work.

## Design Philosophy

The `~/.claude/` directory is itself a git repository. Notable changes are committed periodically, giving version history to your configuration, memory, and bookmarks.

This structure reflects a principle: **the periphery preserves what the center forgets**. Session context windows are ephemeral, but the file system persists. By writing decisions, bookmarks, plans, and handoffs to disk, Claude Code maintains continuity across sessions that would otherwise be lost to context window limits.
