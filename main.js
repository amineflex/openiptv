const { app, BrowserWindow } = require("electron");
const path = require("path");

// Chromium flags 
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-platform-ac3-eac3-audio');

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			experimentalFeatures: true,
			enableBlinkFeatures: "AudioVideoTracks"
		}
	});

	win.loadFile("dist/index.html");

	// DevTools
	win.webContents.openDevTools();
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
