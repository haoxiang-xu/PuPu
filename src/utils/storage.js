/**
 * Storage utility module
 * Provides a unified interface for file-based storage via Electron IPC
 */

const storage = {
  // Address Book operations
  readAddressBook: async () => {
    try {
      return await window.storageAPI.readAddressBook();
    } catch (error) {
      console.error("Error reading address book:", error);
      return { avaliable_addresses: [] };
    }
  },

  writeAddressBook: async (data) => {
    try {
      return await window.storageAPI.writeAddressBook(data);
    } catch (error) {
      console.error("Error writing address book:", error);
      return { success: false, error: error.message };
    }
  },

  // Favoured Models operations
  readFavouredModels: async () => {
    try {
      return await window.storageAPI.readFavouredModels();
    } catch (error) {
      console.error("Error reading favoured models:", error);
      return null;
    }
  },

  writeFavouredModels: async (data) => {
    try {
      return await window.storageAPI.writeFavouredModels(data);
    } catch (error) {
      console.error("Error writing favoured models:", error);
      return { success: false, error: error.message };
    }
  },

  // Section operations
  readSection: async (address) => {
    try {
      return await window.storageAPI.readSection(address);
    } catch (error) {
      console.error(`Error reading section ${address}:`, error);
      return null;
    }
  },

  writeSection: async (address, data) => {
    try {
      return await window.storageAPI.writeSection(address, data);
    } catch (error) {
      console.error(`Error writing section ${address}:`, error);
      return { success: false, error: error.message };
    }
  },

  deleteSection: async (address) => {
    try {
      return await window.storageAPI.deleteSection(address);
    } catch (error) {
      console.error(`Error deleting section ${address}:`, error);
      return { success: false, error: error.message };
    }
  },

  listSections: async () => {
    try {
      return await window.storageAPI.listSections();
    } catch (error) {
      console.error("Error listing sections:", error);
      return [];
    }
  },

  // Storage size operations
  getSize: async () => {
    try {
      return await window.storageAPI.getSize();
    } catch (error) {
      console.error("Error getting storage size:", error);
      return "0.00";
    }
  },

  getSectionSizes: async () => {
    try {
      return await window.storageAPI.getSectionSizes();
    } catch (error) {
      console.error("Error getting section sizes:", error);
      return [];
    }
  },

  // File operations (for uploaded images)
  saveFile: async (fileKey, fileData) => {
    try {
      return await window.storageAPI.saveFile(fileKey, fileData);
    } catch (error) {
      console.error(`Error saving file ${fileKey}:`, error);
      return { success: false, error: error.message };
    }
  },

  loadFile: async (fileKey) => {
    try {
      return await window.storageAPI.loadFile(fileKey);
    } catch (error) {
      console.error(`Error loading file ${fileKey}:`, error);
      return null;
    }
  },

  deleteSectionFiles: async (address) => {
    try {
      return await window.storageAPI.deleteSectionFiles(address);
    } catch (error) {
      console.error(`Error deleting files for section ${address}:`, error);
      return { success: false, error: error.message };
    }
  },
};

export default storage;
