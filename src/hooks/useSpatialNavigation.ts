import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Global arrow-key spatial navigation.
 *
 * The app is built almost entirely from native focusable elements (`<a>`,
 * `<button>`, `<input>`, `<select>`), so rather than wrapping every component in
 * a focus library we drive focus straight on the DOM: on each arrow press we
 * look at the focused element's rectangle, find the nearest focusable element in
 * the requested direction, and move native focus there. `Enter`/`Space` are left
 * to the elements themselves (links and buttons already activate on those keys).
 *
 * Disabled on the player route (`/watch`), where the video players own the arrow
 * keys for volume / channel zapping.
 */

type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
	"video[controls]"
].join(",");

// Weight given to cross-axis misalignment: a candidate that lines up with the
// current element on the perpendicular axis is strongly preferred over one that
// is closer but off to the side. Keeps grid/row navigation predictable.
const CROSS_AXIS_WEIGHT = 4;

function keyToDirection(key: string): Direction | null {
	switch (key) {
		case "ArrowUp":
			return "up";
		case "ArrowDown":
			return "down";
		case "ArrowLeft":
			return "left";
		case "ArrowRight":
			return "right";
		default:
			return null;
	}
}

function isEditableTarget(el: EventTarget | null): el is HTMLElement {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	const tag = el.tagName;
	if (tag === "TEXTAREA" || tag === "SELECT") return true;
	if (tag === "INPUT") {
		const type = (el as HTMLInputElement).type;
		// Non-text inputs (button, checkbox…) don't consume arrows.
		return !["button", "submit", "reset", "checkbox", "radio", "file"].includes(type);
	}
	return false;
}

function isVisible(el: Element): boolean {
	const he = el as HTMLElement;
	const rect = he.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return false;

	// Skip anything hidden via `visibility` or `display` — including the floating
	// card actions (edit / delete / remove), which are `invisible` until their
	// card is hovered or focused, then flip to `visible` and become navigable in
	// place. We deliberately do NOT treat opacity:0 as hidden: page-load fade-in
	// wrappers animate opacity from 0 and would otherwise hide the whole screen.
	if (typeof he.checkVisibility === "function") {
		// Property name differs across Chromium versions; pass both spellings.
		const options = { visibilityProperty: true, checkVisibilityCSS: true };
		if (!he.checkVisibility(options)) return false;
	} else {
		const style = getComputedStyle(he);
		if (style.visibility === "hidden" || style.display === "none") return false;
	}

	// Skip anything a dialog/overlay has marked inert or hidden from a11y — this
	// also scopes navigation to an open modal, whose backdrop marks the rest of
	// the page aria-hidden.
	if (he.closest("[inert],[aria-hidden='true']")) return false;
	return true;
}

function getFocusable(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

// Distance between two 1D segments; 0 when they overlap.
function segmentGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
	if (aMax < bMin) return bMin - aMax;
	if (bMax < aMin) return aMin - bMax;
	return 0;
}

function scoreCandidate(current: DOMRect, candidate: DOMRect, dir: Direction): number | null {
	const curX = current.left + current.width / 2;
	const curY = current.top + current.height / 2;
	const candX = candidate.left + candidate.width / 2;
	const candY = candidate.top + candidate.height / 2;

	let primary: number;
	let cross: number;

	switch (dir) {
		case "right":
			primary = candX - curX;
			cross = segmentGap(current.top, current.bottom, candidate.top, candidate.bottom);
			break;
		case "left":
			primary = curX - candX;
			cross = segmentGap(current.top, current.bottom, candidate.top, candidate.bottom);
			break;
		case "down":
			primary = candY - curY;
			cross = segmentGap(current.left, current.right, candidate.left, candidate.right);
			break;
		case "up":
			primary = curY - candY;
			cross = segmentGap(current.left, current.right, candidate.left, candidate.right);
			break;
	}

	// Candidate must sit ahead of the current element along the travel axis.
	if (primary <= 1) return null;
	return primary + cross * CROSS_AXIS_WEIGHT;
}

