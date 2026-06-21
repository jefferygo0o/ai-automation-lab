// ==========================================
// Calculator Tool
// Performs basic arithmetic operations.
// Risk Level: LOW
// ==========================================

import { registerTool } from "./types";

registerTool({
  name: "calculator",
  description: "Perform mathematical calculations. Supports addition, subtraction, multiplication, division, and exponents.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression to evaluate (e.g., '2 + 2', '15 * 3', '2^10')",
      },
    },
    required: ["expression"],
  },

  async execute(input: any) {
    try {
      const expression = input.expression.trim();
      const sanitized = expression.replace(/\s/g, "");

      if (!/^[\d+\-*/().^% ,]+$/.test(sanitized)) {
        return {
          success: false,
          error: "Expression contains invalid characters. Only numbers and operators (+, -, *, /, ^, %, parentheses) are allowed.",
        };
      }

      const evaluable = sanitized.replace(/\^/g, "**");
      const result = new Function(`return (${evaluable})`)();

      if (typeof result !== "number" || !isFinite(result)) {
        return { success: false, error: "Invalid calculation result" };
      }

      return {
        success: true,
        data: {
          expression: input.expression,
          result,
          formatted: Number.isInteger(result) ? result.toString() : result.toFixed(4),
        },
      };
    } catch (error: any) {
      return { success: false, error: `Calculation error: ${error.message}` };
    }
  },
});
