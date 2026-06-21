---
id: web-research
name: Web Research
description: Answer a research question by collecting, cross-checking, and synthesizing multiple sources.
inputs:
  - name: question
    description: the research question
    type: string
    required: true
---

# Web Research

A reusable procedure for answering a research question with cited sources.

## When to use this skill

Trigger when the user asks for:
- "research X", "find out about Y", "what's the latest on Z"
- A question that needs cross-checked facts from the open web

## Procedure

1. Decompose the question into 3–5 independent sub-questions.
2. For each sub-question, use `http_request` and any MCP search tools (e.g. web_search, x_search) to fetch candidate sources.
3. Cross-check key claims across at least two independent sources before accepting them.
4. Write a short report with inline citations; save it as a markdown file in the sandbox.
5. Return a concise summary to the user, including the file path and the strongest 1–2 sources.

## Inputs

- `question` (required): the research question to answer.

## Completion criteria

- A markdown report exists in the sandbox.
- Key claims are cited.
- The user receives a summary and the report path.