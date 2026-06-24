// Simulate vault.ts path resolution from src/secrets/
// vault.ts is at src/secrets/vault.ts
import { join } from "path";

const simulatedVaultDir = "/home/workspace/Projects/ai-automation-lab/backend/src/secrets";
const keyPath = join(simulatedVaultDir, "..", "..", "data", "master.key");
console.log("vault.ts at src/secrets/vault.ts -> resolved KEY_PATH:", keyPath);
console.log("key exists:", require("fs").existsSync(keyPath));

// Now test src/secrets/vault.ts directly
import { decryptSecret } from "../src/secrets/vault.ts";

const enc = {
  ciphertext: "ojmiFQfQWKOMTh2lwTxMk5labKZeEjZe6TMBig7ly8JGcNsxUjO9eZOeagdXZn64pnE8Uelqo+rt4x02OC4pr4Ov5A==",
  iv: "zrr7iK7pzyx2jW7d",
  authTag: "mILyL8X5tkyMVodBctguWA=="
};

try {
  const key = decryptSecret(enc);
  console.log("DECRYPTED KEY:", key.slice(0, 10) + "...");
} catch (e: any) {
  console.error("decrypt error:", e);
}
