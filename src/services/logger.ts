type LogLevel = "debug" | "info" | "warn" | "error";
type LogDetails = Record<string, unknown>;

const APP_PREFIX = "OpenIPTV";
const SENSITIVE_KEYS = new Set([
	"authorization",
	"cookie",
	"password",
	"passwd",
	"pwd",
	"token",
	"username"
]);

function redactUrl(raw: string): string {
	try {
		const url = new URL(raw);

		for (const key of Array.from(url.searchParams.keys())) {
			if (SENSITIVE_KEYS.has(key.toLowerCase())) {
				url.searchParams.set(key, "[redacted]");
			}
		}

		url.pathname = url.pathname.replace(
			/\/(live|movie|series)\/([^/]+)\/([^/]+)\//i,
			"/$1/[redacted]/[redacted]/"
		);

		return url.toString();
	} catch {
		return raw;
	}
}

function redactString(value: string): string {
	return value.replace(/https?:\/\/[^\s"'<>]+/g, (match) => redactUrl(match));
}

function serializeError(error: Error): LogDetails {
	return {
		name: error.name,
		message: redactString(error.message),
		stack: error.stack ? redactString(error.stack) : undefined
	};
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value instanceof Error) {
		return serializeError(value);
	}

	if (typeof value === "string") {
		return redactString(value);
	}

	if (!value || typeof value !== "object") {
		return value;
	}

	if (seen.has(value)) {
		return "[Circular]";
	}

	seen.add(value);

	if (Array.isArray(value)) {
		return value.map((item) => sanitize(item, seen));
	}

	const result: LogDetails = {};
	for (const [key, item] of Object.entries(value)) {
		result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
			? "[redacted]"
			: sanitize(item, seen);
	}

	return result;
}

function writeLog(level: LogLevel, scope: string, message: string, details?: LogDetails, error?: unknown): void {
	const time = new Date().toISOString();
	const prefix = `[${APP_PREFIX}][${time}][${level.toUpperCase()}][${scope}]`;
	const payload: LogDetails = {};

	if (details && Object.keys(details).length > 0) {
		payload.details = sanitize(details);
	}

	if (error !== undefined) {
		payload.error = sanitize(error);
	}

	const line = `${prefix} ${message}`;
	const hasPayload = Object.keys(payload).length > 0;

	if (level === "error") {
		hasPayload ? console.error(line, payload) : console.error(line);
		return;
	}

	if (level === "warn") {
		hasPayload ? console.warn(line, payload) : console.warn(line);
		return;
	}

	hasPayload ? console.log(line, payload) : console.log(line);
}

export function createLogger(scope: string) {
	return {
		debug: (message: string, details?: LogDetails) => writeLog("debug", scope, message, details),
		info: (message: string, details?: LogDetails) => writeLog("info", scope, message, details),
		warn: (message: string, details?: LogDetails) => writeLog("warn", scope, message, details),
		error: (message: string, details?: LogDetails) => writeLog("error", scope, message, details),
		exception: (message: string, error: unknown, details?: LogDetails) =>
			writeLog("error", scope, message, details, error)
	};
}
