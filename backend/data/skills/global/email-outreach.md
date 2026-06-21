---
id: email-outreach
name: Email Outreach
description: End-to-end cold outreach: find a lead, validate an email, draft a personalized message, and send via SMTP/HTTP.
inputs:
  - name: lead
    description: lead's name, role, and any context (URL, signals)
    type: object
    required: true
  - name: value_prop
    description: one-sentence value proposition
    type: string
    required: true
---

# Email Outreach

A reusable procedure for running end-to-end cold outreach.

## When to use this skill

Trigger when the user asks for:
- "email this lead", "send cold outreach to X", "reach out about Y"
- A request that involves finding a contact, validating it, and sending a personalized email

## Procedure

1. Resolve the lead's company domain (use `http_request` or research MCP tools).
2. Validate the contact email via the `verify_email` MCP tool or `http_request` to a verification service.
3. Draft a 3-sentence personalized email referencing the lead's role and a specific trigger.
4. Send via the `send_email` tool (SMTP or API) — never call directly without permission; respect any approval gate.
5. Log the outreach to agent memory and surface a structured result back to the user.

## Inputs

- `lead` (required): lead's name, role, and any context (URL, signals).
- `value_prop` (required): one-sentence value proposition.

## Completion criteria

- The recipient's email address is validated.
- A personalized draft is shown to the user (or sent, if approvals allow).
- The outreach is logged to memory with timestamp and outcome.