module.exports = {
	packagerConfig: {
		name: "OpenIPTV",
		executableName: "OpenIPTV",
		icon: "./icon",
		overwrite: true,
		// Unpack ffmpeg/ffprobe binaries from the asar archive so the OS can execute them
		asar: {
			unpack: "**/node_modules/{ffmpeg-static,ffprobe-static}/**/*"
		},
		download: {
			cacheRoot: "E:/openiptvclient/.electron-cache"
		},
		ignore: (filePath) =>
			/(^|[/\\])(\.agents|\.codex|\.electron-cache|\.forge-home|\.forge-local|\.git|\.npm-cache|out)([/\\]|$)/.test(filePath)
	},
	rebuildConfig: {
		useCache: true,
		cachePath: "E:/openiptvclient/.electron-rebuild-cache"
	},
	publishers: [
		{
			name: "@electron-forge/publisher-github",
			config: {
				repository: {
					owner: "amineflex",
					name: "openiptv"
				},
				prerelease: false,
				draft: true // creates a draft release for manual review before publishing
			}
		}
	],
	makers: [
		{
			name: "@electron-forge/maker-squirrel",
			platforms: ["win32"],
			config: {
				name: "OpenIPTV",
				setupExe: "OpenIPTVSetup.exe",
				noMsi: true
			}
		},
		{
			name: "@electron-forge/maker-zip",
			platforms: ["win32", "darwin", "linux"]
		},
		{
			name: "@electron-forge/maker-dmg",
			platforms: ["darwin"]
		},
		{
			name: "@electron-forge/maker-deb",
			platforms: ["linux"]
		}
	]
};
