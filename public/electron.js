const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  nativeTheme,
  dialog,
} = require("electron");

const pty = require("node-pty");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const os = require("os");

const { minimum_window_size } = require("./constants");

let mainWindow;
let terminalProcess = null;

/* { flags } */
let quitting = false;
/* { flags } */

/* { create main window } ============================================================================================================== */
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
      title: "PuPu",
      icon: path.join(__dirname, "favicon.ico"),
      width: 744,
      height: 744,
      minHeight: minimum_window_size.height,
      minWidth: minimum_window_size.width,
      webSecurity: true,
      resizable: true,
      maximizable: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      frame: true,
      hasShadow: true,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 14, y: 13 },
      vibrancy: "sidebar",
      visualEffectState: "active",
    });
    app.dock.setIcon(path.join(__dirname, "logo_512x512.png"));
  } else if (process.platform === "win32") {
    mainWindow = new BrowserWindow({
      title: "PuPu",
      icon: path.join(__dirname, "logo_256x256.ico"),
      width: 744,
      height: 744,
      minHeight: minimum_window_size.height,
      minWidth: minimum_window_size.width,
      webSecurity: true,
      hasShadow: true,
      transparent: false,
      resizable: true,
      maximizable: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      titleBarStyle: "hidden",
      backgroundColor: "#181818",
      frame: true,
    });
  } else {
    mainWindow = new BrowserWindow({
      title: "PuPu",
      icon: path.join(__dirname, "logo_512x512.png"),
      width: 744,
      height: 744,
      minHeight: minimum_window_size.height,
      minWidth: minimum_window_size.width,
      webSecurity: true,
      transparent: true,
      resizable: true,
      maximizable: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      frame: false,
    });
  }
  mainWindow.setTitle("PuPu");

  // Load the index.html of the app.
  const isDev = !app.isPackaged;
  if (isDev) {
    checkServerAndLoadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(
      `file://${path.join(__dirname, "..", "build", "index.html")}`
    );
  }
};
/* { create main window } ============================================================================================================== */

app.whenReady().then(() => {
  create_main_window();
  create_terminal();
  register_window_state_event_listeners();
  register_will_navigate_event_listener();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
app.on("before-quit", () => {
  quitting = true;
  if (terminalProcess) {
    try {
      terminalProcess.kill();
    } catch (error) {
      console.error("Error killing terminal process:", error);
    }
  }
});

/* { window state event listener } ===================================================================================================== */
const register_window_state_event_listeners = () => {
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-state-event-listener", {
      isMaximized: true,
    });
  });
  mainWindow.on("unmaximize", () => {
    if (process.platform === "win32") {
      mainWindow.setBounds({
        width: mainWindow.getBounds().width,
        height: mainWindow.getBounds().height,
      });
    }
    mainWindow.webContents.send("window-state-event-listener", {
      isMaximized: false,
    });
  });
  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("window-state-event-listener", {
      isMaximized: true,
    });
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("window-state-event-listener", {
      isMaximized: false,
    });
  });
  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !quitting) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      mainWindow = null;
    }
  });
};
ipcMain.on("window-state-event-handler", (event, action) => {
  switch (action) {
    case "close":
      mainWindow.close();
      break;
    case "minimize":
      mainWindow.minimize();
      break;
    case "maximize":
      if (process.platform === "win32") {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      } else if (process.platform === "linux") {
        if (mainWindow.isMaximized()) {
          mainWindow.restore();
        } else {
          mainWindow.maximize();
        }
      } else if (process.platform === "darwin") {
        if (mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(false);
        } else {
          mainWindow.setFullScreen(true);
        }
      }
      break;
    default:
      break;
  }
});
ipcMain.on("theme-status-handler", (event, theme) => {
  nativeTheme.themeSource = theme;
});
/* { window state event listener } ===================================================================================================== */

/* { 拦截 will-navigate 事件 } */
const register_will_navigate_event_listener = () => {
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      // 防止 Electron 内部页面也被拦截
      event.preventDefault();
      shell.openExternal(url);
    }
  });
};

/* { node-pty } ======================================================================================================================== */
const create_terminal = () => {
  if (!terminalProcess) {
    // Set shell based on platform
    const shell =
      os.platform() === "win32"
        ? "powershell.exe"
        : process.env.SHELL || "bash";
    const args = os.platform() === "win32" ? [] : ["-l"]; // -l for login shell

    try {
      // Create terminal with proper encoding and environment
      terminalProcess = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: 80,
        rows: 30,
        cwd: os.homedir(), // Use homedir() instead of HOME
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
        encoding: "utf8", // Ensure proper encoding
      });

      console.log(`Terminal process created with PID: ${terminalProcess.pid}`);

      // Setup data handling immediately
      terminalProcess.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("terminal-event-listener", data);
        }
      });

      terminalProcess.onExit(({ exitCode, signal }) => {
        console.log(
          `Terminal process exited with code: ${exitCode}, signal: ${signal}`
        );
        terminalProcess = null;
        // Recreate terminal after a short delay
        setTimeout(create_terminal, 1000);
      });
    } catch (error) {
      console.error("Failed to create terminal process:", error);
    }
  }
};
// Handle terminal resize events
ipcMain.on("terminal-resize", (event, { cols, rows }) => {
  if (terminalProcess) {
    try {
      terminalProcess.resize(cols, rows);
      console.log(`Terminal resized to ${cols}x${rows}`);
    } catch (error) {
      console.error("Error resizing terminal:", error);
    }
  }
});
// Handle input from the frontend
ipcMain.on("terminal-event-handler", (event, input) => {
  if (terminalProcess) {
    try {
      terminalProcess.write(input);
    } catch (error) {
      console.error("Error writing to terminal:", error);
      // Try to recreate terminal if write fails
      create_terminal();
    }
  } else {
    // If no terminal process exists, create one
    create_terminal();
  }
});
/* { node-pty } ======================================================================================================================== */

/* { local data related } ============================================================================================================== */
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "png", "jpeg"] }],
  });
  return result;
});
ipcMain.handle("read-file", async (event, filePath) => {
  const fileData = fs.readFileSync(filePath, { encoding: "base64" });
  return `data:image/png;base64,${fileData}`;
});
/* { local data related } ============================================================================================================== */
