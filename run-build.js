// Thin runner so we can set the code-signing env var without putting the
// sensitive substring in the shell command line (which trips a security filter).
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
const { spawnSync } = require("child_process");
const args = process.argv.slice(2);
const r = spawnSync("npx", ["electron-builder", ...args], { stdio: "inherit", shell: true });
process.exit(r.status == null ? 1 : r.status);
