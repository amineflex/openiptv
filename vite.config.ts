import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: "bundle.js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: (info) => {
					if (info.name?.endsWith(".css")) return "bundle.css";
					return "assets/[name]-[hash][extname]";
				}
			}
		}
	},
	server: {
		host: "127.0.0.1",
		port: 5173
	}
});
