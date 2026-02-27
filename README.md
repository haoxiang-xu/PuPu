<link
  href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
  rel="stylesheet"
></link>

<div align="center">
  <img src="assets/logo.png" alt="PuPu UI" style="height: 128px">
  <h1>PuPu</h1>
  <p>A simple and easy to use UI for the Ollama.</p>
</div>
<br><br><br>

[![Download for Windows][windows-shield]][windows-url]
[![Download for Mac][macos-shield]][macos-url]
[![Download for Linux][linux-shield]][linux-url]


PuPu is a lightweight tool that makes it easy to run AI models on your own device. Designed for smooth performance and ease of use, PuPu is perfect for anyone who wants quick access to AI without technical complexity.

<img src="assets/PuPu_UI.png" alt="PuPu UI 3"/>

## Table of Contents

- [For Users](#for-users)
  - [App installation](#app-installation)
- [For Developers](#for-developers)
  - [Miso Setup](#miso-setup)
  - [Local Setup](#local-setup)
  - [Deployment](#deployment)
  - [Further Development](#further-development)

## For Users <a name="for-users"></a>

### App installation <a name="app-installation"></a>

### Windows

[![Download for Windows][windows-shield]][windows-url]

- Download the `.exe` Windows installer [here](windows-url).
- Run the installer and follow the instructions.
- Once the installation is complete, you can find the app in the start menu.

### Mac

[![Download for Mac][macos-shield]][macos-url]

- Download the `.dmg` Mac installer [here](macos-url).
- Open the downloaded file and drag the app to the Applications folder.
- Once the installation is complete, you can find the app in the Applications folder.

### Linux

[![Download for Linux][linux-shield]][linux-url]

- Download the `.deb` or `.AppImage` file [here](linux-url).
- If you downloaded the `.deb` file, run the following command in the terminal:

```bash
sudo dpkg -i PuPu-0.0.4.deb
```

OR

```bash
sudo apt install ./PuPu-0.0.4.deb
```

- Ensuring Proper Sandbox Permissions: <span style="opacity: 0.32">If you encounter an error message about sandbox permissions, you can run the following command:</span>

```bash
sudo chown root:root /opt/PuPu/chrome-sandbox
sudo chmod 4755 /opt/PuPu/chrome-sandbox
```

## For Developers <a name="for-developers"></a>

### Miso Setup <a name="miso-setup"></a>

PuPu starts a local Miso sidecar process when running the Electron app.

In development, PuPu looks for a valid Miso source in this order:
1. `MISO_SOURCE_PATH` (if set)
2. sibling folder `../miso`

A valid Miso source must contain:
- `miso/__init__.py`
- `miso/broth.py`

Recommended setup:

1. Put the Miso repo next to PuPu:

```bash
# parent folder of PuPu
cd ..
git clone <your-miso-repo-url> miso
cd PuPu
```

2. Create a Python environment for the PuPu sidecar runtime:

```bash
python3 -m venv ./.venv
source ./.venv/bin/activate
# Windows: .\\.venv\\Scripts\\activate
pip install -r ./miso_runtime/server/requirements.txt
```

3. Install dependencies for your Miso repo (inside `../miso`) based on that repo's instructions.

4. Configure Miso runtime environment variables (examples):

```bash
# optional if your miso repo is already at ../miso
export MISO_SOURCE_PATH=/absolute/path/to/miso

# optional override for Python executable used to launch miso sidecar
export MISO_PYTHON_BIN=/absolute/path/to/python

# optional (default: ollama)
export MISO_PROVIDER=ollama

# optional (provider-specific default will be used if omitted)
export MISO_MODEL=deepseek-r1:14b

# required when MISO_PROVIDER is openai or anthropic
export MISO_API_KEY=<your_api_key>
# or use provider-specific keys:
# export OPENAI_API_KEY=<your_api_key>
# export ANTHROPIC_API_KEY=<your_api_key>
```

Quick checks:
- If `MISO_PROVIDER=ollama`, ensure Ollama is running and the selected model is installed.
- Start PuPu with `npm start` and confirm Miso status in the app is `ready`.

### Local Setup <a name="local-setup"></a>

- Install dependencies: <span style="opacity: 0.32">To run the electron app locally, you need to install the dependencies by running the following command:</span>

  - windows might require extra steps to install the node-gyp dependencies, you can follow the instructions [here](./docs/setup_guide/node_gyp_setup_guide.md).

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

### Further Development <a name="further-development"></a>

- To further develop the app, you can refer to the [development guide](./docs/development/development.md).

[windows-shield]: https://img.shields.io/badge/download_for_windows-EBDBE2?style=for-the-badge&logo=windows&logoColor=FFFFFF&labelColor=FFFFFF
[windows-url]: https://github.com/haoxiang-xu/PuPu/releases/tag/v0.0.3
[macos-shield]: https://img.shields.io/badge/download_for_mac-EBDBE2?style=for-the-badge&logo=apple&logoColor=000000&labelColor=EBDBE2
[macos-url]: https://github.com/haoxiang-xu/PuPu/releases/tag/v0.0.3
[linux-shield]: https://img.shields.io/badge/download_for_linux-EBDBE2?style=for-the-badge&logo=linux&logoColor=000000&labelColor=EBDBE2
[linux-url]: https://github.com/haoxiang-xu/PuPu/releases/tag/v0.0.3
