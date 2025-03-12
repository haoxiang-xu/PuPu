const task_descriptions = {
  chat_completion_streaming: [
    "is diving into the neural abyss...🌌",
    "is crafting your masterpiece...🛠️",
    "is pondering the universe...🧠",
    "is brewing something magical...🧙‍♂️",
    "is thinking… 🤔",
  ],
  image_to_text: [
    "is deciphering the image...🔍",
    "is translating the image...🔠",
    "is reading the image...📖",
    "is analyzing the image...🔬",
    "is decoding the image...🔢",
  ],
};
const request_url = {
  chat_completion: { ollama: `http://localhost:11434/api/chat` },
  title_generation: { ollama: `http://localhost:11434/api/generate` },
  image_to_text: { ollama: `http://localhost:11434/api/generate` },
};

export { task_descriptions, request_url };
