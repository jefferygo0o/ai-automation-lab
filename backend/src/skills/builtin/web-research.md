---
id: web-research
name: Web Research
description: Answer a research question by collecting, cross-checking, and synthesizing multiple sources.
inputs:
  - name: question
    description: the research question
steps:
  - "Decompose the question into 3-5 sub-questions"
  - "Use http_request and search MCP tools to fetch sources for each sub-question"
  - "Cross-check key claims across at least two independent sources"
  - "Write a short report with citations; save as a markdown file in the sandbox"
  - "Return a concise summary to the user with the file path"
---
