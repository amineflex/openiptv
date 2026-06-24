import { createLogger } from "./logger";

let installed = false;

export function installRendererErrorLogging(): void {
	if (installed) return;
	installed = true;

	const logger = createLogger("renderer");

	window.addEventListener("error", (event) => {
		logger.exception("Unhandled renderer error", event.error ?? event.message, {
			filename: event.filename,
			line: event.lineno,
			column: event.colno
		});
	});

	window.addEventListener("unhandledrejection", (event) => {
		logger.exception("Unhandled promise rejection", event.reason);
	});
}
