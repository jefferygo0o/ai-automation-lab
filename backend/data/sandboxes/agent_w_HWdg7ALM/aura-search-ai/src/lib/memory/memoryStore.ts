// ==========================================
// Local Memory Store
// Simple JSON-file based memory for conversations and preferences.
// Falls back to in-memory storage if file writes fail.
// ==========================================

import { MemoryEntry } from "@/lib/types";
import { config } from "@/lib/utils/env";
import fs from "fs";
import path from "path";

class MemoryStore {
  private entries: MemoryEntry[] = [];
  private filePath: string;
  private loaded = false;

  constructor() {
    this.filePath = path.join(process.cwd(), "data", "memory.json");
  }

  private ensureLoaded() {
    if (this.loaded) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, "utf-8");
        this.entries = JSON.parse(data);
      }
    } catch {
      // Start with empty memory
      this.entries = [];
    }
    this.loaded = true;
  }

  private save() {
    if (!config.memoryEnabled) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      console.error("Failed to save memory:", error);
    }
  }

  /**
   * Add an entry to memory.
   */
  add(entry: Omit<MemoryEntry, "id" | "timestamp">): void {
    if (!config.memoryEnabled) return;
    this.ensureLoaded();

    const newEntry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      timestamp: Date.now(),
    };

    this.entries.push(newEntry);

    // Keep max 200 entries
    if (this.entries.length > 200) {
      this.entries = this.entries.slice(-200);
    }

    this.save();
  }

  /**
   * Search memory by key or type.
   */
  search(options: {
    type?: string;
    key?: string;
    limit?: number;
  }): MemoryEntry[] {
    if (!config.memoryEnabled) return [];
    this.ensureLoaded();

    let results = [...this.entries];

    if (options.type) {
      results = results.filter((e) => e.type === options.type);
    }
    if (options.key) {
      results = results.filter((e) =>
        e.key.toLowerCase().includes(options.key!.toLowerCase())
      );
    }

    results.sort((a, b) => b.timestamp - a.timestamp);
    return results.slice(0, options.limit || 20);
  }

  /**
   * Get recent conversation history.
   */
  getRecentConversations(limit: number = 10): MemoryEntry[] {
    return this.search({ type: "conversation", limit });
  }

  /**
   * Remember a user preference.
   */
  rememberPreference(key: string, value: string): void {
    this.add({
      type: "preference",
      key,
      value,
    });
  }

  /**
   * Get a saved preference.
   */
  getPreference(key: string): string | null {
    const results = this.search({ type: "preference", key, limit: 1 });
    return results.length > 0 ? results[0].value : null;
  }

  /**
   * Clear all memory.
   */
  clear(): void {
    this.entries = [];
    this.save();
  }
}

// Singleton
export const memoryStore = new MemoryStore();
