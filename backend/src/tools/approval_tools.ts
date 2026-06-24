import { toolRegistry } from "./registry.ts";

// Registration happens as side effect of import
toolRegistry.register({
  name: "approve_action",
  description: "Approve a pending approval request",
  parameters: {
    requestId: {
      type: "string",
      description: "The ID of the approval request to approve",
      required: true,
    },
  },
  defaultPermission: "ask",
  execute: async () => ({}) as any,
});

export function register() {}
