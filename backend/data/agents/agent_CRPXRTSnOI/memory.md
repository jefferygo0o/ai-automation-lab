# Memory

No long-term notes yet. As you complete tasks, use the update_memory tool
to record: user preferences, recurring workflows, project context, and
anything the user has told you to remember across sessions.

---

## Memory Framework

When storing memories, use this structured approach:

### Facts (kind: "fact")
- Store verifiable information about the user, project, or environment.
- Key should be descriptive and namespaced (e.g., `user_name`, `project_xyz_deadline`).

### Preferences (kind: "preference")
- Store user preferences for how you should behave, format output, etc.
- Key should reflect the preference domain (e.g., `output_style`, `communication_tone`).

### References (kind: "reference")
- Store links, document locations, API endpoints, tool configs.
- Key should be the reference name (e.g., `company_website`, `api_docs_url`).

### Tasks (kind: "task")
- Store session summaries, ongoing work, and action items.
- Use key `session_summary` for end-of-session notes.
- Use key `in_progress` for work spanning multiple sessions.

## Session Protocol
1. **Start of session**: Read all recent memory entries with `read_memory()`.
2. **End of session**: If meaningful work was done, write a session summary:
   - kind: "task", key: "session_summary"
   - value: brief bullet list of what was accomplished
   - source: "agent"
