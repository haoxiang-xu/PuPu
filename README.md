<link
  href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
  rel="stylesheet"
></link>
<img src="assets/logo.png" alt="PuPu UI"/>

# PuPu

" A simple and easy to use UI for the Ollama. "

<img src="assets/PuPu_UI.png" alt="PuPu UI"/>

## Download the App

[![Download for Windows][windows-shield]][windows-url]<br>
[![Download for Mac][macos-shield]][macos-url]

<br><br><br>
<br><br><br>
<br><br><br>
<br><br><br>
<br><br><br>
<br><br><br>
<br><br><br>

## Table of Contents

- [Local Setup](#local-setup)

### Local Setup <a name="local-setup"></a>

- Install dependencies: <span style="opacity: 0.32">To run the electron app locally, you need to install the dependencies by running the following command:</span>

`npm install --legacy-peer-deps`

- Run the Electron App: <span style="opacity: 0.32">Once the dependencies are installed, you can run the app by running the following command:</span>

`npm start`

- Build the React App: <span style="opacity: 0.32"> In order to build the app for different platforms, you should build the React app first by running the following command:</span>

`npm run build`

- Build the Electron App: <span style="opacity: 0.32">Once the React app is built, you can build the electron app for different platforms by running the following command:</span>

`npx electron-builder --mac` <span style="opacity: 0.32"> (for mac) </span>

`npx electron-builder --win` <span style="opacity: 0.32"> (for windows) Notice: Windows might require you to run the command in an administrator shell. </span>

`npx electron-builder --linux` <span style="opacity: 0.32"> (for linux) </span>

[windows-shield]: https://img.shields.io/badge/download_for_windows-222222?style=for-the-badge&logo=windows&logoColor=FFFFFF&labelColor=412991
[windows-url]: ./download/PuPu%20Setup%200.0.1.exe
[macos-shield]: https://img.shields.io/badge/download_for_mac-222222?style=for-the-badge&logo=apple&logoColor=FFFFFF&labelColor=412991
[macos-url]: ./download/PuPu-0.0.1.dmg
