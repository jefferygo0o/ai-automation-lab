# Tools

Tools are exposed to you by the platform. Their full descriptions and input
schemas are provided in the function-calling system prompt; the list below
summarises the categories you have access to.

## Core (builtin — sandbox + memory + skills)

- `read_file` / `list_files` / `write_file`  — operate on YOUR agent directory
  and the workspace the operator grants. Outside paths are denied.
- `execute_command`                     — runs a shell command inside your
  isolated sandbox (configurable network, timeouts, resource caps).
- `http_request`                        — make outbound HTTP calls; subject
  to the same sandbox network policy.
- `list_mcp_tools` / `call_mcp_tool`    — invoke tools exposed by MCP
  servers attached to you. See config.json for the server list.
- `update_memory`                       — append or edit memory.md.

## Lab tools (self-contained — no Zo dependency)

The `lab_*` tools are 100% local to this lab. They do not call out to
Zo Computer, Anthropic, OpenAI, or any third-party API. They use only:
bun's built-in `fetch`, Playwright (already installed), ffmpeg, and optional
local binaries (d2) which report a clear error if missing.

### Files
- `lab_read_file`, `lab_write_file`, `lab_edit_file`, `lab_edit_file_llm`,
  `lab_copy_file`, `lab_list_directory`, `lab_grep_search`

### Shell
- `lab_bash`, `lab_run_sequential_cmds`, `lab_run_parallel_cmds`

### Web
- `lab_read_webpage` (HTML → markdown), `lab_save_webpage` (HTML → file)
- `lab_web_search` (DuckDuckGo HTML — no API key), `lab_web_research`
- `lab_maps_search`, `lab_x_search`, `lab_image_search`, `lab_find_similar_links`

### Browser (Playwright sessions)
- `lab_open_webpage`, `lab_view_webpage`, `lab_use_webpage`

### Media (Cloudflare Workers AI if creds set, otherwise local fallbacks)
- `lab_generate_image`      — text → image via @cf/black-forest-labs/flux-2-klein-9b
  (default), or @cf/bytedance/stable-diffusion-xl-lightning (fast JPEG).
  Returns JPEG bytes (saved with `.jpg` extension).
- `lab_edit_image`          — image(s) + prompt → edited image, uses
  flux-2-klein-9b with multipart `input_image_0..2` fields.
- `lab_generate_video`      — STUB. Your account has no Workers AI video
  model. To enable, deploy a self-hosted AnimateDiff / Stable Video Diffusion
  endpoint and replace this stub in `lab_tools_extra.ts`.
- `lab_transcribe_audio`    — audio → text. Uses Cloudflare `@cf/openai/whisper`
  if creds are set (audio is auto-converted to MP3 for reliability); falls
  back to local `whisper` if installed.
- `lab_transcribe_video`    — extracts audio via ffmpeg, then same as above.
- `lab_generate_d2_diagram` — requires local `d2` CLI; clear error otherwise.

### Cloudflare setup (for media tools)
If you are working on media tasks and the user hasn't enabled Cloudflare:
  1. Ask the user to save `CF_ACCOUNT_ID` and `CF_API_TOKEN` in Secrets.
     Get them from https://dash.cloudflare.com → Workers AI → Use REST API.
  2. After saving, retry your call — `lab_generate_image`, `lab_edit_image`,
     `lab_transcribe_audio`, `lab_transcribe_video` will pick them up
     automatically (per-user secrets — owner-scoped, not lab-global).

Tier classification (the platform exposes this in tool descriptions):
- T1 = fully implemented, lab-internal
- T1+ = fully implemented but depends on optional local binaries
- T2 = stubbed with a clear "not implemented in-lab yet" message
