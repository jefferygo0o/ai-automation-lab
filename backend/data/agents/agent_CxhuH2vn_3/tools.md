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
