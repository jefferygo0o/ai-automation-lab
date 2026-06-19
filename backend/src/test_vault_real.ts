import { join } from "path";
import { existsSync, readFileSync } from "fs";

// This is exactly the code from vault.ts
console.log("import.meta.dir:", import.meta.dir);
const KEY_FILE = join(import.meta.dir, "..", "..", "data", "master.key");
console.log("KEY_FILE:", KEY_FILE);
console.log("exists:", existsSync(KEY_FILE));

if (existsSync(KEY_FILE)) {
  const data = readFileSync(KEY_FILE, "utf8").trim();
  console.log("key content:", data);
  console.log("key bytes:", Buffer.from(data, "base64").length);
}
