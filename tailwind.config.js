/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./*.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["DM Sans", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
			},
			colors: {
				secondary: {
					DEFAULT: "#e3dfff",
					100: "#0d0060",
					200: "#1a00c0",
					300: "#3e21ff",
					400: "#9181ff",
					500: "#e3dfff",
					600: "#eae7ff",
					700: "#efedff",
					800: "#f4f3ff",
					900: "#faf9ff"
				},
				primary: {
					DEFAULT: "#474973",
					100: "#0e0e17",
					200: "#1c1d2e",
					300: "#2a2b44",
					400: "#383a5b",
					500: "#474973",
					600: "#5f629a",
					700: "#8688b5",
					800: "#aeb0cd",
					900: "#d7d7e6"
				},
				dark: {
					DEFAULT: "#0d0c1d",
					100: "#030206",
					200: "#05050c",
					300: "#080711",
					400: "#0b0a17",
					500: "#0d0c1d",
					600: "#2b285f",
					700: "#4a43a1",
					800: "#807bc8",
					900: "#bfbde3"
				}
			}
		}
	},
	plugins: [require("@tailwindcss/forms")]
};
