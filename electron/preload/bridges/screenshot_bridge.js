const { CHANNELS } = require("../../shared/channels");

const createScreenshotBridge = (ipcRenderer) => ({
  capture: () => ipcRenderer.invoke(CHANNELS.SCREENSHOT.CAPTURE),
  checkAvailability: () =>
    ipcRenderer.invoke(CHANNELS.SCREENSHOT.CHECK_AVAILABILITY),
});

module.exports = { createScreenshotBridge };