function findInDirection(current: HTMLElement, dir: Direction, candidates: HTMLElement[]): HTMLElement | null {
	const currentRect = current.getBoundingClientRect();
	let best: HTMLElement | null = null;
	let bestScore = Infinity;

	for (const candidate of candidates) {
		if (candidate === current) continue;
		const score = scoreCandidate(currentRect, candidate.getBoundingClientRect(), dir);
		if (score !== null && score < bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best;
}

// When nothing meaningful is focused, start from the top-most / left-most
// element so the first arrow press lands somewhere sensible.
function findEntryPoint(candidates: HTMLElement[]): HTMLElement | null {
	let best: HTMLElement | null = null;
	let bestRect: DOMRect | null = null;
	for (const candidate of candidates) {
		const rect = candidate.getBoundingClientRect();
		if (rect.bottom < 0 || rect.top > window.innerHeight) continue; // prefer on-screen
		if (!bestRect || rect.top < bestRect.top - 4 || (Math.abs(rect.top - bestRect.top) <= 4 && rect.left < bestRect.left)) {
			best = candidate;
			bestRect = rect;
		}
	}
	return best ?? candidates[0] ?? null;
}

let highlighted: HTMLElement | null = null;

function moveFocus(el: HTMLElement): void {
	if (highlighted && highlighted !== el) highlighted.classList.remove("snav-focused");
	highlighted = el;
	el.classList.add("snav-focused");
	el.focus({ preventScroll: true });
	el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// Move focus one step in a direction. Shared by the keyboard and the gamepad.
// Returns true when focus actually moved.
function performMove(direction: Direction): boolean {
	const active = document.activeElement as HTMLElement | null;
	const candidates = getFocusable();
	if (candidates.length === 0) return false;

	const current = active && active !== document.body && candidates.includes(active) ? active : null;
	const next = current ? findInDirection(current, direction, candidates) : findEntryPoint(candidates);

	if (next) {
		moveFocus(next);
		return true;
	}
	return false;
}

// Activate the focused element — links/buttons handle this natively via click.
function activateFocused(): void {
	const active = document.activeElement as HTMLElement | null;
	if (active && active !== document.body) active.click();
}

// ── Gamepad (Xbox / standard mapping) ───────────────────────────────────────
// Uses the browser-native Gamepad API — no drivers, no dependencies. Buttons
// follow the "standard" mapping: 0 = A, 1 = B, 12-15 = D-pad up/down/left/right.

const STICK_DEADZONE = 0.5;
// Hold-to-repeat: move once immediately, pause, then auto-repeat while held.
const REPEAT_INITIAL_DELAY = 380;
const REPEAT_INTERVAL = 130;

function readGamepadDirection(pad: Gamepad): Direction | null {
	if (pad.buttons[12]?.pressed) return "up";
	if (pad.buttons[13]?.pressed) return "down";
	if (pad.buttons[14]?.pressed) return "left";
	if (pad.buttons[15]?.pressed) return "right";

	const [ax = 0, ay = 0] = pad.axes;
	if (Math.max(Math.abs(ax), Math.abs(ay)) < STICK_DEADZONE) return null;
	if (Math.abs(ay) >= Math.abs(ax)) return ay < 0 ? "up" : "down";
	return ax < 0 ? "left" : "right";
}

export function useSpatialNavigation(): void {
	const location = useLocation();
	// The listeners are installed once (see the empty-deps effect below); they
	// read the live route through this ref so a navigation never tears the
	// gamepad loop down and resets its per-button edge state mid-press.
	const pathnameRef = useRef(location.pathname);
	pathnameRef.current = location.pathname;

	useEffect(() => {
		// The video players own the directional input on the watch route.
		const isDisabled = () => pathnameRef.current === "/watch";

		// ── Keyboard ────────────────────────────────────────────────────────────
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isDisabled()) return;
			if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

			const direction = keyToDirection(event.key);
			if (!direction) return;

			const active = document.activeElement as HTMLElement | null;

			// Inside a text field / select, let the caret and native listbox use the
			// horizontal / vertical keys they need; only let vertical arrows escape a
			// single-line text input.
			if (isEditableTarget(active)) {
				const isSingleLineInput = active.tagName === "INPUT";
				const escaping = isSingleLineInput && (direction === "up" || direction === "down");
				if (!escaping) return;
			}

			if (performMove(direction)) event.preventDefault();
		};

		// Keep the TV-style highlight in sync when focus leaves via mouse/blur.
		const handleFocusOut = (event: FocusEvent) => {
			if (event.target === highlighted) {
				highlighted?.classList.remove("snav-focused");
				highlighted = null;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("focusout", handleFocusOut);

		// ── Gamepad polling ───────────────────────────────────────────────────────
		// Only spin a poll loop while a controller is actually connected, so
		// keyboard/mouse users never pay for a perpetual rAF.
		let rafId = 0;
		let polling = false;
		let heldDirection: Direction | null = null;
		let directionSince = 0;
		let lastMoveAt = 0;
		let prevA = false;
		let prevB = false;

		const poll = () => {
			const pads = navigator.getGamepads ? navigator.getGamepads() : [];
			const pad = Array.from(pads).find((p): p is Gamepad => p !== null);

			if (pad) {
				const now = performance.now();
				// Skip actions on the watch route, but keep reading button state so a
				// button released there can't fire a stale edge afterwards.
				const disabled = isDisabled();
				const direction = disabled ? null : readGamepadDirection(pad);

				if (direction) {
					if (direction !== heldDirection) {
						// New direction — move at once and start the hold timer.
						heldDirection = direction;
						directionSince = now;
						lastMoveAt = now;
						performMove(direction);
					} else if (now - directionSince > REPEAT_INITIAL_DELAY && now - lastMoveAt > REPEAT_INTERVAL) {
						lastMoveAt = now;
						performMove(direction);
					}
				} else {
					heldDirection = null;
				}

				// A → activate, B → back. Fire once on the press edge — the edge state
				// persists across navigations so one physical press = one action.
				const aPressed = pad.buttons[0]?.pressed ?? false;
				if (aPressed && !prevA && !disabled) activateFocused();
				prevA = aPressed;

				const bPressed = pad.buttons[1]?.pressed ?? false;
				if (bPressed && !prevB && !disabled) window.history.back();
				prevB = bPressed;
			}

			rafId = requestAnimationFrame(poll);
		};

		const startPolling = () => {
			if (polling) return;
			polling = true;
			rafId = requestAnimationFrame(poll);
		};
		const stopPollingIfNoneLeft = () => {
			const pads = navigator.getGamepads ? navigator.getGamepads() : [];
			const anyLeft = Array.from(pads).some((p) => p !== null);
			if (!anyLeft) {
				polling = false;
				cancelAnimationFrame(rafId);
			}
		};

		window.addEventListener("gamepadconnected", startPolling);
		window.addEventListener("gamepaddisconnected", stopPollingIfNoneLeft);
		// A controller paired before this screen mounted won't re-fire connect.
		const existing = navigator.getGamepads ? navigator.getGamepads() : [];
		if (Array.from(existing).some((p) => p !== null)) startPolling();

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("focusout", handleFocusOut);
			window.removeEventListener("gamepadconnected", startPolling);
			window.removeEventListener("gamepaddisconnected", stopPollingIfNoneLeft);
			cancelAnimationFrame(rafId);
		};
	}, []);
}
