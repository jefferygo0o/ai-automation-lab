import { join } from "path";
console.log("import.meta.dir:", import.meta.dir);
const keyPath = join(import.meta.dir, "..", "..", "data", "master.key");
console.log("resolved KEY_PATH:", keyPath);

import fs from "fs";
console.log("key file exists:", fs.existsSync(keyPath));
