const { CHANNELS } = require("../../shared/channels");

const createThemeBridge = (ipcRenderer) => ({
  setBackgroundColor: (color) => {
    ipcRenderer.send(CHANNELS.THEME.SET_BACKGROUND_COLOR, color);
  },
  setThemeMode: (mode) => {
    ipcRenderer.send(CHANNELS.THEME.SET_MODE, mode);
  },
});

module.exports = {
  createThemeBridge,
};
