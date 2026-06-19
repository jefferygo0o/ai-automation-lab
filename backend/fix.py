import sys
p = 'src/agents/runtime.ts'
s = open(p).read()
old = '  // Add MCP tools (if any servers configured for this agent)\n  const agentMcpServers\n  console.log("[runtime] ENTERED try"); = McpStore.list().filter((s) => s.enabled);'
new = '  // Add MCP tools (if any servers configured for this agent)\n  console.log("[runtime] ENTERED try");\n  const agentMcpServers = McpStore.list().filter((s) => s.enabled);'
assert old in s, "not found"
s = s.replace(old, new)
open(p, 'w').write(s)
print("ok")
