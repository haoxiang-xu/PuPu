const { app, BrowserWindow } = require("electron");
const axios = require("axios");

const { minimum_window_size } = require("./constants");

let mainWindow;



const create_main_window = () => {
  const checkServerAndLoadURL = (url) => {
    axios
      .get(url)
      .then(() => {
        mainWindow.loadURL(url);
      })
      .catch((error) => {
        console.error("Server not ready, retrying...", error);
        setTimeout(() => checkServerAndLoadURL(url), 2000);
      });
  };
  // Initialize the browser window.
  if (process.platform === "darwin") {
    mainWindow = new BrowserWindow({
      title: "",
      width: 1200,
      height: 800,
      webSecurity: true,
      transparent: false,
      resizable: true,
      maximizable: true,
      frame: true,
      hasShadow: true,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 14, y: 13 },
      vibrancy: "sidebar",
      visualEffectState: "active",
    });
    app.dock.setIcon(path.join(__dirname, "/assets/logos/logo_pink_512.png"));
  } else if (process.platform === "win32") {
    mainWindow = new BrowserWindow({
      title: "",
      width: 1200,
      height: 800,
      minHeight: minimum_window_size.height,
      minWidth: minimum_window_size.width,
      webSecurity: true,
      hasShadow: true,
      transparent: false,
      resizable: true,
      maximizable: true,
      backgroundMaterial: "acrylic",
      titleBarStyle: "hidden",
      backgroundColor: "#181818",
      frame: true,
    });
  } else {
    mainWindow = new BrowserWindow({
      title: "",
      width: 1200,
      height: 800,
      webSecurity: true,
      transparent: true,
      resizable: true,
      maximizable: true,
      frame: false,
    });
  }
  mainWindow.setTitle("Surface Editor");

  // Load the index.html of the app.
  checkServerAndLoadURL("http://localhost:3000");
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  create_main_window();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
