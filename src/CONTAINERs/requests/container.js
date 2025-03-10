import React, { useState, useContext } from "react";

import { task_descriptions } from "./constants";
import {
  chat_room_title_generation_prompt,
  vision_prompt,
} from "./default_instructions";

import { StatusContexts } from "../status/contexts";
import { RequestContexts } from "./contexts";

import { available_vision_models } from "../../COMPONENTs/settings/ollama";

const RequestContainer = ({ children }) => {
  const [instructions, setInstructions] = useState({
    chat_room_title_generation_prompt: chat_room_title_generation_prompt,
  });
  const { setOllamaOnTask } = useContext(StatusContexts);

  /* { Ollama APIs } ---------------------------------------------------------------------------------- */
  const force_stop_ollama = () => {
    setOllamaOnTask(`force_stop|[🔌unplugged...]`);
  };
  const ollama_get_version = async () => {
    try {
      const response = await fetch(`http://localhost:11434/api/version`);
      if (!response.ok) {
        console.error("API request failed:", response.statusText);
        return;
      }
      const data = await response.json();
      if (!data || !data.version) {
        console.error("Invalid API response:", data);
        return;
      }
      return data.version;
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  const ollama_chat_completion_streaming = async (
    model,
    target_address,
    messages,
    index,
    update_message_on_index,
    system_message = "",
    user_addition_message = ""
  ) => {
    const preprocess_messages = (messages, memory_length, index) => {
      let range = index;
      if (index === -1) range = messages.length;

      let processed_messages = [];
      if (system_message && system_message.length > 0) {
        processed_messages.push({
          role: "system",
          content: system_message,
        });
      }

      for (let i = 0; i < range; i++) {
        if (messages[i].role === "system") {
          processed_messages.push({
            role: messages[i].role,
            content: messages[i].content,
          });
        } else if (range - i <= memory_length) {
          processed_messages.push({
            role: messages[i].role,
            content: messages[i].content,
          });
        }
      }
      if (user_addition_message && user_addition_message.length > 0) {
        processed_messages[processed_messages.length - 1].content +=
          "\n\n" + user_addition_message;
      }
      return processed_messages;
    };
    const processed_messages = preprocess_messages(messages, 8, index);
    setOllamaOnTask(
      `chat_completion_streaming|[${model} ${
        task_descriptions.chat_completion_streaming[
          Math.floor(
            Math.random() * task_descriptions.chat_completion_streaming.length
          )
        ]
      }]`
    );
    try {
      const request = {
        model: model,
        messages: processed_messages,
      };
      const abortController = new AbortController();
      const signal = abortController.signal;
      const response = await fetch(`http://localhost:11434/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.body) {
        console.error("No response body received from Ollama.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedResponse = "";
      let end = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setOllamaOnTask((prev) => {
          if (prev && prev.includes("force_stop")) {
            end = true;
          }
          return prev;
        });
        if (end) {
          abortController.abort();
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        try {
          const jsonChunk = JSON.parse(chunk);
          if (jsonChunk.message && jsonChunk.message.content) {
            accumulatedResponse += jsonChunk.message.content;
            update_message_on_index(target_address, index, {
              role: "assistant",
              message: accumulatedResponse,
              content: accumulatedResponse,
            });
          }
          if (jsonChunk.done) break;
        } catch (error) {
          console.error("Error parsing stream chunk:", error);
        }
      }
      setOllamaOnTask(null);
      return {
        role: "assistant",
        message: accumulatedResponse,
        content: accumulatedResponse,
      };
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
      setOllamaOnTask(null);
    }
  };
  const ollama_update_title_no_streaming = async (
    model,
    address,
    messages,
    update_title
  ) => {
    const preprocess_messages = (messages) => {
      let processed_messages = instructions.chat_room_title_generation_prompt;

      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "user") {
          processed_messages +=
            messages[i].role + ": " + messages[i].content + "\n\n\n";
        }
      }
      return processed_messages;
    };
    let prompt = preprocess_messages(messages);
    setOllamaOnTask(
      `generate_no_streaming|[${model} is brainstorming an chat title...]`
    );
    try {
      const request = {
        model: model,
        prompt: prompt,
        stream: false,
        format: {
          type: "object",
          properties: {
            title: {
              type: "string",
            },
          },
          required: ["title"],
        },
      };
      const response = await fetch(`http://localhost:11434/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        console.error("API request failed:", response.statusText);
        return;
      }

      const data = await response.json();
      if (!data || !data.response) {
        console.error("Invalid API response:", data);
        return;
      }
      const title = JSON.parse(data.response).title;
      if (title || title.length > 0) {
        update_title(address, title);
      }
      setOllamaOnTask(null);
      return title;
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
      setOllamaOnTask(null);
    }
  };
  const ollama_list_available_models = async () => {
    const check_is_vision_model = (model_name) => {
      for (let model_family of available_vision_models) {
        for (let model of model_family.models) {
          if (model_name.includes(model.name)) {
            return true;
          }
        }
      }
      return false;
    };
    try {
      const response = await fetch(`http://localhost:11434/api/tags`);
      if (!response.ok) {
        console.error("API request failed:", response.statusText);
        return;
      }
      const data = await response.json();
      if (!data || !data.models) {
        console.error("Invalid API response:", data);
        return;
      }
      let avaliableModels = [];
      let all_vision_models = [];
      for (let model_family of available_vision_models) {
        all_vision_models.push(model_family.family_name);
      }

      for (let model of data.models) {
        if (check_is_vision_model(model.model)) {
          continue;
        }
        avaliableModels.push(model.model);
      }
      return avaliableModels;
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  const ollama_delete_local_model = async (model) => {
    try {
      const response = await fetch(`http://localhost:11434/api/delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        console.error(
          "API request failed:",
          response.status,
          response.statusText
        );
        return;
      }

      const text = await response.text();
      if (!text) {
        console.log("API returned no content, deletion might be successful.");
        return "Model deleted successfully";
      }

      const data = JSON.parse(text);
      return data.message ?? "Model deleted successfully";
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  const ollama_pull_cloud_model = async (model, setStatus) => {
    try {
      const response = await fetch("http://localhost:11434/api/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        const jsonObjects = chunk
          .trim()
          .split("\n")
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        jsonObjects.forEach((entry) => {
          if (entry.total && entry.completed) {
            const percent = Math.round((entry.completed / entry.total) * 100);
            setStatus({
              model: model,
              percentage: percent,
              done: false,
            });
          }
        });
      }
    } catch (error) {
      console.error("Error pulling model:", error);
    }
  };
  const ollama_image_to_text = async (base64Images, messages) => {
    const ollama_image_to_text_single = async (base64Image, user_message) => {
      const cleanedBase64Image = base64Image
        .replace(/^data:image\/[a-z]+;base64,/, "")
        .trim();

      if (!cleanedBase64Image) {
        console.error("Invalid base64 format:", base64Image);
        return;
      }

      const apiUrl = "http://localhost:11434/api/generate";

      const requestBody = {
        model: "llava",
        prompt: vision_prompt.to_image_model + user_message,
        images: [cleanedBase64Image],
        stream: false,
      };

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });
        const responseText = await response.text();

        try {
          const data = JSON.parse(responseText);
          return data.response;
        } catch (jsonError) {
          console.error("Response is not valid JSON. Error:", jsonError);
          return null;
        }
      } catch (error) {
        console.error("Fetch error:", error);
        return null;
      }
    };
    const user_message = messages[messages.length - 1].content;

    const responses = [];
    let image_index = 1;

    setOllamaOnTask(
      `image_to_text|[🌋 LLaVA ${task_descriptions.image_to_text[0]}]`
    );
    for (const base64Image of base64Images) {
      const text = await ollama_image_to_text_single(base64Image, user_message);
      responses.push(`image ${image_index}: ${text}`);
      image_index++;
    }
    setOllamaOnTask(null);
    return responses.join("\n");
  };
  /* { Ollama APIs } ---------------------------------------------------------------------------------- */

  /* { GitHub APIs } ---------------------------------------------------------------------------------- */
  const github_search_repo_by_keyword = async (keyword) => {
    // returns a list of available repositories
  };
  const github_get_repo_info = async (repo) => {
    // returns the repository information (like language, stars, forks, etc.)
  };
  const github_get_repo_readme = async (repo) => {
    // returns the README.md content of the repository
  };
  const github_get_repo_files = async (repo) => {
    // returns a root tree of files in the repository
  };
  const github_get_repo_file_content = async (repo, file_path) => {
    // returns the content of the file in the repository
  };
  /* { GitHub APIs } ---------------------------------------------------------------------------------- */

  return (
    <RequestContexts.Provider
      value={{
        force_stop_ollama,

        ollama_get_version,
        ollama_chat_completion_streaming,
        ollama_update_title_no_streaming,
        ollama_list_available_models,
        ollama_delete_local_model,
        ollama_pull_cloud_model,
        ollama_image_to_text,
      }}
    >
      {children}
    </RequestContexts.Provider>
  );
};

export default RequestContainer;
