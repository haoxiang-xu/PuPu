const await_Ollama_setup_warning = `
## ⚠️ Ollama is not running or installed yet!

---

If you have not installed Ollama, please follow the instructions below to install it.
<br><br>
[Install Ollama Guide](#install-ollama)

OR

If you have already installed Ollama, please restart the server.
<br><br>
[Start Ollama Guide](#start-ollama)
<br><br><br><br>


<a name="install-ollama"> </a>
## Install Ollama

---

### 🚀 Step1. Install Ollama 
For macOS & Linux:<br><br>
Runing the following command in your terminal:
\`\`\`shell
curl -sSL https://ollama.ai/install.sh | bash
\`\`\`
For Windows: <br><br>
👉 Go to [Ollama's official website](https://ollama.com/) and download the Windows installer (.exe file).

### 🔥 Step2. Verify Installation
\`\`\`shell
ollama
\`\`\`

### 📥 Step 3: Download a Model
Ollama needs a model to run. Download a model like Deepseek, Llama 3, or others by running:
\`\`\`shell
ollama run deepseek-r1:7b
\`\`\`

OR

\`\`\`shell
ollama run llama3.3
\`\`\`

### 🚀 Step 4: 🎉 You're Done!
You now have Ollama running on your machine. Click the <br>\` I am ready! \`<br> button below, the system will check if Ollama is installed and ready to use.
<br><br><br><br>

<a name="start-ollama"> </a>
## Start Ollama

---
Open Terminal 🖥️ and run the following command:
\`\`\`shell
ollama server
\`\`\`

OR simply run the Ollama application.


`;

export { await_Ollama_setup_warning };
