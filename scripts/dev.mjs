import { spawn } from "child_process";
import { createServer } from "vite";

const server = await createServer();
await server.listen();

const port = server.config.server.port ?? 5173;
const url = `http://127.0.0.1:${port}`;

server.printUrls();

const tsc = spawn("npx", ["tsc", "-p", "tsconfig.electron.json"], {
	stdio: "inherit",
	shell: process.platform === "win32"
});

await new Promise((resolve, reject) => {
	tsc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tsc exited with ${code}`))));
});

const electron = spawn("electron", ["."], {
	stdio: "inherit",
	shell: process.platform === "win32",
	env: { ...process.env, VITE_DEV_SERVER_URL: url }
});

electron.on("exit", () => {
	void server.close();
	process.exit(0);
});
