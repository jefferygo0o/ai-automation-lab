---
id: email-outreach
name: Email Outreach
description: End-to-end cold outreach: find a lead, validate an email, draft a personalized message, and send via SMTP/HTTP.
inputs:
  - name: lead
    description: lead's name, role, and any context (URL, signals)
  - name: value_prop
    description: one-sentence value proposition
steps:
  - "Resolve the lead's company domain (use http_request or research)"
  - "Validate the contact email via the verify_email MCP tool or http_request to a verification service"
  - "Draft a 3-sentence personalized email referencing the lead's role and a specific trigger"
  - "Send via send_email tool (SMTP or API) — never call directly without permission"
  - "Log the outreach to agent memory and surface a structured result"
---
