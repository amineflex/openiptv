import { spawn } from "child_process";

const electron = spawn("electron", ["."], {
	stdio: "inherit",
	shell: process.platform === "win32"
});

electron.on("exit", () => process.exit(0));
