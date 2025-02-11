import React, { useEffect, useState, useCallback, useContext } from "react";

import { LOADING_TAG } from "../../BUILTIN_COMPONENTs/markdown/const";

import { StatusContexts } from "../status/contexts";
import { RequestContexts } from "./contexts";

const RequestContainer = ({ children }) => {
  const { setOllamaOnTask } = useContext(StatusContexts);

  /* { Ollama APIs } ---------------------------------------------------------------------------------- */
  const force_stop_ollama = () => {
    setOllamaOnTask(`force_stop|[🔌unplugged...]`);
  };
  const get_ollama_version = async () => {
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
      `chat_completion_streaming|[${model} is diving into the neural abyss...]`
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
  /* { Ollama APIs } ---------------------------------------------------------------------------------- */

  return (
    <RequestContexts.Provider
      value={{
        force_stop_ollama,
        get_ollama_version,
        ollama_chat_completion_streaming,
      }}
    >
      {children}
    </RequestContexts.Provider>
  );
};

export default RequestContainer;
