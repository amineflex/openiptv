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
		ignore: (filePath) => {
			if (/(^|[/\\])(\.agents|\.codex|\.electron-cache|\.forge-home|\.forge-local|\.git|\.npm-cache|out)([/\\]|$)/.test(filePath)) {
				return true;
			}
			// ffprobe-static ships a ffprobe build for EVERY os/arch (~336 MB). Keep
			// only the one matching the build host so the installer isn't bloated
			// with the other platforms' binaries.
			const probe = filePath.match(/[/\\]ffprobe-static[/\\]bin[/\\]([^/\\]+)[/\\]([^/\\]+)[/\\]/);
			if (probe && (probe[1] !== process.platform || probe[2] !== process.arch)) {
				return true;
			}
			return false;
		}
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
				// draft:false so the release is published immediately and becomes the
				// "latest" the auto-updater reads from releases/latest/download. Set to
				// true if you'd rather review release notes first — but then you MUST
				// click "Publish release" on GitHub for clients to receive the update
				// (the latest/download feed ignores drafts).
				draft: false
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
