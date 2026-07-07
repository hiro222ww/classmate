import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "ios/App/App/capacitor.config.json");
const extraPlugin = "ClassmateOAuthPlugin";

const config = JSON.parse(readFileSync(configPath, "utf8"));
const list = Array.isArray(config.packageClassList) ? config.packageClassList : [];

if (!list.includes(extraPlugin)) {
  config.packageClassList = [...list, extraPlugin];
  writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
  console.log(`[cap:sync] added ${extraPlugin} to packageClassList`);
}
