/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./*.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["DM Sans", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
			},
			animation: {
				"pulse-slow": "pulse-slow 8s ease-in-out infinite",
				"fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
				"scale-in": "scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
				"float": "float 6s ease-in-out infinite",
			},
			keyframes: {
				"pulse-slow": {
					"0%, 100%": { opacity: "0.3", transform: "scale(1)" },
					"50%": { opacity: "0.7", transform: "scale(1.1)" }
				},
				"fade-in-up": {
					"0%": { opacity: "0", transform: "translateY(20px)" },
					"100%": { opacity: "1", transform: "translateY(0)" }
				},
				"scale-in": {
					"0%": { opacity: "0", transform: "scale(0.92)" },
					"100%": { opacity: "1", transform: "scale(1)" }
				},
				"float": {
					"0%, 100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-10px)" }
				}
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
