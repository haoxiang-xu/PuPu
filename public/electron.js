const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  nativeTheme,
  dialog,
} = require("electron");

const { spawn } = require("child_process");
const pty = require("node-pty");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const os = require("os");

const { minimum_window_size } = require("./constants");

let mainWindow;
let terminalProcess = null;
let flaskDataProcess = null;

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
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
};
/* { create main window } ============================================================================================================== */

app.whenReady().then(() => {
  initializeStorage();
  create_main_window();
  start_terminal();
  start_flask_data_server();
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
  stop_terminal();
  stop_flask_data_server();
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
const start_terminal = () => {
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
        setTimeout(start_terminal, 1000);
      });
    } catch (error) {
      console.error("Failed to create terminal process:", error);
    }
  }
};
const stop_terminal = () => {
  if (terminalProcess) {
    try {
      terminalProcess.kill();
    } catch (error) {
      console.error("Error killing terminal process:", error);
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
      start_terminal();
    }
  } else {
    // If no terminal process exists, create one
    start_terminal();
  }
});
/* { node-pty } ======================================================================================================================== */

/* { flask } =========================================================================================================================== */
const start_flask_data_server = () => {
  const isDev = !app.isPackaged;

  const scriptPath = isDev
    ? path.join(__dirname, "child_processes", "data_process.py")
    : path.join(process.resourcesPath, "child_processes", "data_process.py");

  let pythonPath = "python3";
  if (process.platform === "win32") {
    pythonPath = isDev
      ? path.join(__dirname, "venv", "Scripts", "python.exe")
      : path.join(process.resourcesPath, "venv", "Scripts", "python.exe");
  } else {
    pythonPath = isDev
      ? path.join(__dirname, "venv", "bin", "python3")
      : path.join(process.resourcesPath, "venv", "bin", "python3");
  }

  flaskDataProcess = spawn(pythonPath, [scriptPath]);
};
const stop_flask_data_server = () => {
  if (flaskDataProcess) {
    flaskDataProcess.kill();
    flaskDataProcess = null;
  }
};
/* { flask } =========================================================================================================================== */

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

/* { file storage } ==================================================================================================================== */
const storageDir = path.join(app.getPath("userData"), "storage");
const sectionsDir = path.join(storageDir, "sections");

// Initialize storage directory
const initializeStorage = () => {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    if (!fs.existsSync(sectionsDir)) {
      fs.mkdirSync(sectionsDir, { recursive: true });
    }
  } catch (error) {
    console.error("Error initializing storage:", error);
  }
};

// Read address book
ipcMain.handle("storage:read-address-book", async () => {
  try {
    const filePath = path.join(storageDir, "address_book.json");
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
    return { avaliable_addresses: [] };
  } catch (error) {
    console.error("Error reading address book:", error);
    return { avaliable_addresses: [] };
  }
});

// Write address book
ipcMain.handle("storage:write-address-book", async (event, data) => {
  try {
    const filePath = path.join(storageDir, "address_book.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return { success: true };
  } catch (error) {
    console.error("Error writing address book:", error);
    return { success: false, error: error.message };
  }
});

// Read favoured models
ipcMain.handle("storage:read-favoured-models", async () => {
  try {
    const filePath = path.join(storageDir, "favoured_models.json");
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error("Error reading favoured models:", error);
    return null;
  }
});

// Write favoured models
ipcMain.handle("storage:write-favoured-models", async (event, data) => {
  try {
    const filePath = path.join(storageDir, "favoured_models.json");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return { success: true };
  } catch (error) {
    console.error("Error writing favoured models:", error);
    return { success: false, error: error.message };
  }
});

// Read section data
ipcMain.handle("storage:read-section", async (event, address) => {
  try {
    const filePath = path.join(sectionsDir, `${address}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error(`Error reading section ${address}:`, error);
    return null;
  }
});

// Write section data
ipcMain.handle("storage:write-section", async (event, address, data) => {
  try {
    const filePath = path.join(sectionsDir, `${address}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return { success: true };
  } catch (error) {
    console.error(`Error writing section ${address}:`, error);
    return { success: false, error: error.message };
  }
});

// Delete section data
ipcMain.handle("storage:delete-section", async (event, address) => {
  try {
    const filePath = path.join(sectionsDir, `${address}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    console.error(`Error deleting section ${address}:`, error);
    return { success: false, error: error.message };
  }
});

// List all sections
ipcMain.handle("storage:list-sections", async () => {
  try {
    if (!fs.existsSync(sectionsDir)) {
      return [];
    }
    const files = fs.readdirSync(sectionsDir);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(".json", ""));
  } catch (error) {
    console.error("Error listing sections:", error);
    return [];
  }
});

// Get storage size
ipcMain.handle("storage:get-size", async () => {
  try {
    const getDirectorySize = (dirPath) => {
      let totalSize = 0;
      if (!fs.existsSync(dirPath)) {
        return 0;
      }
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        } else if (stats.isDirectory()) {
          totalSize += getDirectorySize(filePath);
        }
      }
      return totalSize;
    };

    const totalSize = getDirectorySize(storageDir);
    const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    return totalSizeInMB;
  } catch (error) {
    console.error("Error getting storage size:", error);
    return "0.00";
  }
});

// Get section sizes
ipcMain.handle("storage:get-section-sizes", async () => {
  try {
    if (!fs.existsSync(sectionsDir)) {
      return [];
    }
    const files = fs.readdirSync(sectionsDir);
    const sectionSizes = [];
    
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(sectionsDir, file);
        const stats = fs.statSync(filePath);
        const address = file.replace(".json", "");
        sectionSizes.push({
          address: address,
          size_in_kb: stats.size / 1024,
        });
      }
    }
    
    return sectionSizes;
  } catch (error) {
    console.error("Error getting section sizes:", error);
    return [];
  }
});

// File storage (for uploaded images)
const filesDir = path.join(storageDir, "files");

// Initialize files directory
const initializeFilesDir = () => {
  try {
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }
  } catch (error) {
    console.error("Error initializing files directory:", error);
  }
};

// Save file
ipcMain.handle("storage:save-file", async (event, fileKey, fileData) => {
  try {
    initializeFilesDir();
    const filePath = path.join(filesDir, `${fileKey}.txt`);
    fs.writeFileSync(filePath, fileData, "utf8");
    return { success: true };
  } catch (error) {
    console.error(`Error saving file ${fileKey}:`, error);
    return { success: false, error: error.message };
  }
});

// Load file
ipcMain.handle("storage:load-file", async (event, fileKey) => {
  try {
    const filePath = path.join(filesDir, `${fileKey}.txt`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return data;
    }
    return null;
  } catch (error) {
    console.error(`Error loading file ${fileKey}:`, error);
    return null;
  }
});

// Delete files for a section
ipcMain.handle("storage:delete-section-files", async (event, address) => {
  try {
    if (!fs.existsSync(filesDir)) {
      return { success: true };
    }
    const files = fs.readdirSync(filesDir);
    for (const file of files) {
      if (file.startsWith(address + "_")) {
        const filePath = path.join(filesDir, file);
        fs.unlinkSync(filePath);
      }
    }
    return { success: true };
  } catch (error) {
    console.error(`Error deleting files for section ${address}:`, error);
    return { success: false, error: error.message };
  }
});
/* { file storage } ==================================================================================================================== */
