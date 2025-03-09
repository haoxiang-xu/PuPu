const available_large_language_models = [
  {
    family_name: "deepseek",
    models: [
      {
        name: "deepseek-r1",
        type: "language",
        description:
          "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, " +
          "including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
        available_options: [
          { name: "1.5b", download_id: "deepseek-r1:1.5b" },
          { name: "7b", download_id: "deepseek-r1:7b" },
          { name: "8b", download_id: "deepseek-r1:8b" },
          { name: "14b", download_id: "deepseek-r1:14b" },
          { name: "32b", download_id: "deepseek-r1:32b" },
          { name: "70b", download_id: "deepseek-r1:70b" },
          { name: "671b", download_id: "deepseek-r1:671b" },
        ],
      },
      {
        name: "deepseek-coder-v2",
        type: "language",
        description:
          "An open-source Mixture-of-Experts code language model that achieves performance comparable to GPT4-Turbo in code-specific tasks.",
        available_options: [
          { name: "16b", download_id: "deepseek-coder-v2:16b" },
          { name: "32b", download_id: "deepseek-coder-v2:32b" },
        ],
      },
    ],
  },
  {
    family_name: "phi",
    models: [
      {
        name: "phi4",
        type: "language",
        description:
          "Phi-4 is a 14B parameter, state-of-the-art open model from Microsoft.",
        available_options: [{ name: "14b", download_id: "phi4" }],
      },
    ],
  },
  {
    family_name: "llama",
    models: [
      {
        name: "llama3.1",
        type: "language",
        description:
          "Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.",
        available_options: [
          { name: "8b", download_id: "llama3.1:8b" },
          { name: "70b", download_id: "llama3.1:70b" },
          { name: "405b", download_id: "llama3.1:405b" },
        ],
      },
      {
        name: "codellama",
        type: "language",
        description:
          "A large language model that can use text prompts to generate and discuss code.",
        available_options: [
          { name: "7b", download_id: "codellama:7b" },
          { name: "13b", download_id: "codellama:13b" },
          { name: "34b", download_id: "codellama:34b" },
          { name: "70b", download_id: "codellama:70b" },
        ],
      },
    ],
  },
  {
    family_name: "mistral",
    models: [
      {
        name: "mistral",
        type: "language",
        description:
          "The 7B model released by Mistral AI, updated to version 0.3.",
        available_options: [{ name: "7b", download_id: "mistral:7b" }],
      },
    ],
  },
  {
    family_name: "qwen",
    models: [
      {
        name: "qwq",
        type: "language",
        description: "QwQ is the reasoning model of the Qwen series.",
        available_options: [{ name: "32b", download_id: "qwq:32b" }],
      },
      {
        name: "qwen2.5",
        type: "language",
        description:
          "Qwen2.5 models are pretrained on Alibaba's latest large-scale dataset, encompassing up to 18 trillion tokens. " +
          "The model supports up to 128K tokens and has multilingual support.",
        available_options: [
          { name: "0.5b", download_id: "qwen2.5:0.5b" },
          { name: "1.5b", download_id: "qwen2.5:1.5b" },
          { name: "3b", download_id: "qwen2.5:3b" },
          { name: "7b", download_id: "qwen2.5:7b" },
          { name: "14b", download_id: "qwen2.5:14b" },
          { name: "32b", download_id: "qwen2.5:32b" },
          { name: "72b", download_id: "qwen2.5:72b" },
        ],
      },
      {
        name: "qwen2.5-coder",
        type: "language",
        description:
          "The latest series of Code-Specific Qwen models, with significant improvements in code generation, code reasoning, and code fixing.",
        available_options: [
          { name: "0.5b", download_id: "qwen2.5-coder:0.5b" },
          { name: "1.5b", download_id: "qwen2.5-coder:1.5b" },
          { name: "3b", download_id: "qwen2.5-coder:3b" },
          { name: "7b", download_id: "qwen2.5-coder:7b" },
          { name: "14b", download_id: "qwen2.5-coder:14b" },
          { name: "32b", download_id: "qwen2.5-coder:32b" },
        ],
      },
      {
        name: "qwen",
        type: "language",
        description:
          "Qwen 1.5 is a series of large language models by Alibaba Cloud spanning from 0.5B to 110B parameters.",
        available_options: [
          { name: "0.5b", download_id: "qwen:0.5b" },
          { name: "1.8b", download_id: "qwen:1.8b" },
          { name: "4b", download_id: "qwen:4b" },
          { name: "7b", download_id: "qwen:7b" },
          { name: "14b", download_id: "qwen:14b" },
          { name: "32b", download_id: "qwen:32b" },
          { name: "72b", download_id: "qwen:72b" },
          { name: "110b", download_id: "qwen:110b" },
        ],
      },
    ],
  },
  {
    family_name: "starcoder",
    models: [
      {
        name: "starcoder2",
        type: "language",
        description:
          "StarCoder2 is the next generation of transparently trained open code LLMs that comes in three sizes: 3B, 7B and 15B parameters.",
        available_options: [
          { name: "3b", download_id: "starcoder2:3b" },
          { name: "7b", download_id: "starcoder2:7b" },
          { name: "15b", download_id: "starcoder2:15b" },
        ],
      },
    ],
  },
  {
    family_name: "sqlcoder",
    models: [
      {
        name: "sqlcoder",
        type: "language",
        description:
          "SQLCoder is a code completion model fined-tuned on StarCoder for SQL generation tasks",
        available_options: [
          { name: "7b", download_id: "sqlcoder:7b" },
          { name: "15b", download_id: "sqlcoder:15b" },
        ],
      },
    ],
  },
];
const available_vision_models = [
  {
    family_name: "llava",
    models: [
      {
        name: "llava",
        type: "vision",
        description:
          "🌋 LLaVA is a novel end-to-end trained large multimodal model that combines a vision encoder and Vicuna for general-purpose visual and language understanding. Updated to version 1.6.",
        available_options: [
          { name: "7b", download_id: "llava:7b" },
          { name: "13b", download_id: "llava:13b" },
          { name: "34b", download_id: "llava:34b" },
        ],
      },
    ],
  },
];

export { available_large_language_models, available_vision_models };
