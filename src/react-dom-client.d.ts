// Ambient shim for react-dom/client (React 18).
// @types/react-dom cannot be installed here — a legacy dependency
// (electron-forge@5) breaks npm's version resolution. This file is a
// "script" (no top-level import/export) so `declare module` declares
// the module rather than merely augmenting it.
declare module "react-dom/client" {
	export interface Root {
		render(children: import("react").ReactNode): void;
		unmount(): void;
	}

	export function createRoot(
		container: Element | DocumentFragment,
		options?: unknown
	): Root;

	export function hydrateRoot(
		container: Element | DocumentFragment,
		children: import("react").ReactNode,
		options?: unknown
	): Root;
}
