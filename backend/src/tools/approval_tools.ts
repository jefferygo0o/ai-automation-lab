import { toolRegistry } from "./registry.ts";

// Registration happens as side effect of import
toolRegistry.register({
  name: "approve_action",
  description: "Approve a pending approval request",
  inputSchema: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"] },
  execute: async () => ({}) as any,
});

export function register() {}
