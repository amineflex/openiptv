import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [
	{
		ignores: [
			"dist/**",
			"dist-electron/**",
			"out/**",
			"node_modules/**"
		]
	},
	...compat.extends("eslint:recommended", "prettier", "plugin:@typescript-eslint/recommended"),
	{
		// CommonJS build/tooling configs legitimately use module.exports/require.
		files: ["*.config.js", "postcss.config.js", "tailwind.config.js", "forge.config.js"],
		rules: {
			"@typescript-eslint/no-require-imports": "off"
		}
	},
	{
		plugins: {
			"@typescript-eslint": typescriptEslint
		},

		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser
			},

			parser: tsParser,
			ecmaVersion: "latest",
			sourceType: "module"
		},

		rules: {
			// TypeScript handles undefined-symbol checking; the core rule only
			// produces false positives for JSX/TS globals (React, AudioTrack…).
			"no-undef": "off",
			// Use the TS-aware unused-vars rule (the core one mis-flags type
			// signature parameter names). Allow leading-underscore opt-outs.
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"no-console": "off",
			"no-constant-condition": "error",
			indent: ["error", "tab", { SwitchCase: 1 }],
			semi: ["error", "always"],
			quotes: ["error", "double", { avoidEscape: true }],
			"prefer-const": "error",
			"semi-style": ["error", "last"],
			"no-process-exit": "off",
			"node/no-missing-import": "off",
			"no-var-requires": "off"
		}
	}
];
