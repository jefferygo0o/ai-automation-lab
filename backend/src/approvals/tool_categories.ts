/**
 * Tool category mapping for always-allow approval gating.
 *
 * Mirrors the frontend's toolMeta.ts ToolKind classification so the backend
 * can determine which "action type" (Read, Write, Command, etc.) a tool
 * belongs to when the user chooses "Always Allow" for that category.
 *
 * When a tool is not listed here, it gets no category, meaning "Always Allow"
 * will not apply and the tool will always require approval (if its permission
 * is "ask").
 */

export type ActionCategory =
  | "read"
  | "write"
  | "edit"
  | "delete"
  | "list"
  | "exec"
  | "http"
  | "mcp"
  | "mcp-list"
  | "memory"
  | "agent"
  | "image"
  | "video"
  | "audio"
  | "generic";

const TOOL_CATEGORIES: Record<string, ActionCategory> = {
  // Core tools
  read_file: "read",
  write_file: "write",
  list_files: "list",
  execute_command: "exec",
  http_request: "http",
  edit_file: "edit",
  call_mcp_tool: "mcp",
  list_mcp_tools: "mcp-list",
  update_memory: "memory",
  read_memory: "memory",
  delete_memory: "delete",

  // Agent config
  update_agent_file: "agent",

  // Lab tools
  lab_read_file: "read",
  lab_write_file: "write",
  lab_edit_file: "edit",
  lab_edit_file_llm: "edit",
  lab_copy_file: "write",
  lab_list_directory: "list",
  lab_grep_search: "list",
  lab_bash: "exec",
  lab_run_sequential_cmds: "exec",
  lab_run_parallel_cmds: "exec",
  lab_generate_image: "image",
  lab_edit_image: "image",
  lab_generate_video: "video",
  lab_transcribe_audio: "audio",
  lab_transcribe_video: "video",
  lab_read_webpage: "read",
  lab_save_webpage: "write",
  lab_web_search: "list",
  lab_web_research: "list",
  lab_maps_search: "list",
  lab_x_search: "list",
  lab_image_search: "list",
  lab_find_similar_links: "list",
  lab_open_webpage: "http",
  lab_view_webpage: "http",
  lab_use_webpage: "http",
  lab_generate_d2_diagram: "image",
  lab_check_dependencies: "list",
  lab_install_dependency: "exec",

  // Skill tools
  list_skills: "list",
  read_skill: "read",
  run_skill: "generic",

  // Plan / approval
  propose_plan: "generic",
  wait_for_approval: "generic",

  // Lab management
  manage_skills: "generic",
  manage_automations: "generic",
  manage_mcp_servers: "mcp",
  browser_navigate: "http",
  browser_screenshot: "image",
  web_search: "list",

  // Webspace
  manage_webspace: "generic",
  fetch_webspace_route: "http",

  // Integration tools
  list_integrations: "list",
  use_integration: "mcp",
  get_integration_actions: "mcp-list",
  manage_integrations: "mcp",
};

/**
 * Get the action category for a given tool name.
 * Returns null if the tool has no known category (e.g. unknown tools).
 */
export function getToolCategory(toolName: string): ActionCategory | null {
  return TOOL_CATEGORIES[toolName] ?? null;
}

/**
 * Human-readable label for an action category.
 */
export function categoryLabel(category: ActionCategory): string {
  const labels: Record<ActionCategory, string> = {
    read: "Read",
    write: "Write",
    edit: "Edit",
    delete: "Delete",
    list: "List",
    exec: "Command",
    http: "HTTP Request",
    mcp: "MCP Tool",
    "mcp-list": "MCP List",
    memory: "Memory",
    agent: "Agent Config",
    image: "Image",
    video: "Video",
    audio: "Audio",
    generic: "Generic",
  };
  return labels[category] ?? category;
}

/**
 * Get all available action categories with their labels.
 */
export function allCategories(): { category: ActionCategory; label: string }[] {
  const seen = new Set<ActionCategory>();
  const result: { category: ActionCategory; label: string }[] = [];
  for (const cat of Object.values(TOOL_CATEGORIES)) {
    if (!seen.has(cat)) {
      seen.add(cat);
      result.push({ category: cat, label: categoryLabel(cat) });
    }
  }
  return result.sort((a, b) => a.label.localeCompare(b.label));
}
