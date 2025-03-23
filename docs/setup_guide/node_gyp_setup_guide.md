# Node-gyp Setup Guide

To set up the necessary environment for node-gyp using the Visual Studio Installer, follow these steps:

## 1. Have Visual Studio Installer Ready

- Download the Visual Studio Installer from Microsoft’s official site.
- Run the installer and select “Visual Studio Build Tools” as the workload.


## 2. Modify or Install Visual Studio Build Tools

- If you already have Visual Studio Build Tools installed, click Modify.
- If not, install Build Tools for Visual Studio from Microsoft’s official site.

## 3. Select Required Components

In the Workloads tab, select:
- “Desktop development with C++” (if available)
- “Node.js development” (optional)

Then, go to the Individual Components tab and ensure the following are checked:
- MSVC v143 - VS 2022 C++ x64/x86 build tools (or latest version)
- Windows 10/11 SDK (latest version)
- C++ CMake tools for Windows
- C++ ATL for v143 build tools (x86 & x64) (optional, for advanced cases)

## 4. Install Python (if not installed)

Node-gyp requires Python 3.x (preferably 3.7+). You can install it manually or via:

`npm install --global --production windows-build-tools`

Or install Python separately from python.org.

## 5. Set Up Environment Variables

After installation, ensure your system recognizes these tools by setting environment variables:

`npm config set msvs_version 2022`

For older versions, replace 2022 with the correct version.

## Verify Installation

Run the following to verify:

`node-gyp --version`

If it prints a version number, node-gyp is correctly set up.

---

**Now, you should be able to use node-gyp in your terminal project without issues!**

Back to [README](../README.md)