<link
  href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
  rel="stylesheet"
></link>

<div align="center">
  <img src="public/assets/logo_low_resolution.png" alt="Mini UI Logo" style="height: 128px">
  <h1>Mini UI</h1>
  <p>A starting point for your React Project.</p>
</div>
<br><br>

<span style="opacity: 0.32">Mini UI is a React project starter template that provides a solid foundation for building modern web applications. It includes essential features such as routing, state management, and a responsive design system, making it easy to kickstart your next project. Instead of using a monolithic framework, Mini UI is standard of large scale React projects, offering a modular and flexible architecture that can be easily extended and customized.</span>

## Table of Contents

- [Prerequisites](#prerequisites)
  - [Setup a Node.js environment with version 23.0.0](#setup-a-nodejs-environment-with-version-2300)
  - [Setup npm version 11.1.0](#setup-npm)
- [Run Web / Electron](#run-web--electron)

## Prerequisites <a id="prerequisites"></a>

[![Download for Node.js][node-shield]][node-url]
[![Download for npm][npm-shield]][npm-url]

### Setup a Node.js environment with version 23.0.0 <a id="setup-a-nodejs-environment-with-version-2300"></a>

- [![Download for Node.js][node-shield]][node-url]

  Download and install Node.js from the [official website](https://nodejs.org/en/download/). Make sure to use version 23.0.0 or later.

### Setup npm <a id="setup-npm"></a>

- [![Download for npm][npm-shield]][npm-url]

  NPM is included with Node.js, so you don't need to install it separately. However, you can check the version of npm installed by running:

  ```bash
  npm -v
  ```

  If you need to update npm, you can run:

  ```bash
  npm install -g npm@latest
  ```

[node-shield]: https://img.shields.io/badge/node.js-23.0.0-339933?style=for-the-badge&logo=node.js&logoColor=&labelColor=EBDBE2&color=339933
[node-url]: https://nodejs.org/en/download/
[npm-shield]: https://img.shields.io/badge/npm-11.1.0-CB3837?style=for-the-badge&logo=npm&logoColor=red&labelColor=EBDBE2&color=CB3837
[npm-url]: https://www.npmjs.com/package/npm

## Run Web / Electron <a id="run-web--electron"></a>

- Install dependencies:

  ```bash
  npm install
  ```

- Start React Web app:

  ```bash
  npm start
  ```

- Start Electron app in development mode (starts CRA + Electron together):

  ```bash
  npm run start:electron
  ```

- You can also use the explicit web command:

  ```bash
  npm run start:web
  ```

- Build React Web bundle:

  ```bash
  npm run build
  # or: npm run build:web
  ```

- Build Electron desktop packages:

  ```bash
  npm run build:electron
  npm run build:electron:mac
  npm run build:electron:win
  npm run build:electron:linux
  ```
