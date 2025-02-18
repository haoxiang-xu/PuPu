<link
  href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
  rel="stylesheet"
></link>

# <img src="assets/logo.png" alt="PuPu UI" style="height: 128px"> PuPu

**" A simple and easy to use UI for the Ollama. "**

PuPu is a lightweight tool that makes it easy to run AI models on your own device. Designed for smooth performance and ease of use, PuPu is perfect for anyone who wants quick access to AI without technical complexity.

<img src="assets/PuPu_UI.png" alt="PuPu UI"/>

## Download the App

[![Download for Windows][windows-shield]][windows-url]<br>
[![Download for Mac][macos-shield]][macos-url]

## Table of Contents

- [Local Setup](#local-setup)
- [Deployment](#deployment)

### Local Setup <a name="local-setup"></a>

- Install dependencies: <span style="opacity: 0.32">To run the electron app locally, you need to install the dependencies by running the following command:</span>

`npm install`

- Rebuild the Electron App: <span style="opacity: 0.32">After installing the dependencies, you need to rebuild the electron app by running the following command:</span>

`npx electron-rebuild`

- Run the Electron App: <span style="opacity: 0.32">Once the dependencies are installed, you can run the app by running the following command:</span>

`npm start`

- Build the React App: <span style="opacity: 0.32"> In order to build the app for different platforms, you should build the React app first by running the following command:</span>

### Deployment <a name="deployment"></a>

`npm run build`

- Build the Electron App: <span style="opacity: 0.32">Once the React app is built, you can build the electron app for different platforms by running the following command:</span>

`npx electron-builder --mac` <span style="opacity: 0.32"> (for mac) </span>

`npx electron-builder --win` <span style="opacity: 0.32"> (for windows) Notice: Windows might require you to run the command in an administrator shell. </span>

`npx electron-builder --linux` <span style="opacity: 0.32"> (for linux) </span>

[windows-shield]: https://img.shields.io/badge/download_for_windows-AA3E71?style=for-the-badge&logo=windows&logoColor=FFFFFF&labelColor=FFFFFF
[windows-url]: https://github.com/haoxiang-xu/PuPu/releases/tag/v0.0.1
[macos-shield]: https://img.shields.io/badge/download_for_mac-AA3E71?style=for-the-badge&logo=apple&logoColor=FFFFFF&labelColor=AA3E71
[macos-url]: https://github.com/haoxiang-xu/PuPu/releases/tag/v0.0.1
