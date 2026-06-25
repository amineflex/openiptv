"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
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
function redactUrl(raw) {
    try {
        const url = new URL(raw);
        for (const key of Array.from(url.searchParams.keys())) {
            if (SENSITIVE_KEYS.has(key.toLowerCase())) {
                url.searchParams.set(key, "[redacted]");
            }
        }
        url.pathname = url.pathname.replace(/\/(live|movie|series)\/([^/]+)\/([^/]+)\//i, "/$1/[redacted]/[redacted]/");
        return url.toString();
    }
    catch {
        return raw;
    }
}
function redactString(value) {
    return value.replace(/https?:\/\/[^\s"'<>]+/g, (match) => redactUrl(match));
}
function serializeError(error) {
    return {
        name: error.name,
        message: redactString(error.message),
        stack: error.stack ? redactString(error.stack) : undefined
    };
}
function sanitize(value, seen = new WeakSet()) {
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
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
            ? "[redacted]"
            : sanitize(item, seen);
    }
    return result;
}
function writeLog(level, scope, message, details, error) {
    const time = new Date().toISOString();
    const prefix = `[${APP_PREFIX}][${time}][${level.toUpperCase()}][${scope}]`;
    const payload = {};
    if (details && Object.keys(details).length > 0) {
        payload.details = sanitize(details);
    }
    if (error !== undefined) {
        payload.error = sanitize(error);
    }
    const line = `${prefix} ${message}`;
    const hasPayload = Object.keys(payload).length > 0;
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (hasPayload) {
        sink(line, payload);
    }
    else {
        sink(line);
    }
}
function createLogger(scope) {
    return {
        debug: (message, details) => writeLog("debug", scope, message, details),
        info: (message, details) => writeLog("info", scope, message, details),
        warn: (message, details) => writeLog("warn", scope, message, details),
        error: (message, details) => writeLog("error", scope, message, details),
        exception: (message, error, details) => writeLog("error", scope, message, details, error)
    };
}
