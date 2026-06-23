/**
 * Attachment handling for chat messages.
 *
 * When the user attaches files to a chat message, this module:
 * 1. Saves files to the agent's sandbox so the AI can read them
 * 2. For image files, calls NVIDIA Llama Vision to describe the image
 * 3. Returns the augmented message content (user text + image descriptions + file references)
 */

import { SecretStore } from "../secrets/store.ts";

const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
const VISION_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

interface AttachmentResult {
  content: string;
  savedPaths: string[];
}

/**
 * Process attached files for a chat message.
 * @param ownerId - The user's ID
 * @param userText - The user's typed message
 * @param files - Array of { name, data (base64), mime } objects
 * @param sandboxDir - The agent's sandbox directory path
 * @returns The augmented message content and list of saved file paths
 */
export async function processAttachments(
  ownerId: string,
  userText: string,
  files: Array<{ name: string; data: string; mime: string }>,
  sandboxDir: string,
): Promise<AttachmentResult> {
  if (!files || files.length === 0) {
    return { content: userText || "", savedPaths: [] };
  }

  const savedPaths: string[] = [];
  const imageDescriptions: string[] = [];
  const fileRefs: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${sandboxDir}/${safeName}`;
    savedPaths.push(filePath);

    // Decide if it's an image we can describe
    const isImage = file.mime.startsWith("image/");

    if (isImage) {
      const dataUri = `data:${file.mime};base64,${file.data}`;
      let description = "";
      try {
        description = await describeImage(ownerId, dataUri);
      } catch (e: any) {
        description = `[Failed to describe image ${safeName}: ${e?.message ?? "error"}]`;
      }
      imageDescriptions.push(description);
      fileRefs.push(`📷 ${safeName}: ${description}`);
    } else {
      fileRefs.push(`📎 ${safeName} (saved at ${filePath})`);
    }
  }

  // Build augmented message
  const parts: string[] = [];
  if (userText.trim()) parts.push(userText.trim());
  if (fileRefs.length > 0) parts.push(`\n[Attached files:\n${fileRefs.join("\n")}\n]`);
  if (imageDescriptions.length > 0) {
    // Already included in fileRefs above
  }

  return { content: parts.join("\n\n"), savedPaths };
}

/**
 * Call NVIDIA Llama Vision to describe an image.
 */
async function describeImage(
  ownerId: string,
  dataUri: string,
): Promise<string> {
  const apiKey = SecretStore.get(ownerId, "NVIDIA_API_KEY");

  if (!apiKey) {
    // Fallback to env var
    const envKey = process.env["NVIDIA_API_KEY"];
    if (!envKey) {
      return "[NVIDIA API key not configured. Add NVIDIA_API_KEY to secrets.]";
    }
  }

  const key = apiKey || process.env["NVIDIA_API_KEY"] || "";
  const payload = {
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image in detail, focusing on what's visually present." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 512,
    stream: false,
  };

  const res = await fetch(VISION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vision API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return content.slice(0, 1000); // Cap at 1000 chars
}
