import React, { useEffect, useState, useCallback, useContext } from "react";

import { LOADING_TAG } from "../../BUILTIN_COMPONENTs/markdown/const";
import { task_descriptions } from "./constants";
import { chat_room_title_generation_prompt } from "./default_instructions";

import { StatusContexts } from "../status/contexts";
import { RequestContexts } from "./contexts";

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
    append_message,
    update_message_on_index
  ) => {
    const preprocess_messages = (messages, memory_length, index) => {
      let range = index;
      if (index === -1) range = messages.length;

      let processed_messages = [];

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
      return processed_messages;
    };
    if (index === -1) {
      append_message(target_address, {
        role: "assistant",
        message: LOADING_TAG,
        content: "",
        expanded: true,
      });
    } else if (index < 0 || index >= messages.length) {
      return;
    } else {
      update_message_on_index(target_address, index, {
        role: "assistant",
        message: LOADING_TAG,
        content: "",
        expanded: true,
      });
    }
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
      for (let model of data.models) {
        avaliableModels.push(model.name);
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
  const ollama_pull_model = async (model) => {};

  /* { Ollama APIs } ---------------------------------------------------------------------------------- */

  return (
    <RequestContexts.Provider
      value={{
        force_stop_ollama,

        ollama_get_version,
        ollama_chat_completion_streaming,
        ollama_update_title_no_streaming,
        ollama_list_available_models,
        ollama_delete_local_model,
      }}
    >
      {children}
    </RequestContexts.Provider>
  );
};

export default RequestContainer;
