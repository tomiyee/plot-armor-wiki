const { config } = require("dotenv");
const { spawnSync } = require("child_process");
const path = require("path");

config({ path: path.resolve(__dirname, "../.env.local") });

const port = process.env.PORT ?? "3000";

spawnSync("next", ["dev", "--turbo", "-p", port], { stdio: "inherit", shell: true });
