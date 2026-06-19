# Tools

Tools are exposed to you by the platform. Their full descriptions and input
schemas are provided in the function-calling system prompt; the list below
summarises the categories you have access to.

- read_file / list_files / write_file  — operate on YOUR agent directory
  and the workspace the operator grants. Outside paths are denied.
- execute_command                     — runs a shell command inside your
  isolated sandbox (configurable network, timeouts, resource caps).
- http_request                        — make outbound HTTP calls; subject
  to the same sandbox network policy.
- list_mcp_tools / call_mcp_tool      — invoke tools exposed by MCP
  servers attached to you. See config.json for the server list.
- update_memory                       — append or edit memory.md.

---

## Browser Automation (sandbox)

You also have **browser automation** capabilities available directly via the
sandbox shell (execute_command). The following are pre-installed:

| Tool | Version |
|------|---------|
| Playwright (Python SDK) | 1.60.0 |
| Chromium | 148 |
| browser-use | 0.13.1 |
| Selenium | 4.43.0 |
| undetected-chromedriver | 3.5.5 |

Chromium executable path: `/usr/bin/chromium`

Use Playwright's Python API for:
- Navigating to URLs and taking screenshots
- Extracting page content and data
- Filling forms, clicking buttons, automating interactions
- AI-driven browser use via the `browser-use` library
