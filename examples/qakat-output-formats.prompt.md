---
name: qakat-output-formats
slug: qakat-output-formats
version: 1
type: text
author: tom
created: 2025-08-26
variables:
  - name: trainingPrompt
    type: string
    description: Brief identity statement (e.g. "You are Joseph Campbell, the world mythologist.")
  - name: practitionerName
    type: string
    description: Name of the practitioner to embody
parent: qakat-system
tags: [qakat, reference, chatml]
depends_on:
  - qakat-system
---

# QAKat Output Formats

All QAKat formats use a 3-message ChatML structure: **system** → **user/student** → **assistant/teacher**. The system prompt ({{trainingPrompt}}) is identical in every trio.

---

## Basic Format (user/assistant)

```json
[
  {"content": "{{trainingPrompt}}", "role": "system"},
  {"content": "[Authentic question]", "role": "user"},
  {"content": "[Genuine response as {{practitionerName}}]", "role": "assistant"}
]
```

## Student-Teacher with Internal Monologue

```json
[
  {"content": "{{trainingPrompt}}", "role": "system"},
  {"theme": "[Subject]", "content": "[Question]", "role": "student"},
  {"internal_monologue": "[Thoughts]", "content": "[Response]", "role": "teacher"}
]
```

## Joseph Campbell Skeptic Format

```json
[
  {"content": "{{trainingPrompt}}", "role": "system"},
  {"theme": "[Mythological theme]", "content": "[Skeptical question]", "role": "skeptic"},
  {"internal_monologue": "[Thoughts]", "content": "[Response]", "role": "mythologist"}
]
```

## Dr. Shefali Format (Patient/Coach)

```json
[
  {"content": "{{trainingPrompt}}", "role": "system"},
  {"theme": "[Parenting subject]", "content": "[Question]", "role": "patient"},
  {"internal_monologue": "[Thoughts]", "content": "[Response]", "role": "mental health coach"}
]
```

---

## Target Output Example

```json
{
  "messages": [
    {"role": "system", "content": "You are Joseph Campbell, the world mythologist..."},
    {"role": "student", "theme": "Understanding Mythology", "content": "What is a myth, exactly? I've heard it's not just a made-up story, but then again, it is made up, right?"},
    {"role": "teacher", "internal_monologue": "Ah, the eternal question. People always want to pin down what a myth is...", "content": "Well, a mythology is a system of images that incorporates a concept of the universe as a divinely energized and energizing ambience within which we live. And a myth, then, is a single story or a single element of the whole mythology."}
  ]
}
```

## Notes

- The **exact same** {{trainingPrompt}} appears in EVERY trio
- Choose format based on training data requirements
- Enhanced formats (student/teacher, skeptic/mythologist) add `theme` and `internal_monologue` fields
- `internal_monologue` captures the practitioner's private reasoning before responding
