import React, { useEffect, useState, useCallback, useContext } from "react";
import { UNIQUE_KEY, RETITLE_TURNS } from "../../DATA_MANAGERs/root_consts";
import { LOADING_TAG } from "../../BUILTIN_COMPONENTs/markdown/const";

import { RootDataContexts } from "./root_data_contexts";
import { RootStatusContexts } from "./root_status_contexts";
import { RootConfigContexts } from "../root_config_manager/root_config_contexts";

import Control_Panel from "../../COMPONENTs/control_panel/control_panel";

const RootDataManager = () => {
  const { instructions } = useContext(RootConfigContexts);

  const [componentOnFocus, setComponentOnFocus] = useState("");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  /* { Model Related } ------------------------------------------------------------------------------- */
  const [modelOnTask, setModelOnTask] = useState(null);
  const [selectedModel, setSelectedModel] = useState("deepseek-r1:14b");
  /* { Model Related } ------------------------------------------------------------------------------- */

  /* { Local Storage } ------------------------------------------------------------------------------- */
  const [addressBook, setAddressBook] = useState({ avaliable_addresses: [] });
  const [sectionData, setSectionData] = useState({});
  /* { load from local storage } */
  useEffect(() => {
    try {
      load_from_local_storage();
    } catch (error) {
      console.error("Error loading from local storage:", error);
      localStorage.clear();
    }
  }, []);
  const check_if_address_existed = (address) => {
    return address in addressBook;
  };
  const generate_new_address = () => {
    let generated_address =
      Math.random().toString(36).substring(2) +
      new Date().getTime().toString(36);
    while (check_if_address_existed(generated_address)) {
      generated_address =
        Math.random().toString(36).substring(2) +
        new Date().getTime().toString(36);
    }
    return generated_address;
  };
  const load_from_local_storage = () => {
    const address_book = JSON.parse(
      localStorage.getItem(UNIQUE_KEY + "address_book") || "{}"
    );
    if (
      address_book &&
      address_book.avaliable_addresses &&
      address_book.avaliable_addresses[0]
    ) {
      const section_data = JSON.parse(
        localStorage.getItem(UNIQUE_KEY + address_book.avaliable_addresses[0])
      );
      if (section_data) {
        setSectionData(section_data);
        setSectionStarted(true);
      } else {
        start_new_section();
      }
      setAddressBook(address_book);
    } else {
      start_new_section();
      setAddressBook({ avaliable_addresses: [] });
    }
  };
  const save_to_local_storage = () => {
    setSectionData((prev) => {
      localStorage.setItem(UNIQUE_KEY + prev.address, JSON.stringify(prev));
      return prev;
    });
    setAddressBook((prev) => {
      localStorage.setItem(UNIQUE_KEY + "address_book", JSON.stringify(prev));
      return prev;
    });
  };
  /* { Local Storage } -------------------------------------------------------------------------------- */

  /* { Section Data } --------------------------------------------------------------------------------- */
  const [sectionStarted, setSectionStarted] = useState(false);
  const start_new_section = () => {
    const generated_address = generate_new_address();
    setSectionData({
      address: generated_address,
      n_turns_to_regenerate_title: 0,
      last_edit_date: new Date().getTime(),
      messages: [],
    });
    setSectionStarted(false);
  };
  const load_section_data = (target_address) => {
    const section_data = JSON.parse(
      localStorage.getItem(UNIQUE_KEY + target_address)
    );
    if (section_data) {
      setSectionData(section_data);
      setSectionStarted(true);
    }
  };
  const append_message = (target_address, message) => {
    setSectionData((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
      n_turns_to_regenerate_title: Math.max(
        prev.n_turns_to_regenerate_title - 1,
        0
      ),
    }));
    update_address_book();
    setSectionStarted(true);
  };
  const update_latest_message = (target_address, message) => {
    setSectionData((prev) => {
      if (target_address !== prev.address) {
        return prev;
      }
      let updated_messages = [...prev.messages];
      let message_to_append = message;
      message_to_append.expanded =
        updated_messages[updated_messages.length - 1].expanded || true;
      updated_messages[updated_messages.length - 1] = message_to_append;
      return {
        ...prev,
        messages: updated_messages,
      };
    });
  };
  const update_title = (target_address, title) => {
    setAddressBook((prev) => {
      let newAddressBook = { ...prev };
      newAddressBook[target_address] = {
        chat_title: title,
      };
      return newAddressBook;
    });
  };
  const set_expand_section_message = (message_index, isExpanded) => {
    setSectionData((prev) => {
      let updated_messages = [...prev.messages];
      updated_messages[message_index] = {
        ...updated_messages[message_index],
        expanded: isExpanded,
      };
      return {
        ...prev,
        messages: updated_messages,
      };
    });
  };
  const update_address_book = useCallback(() => {
    setAddressBook((prev) => {
      let newAddressBook = { ...prev };
      let avaliable_addresses = newAddressBook.avaliable_addresses || [];
      if (!avaliable_addresses.includes(sectionData.address)) {
        avaliable_addresses.push(sectionData.address);
      } else {
        avaliable_addresses = avaliable_addresses.filter(
          (address) => address !== sectionData.address
        );
        avaliable_addresses.unshift(sectionData.address);
      }
      newAddressBook.avaliable_addresses = avaliable_addresses;
      return newAddressBook;
    });
  }, [sectionData, addressBook]);
  const delete_address_in_local_storage = (target_address) => {
    localStorage.removeItem(UNIQUE_KEY + target_address);
    setAddressBook((prev) => {
      let newAddressBook = { ...prev };
      delete newAddressBook[target_address];
      let avaliable_addresses = newAddressBook.avaliable_addresses || [];
      newAddressBook.avaliable_addresses = avaliable_addresses.filter(
        (address) => address !== target_address
      );
      localStorage.setItem(
        UNIQUE_KEY + "address_book",
        JSON.stringify(newAddressBook)
      );
      return newAddressBook;
    });
    start_new_section();
  };
  const reset_regenerate_title_count_down = useCallback(() => {
    setSectionData((prev) => ({
      ...prev,
      n_turns_to_regenerate_title: RETITLE_TURNS,
    }));
  }, []);
  useEffect(() => {
    save_to_local_storage();
  }, [sectionData, addressBook]);
  /* { Section Data } --------------------------------------------------------------------------------- */

  /* { Ollama APIs } ---------------------------------------------------------------------------------- */
  const generate_llm_message_on_index = async (
    target_address,
    messages,
    index
  ) => {
    const preprocess_messages = (messages, memory_length) => {
      let processed_messages = [];

      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "system") {
          processed_messages.push({
            role: messages[i].role,
            content: messages[i].content,
          });
        } else if (messages.length - i <= memory_length) {
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
        think_section_expanded: true,
      });
    } else if (index < 0 || index >= messages.length) {
      return;
    }
    const processed_messages = preprocess_messages(messages, 8);
    setModelOnTask("generating");
    try {
      const request = {
        model: selectedModel,
        messages: processed_messages,
      };
      const response = await fetch(`http://localhost:11434/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      if (!response.body) {
        console.error("No response body received from Ollama.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedResponse = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        try {
          const jsonChunk = JSON.parse(chunk);
          if (jsonChunk.message && jsonChunk.message.content) {
            accumulatedResponse += jsonChunk.message.content;
            update_latest_message(target_address, {
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
      setModelOnTask(null);
      return {
        role: "assistant",
        message: accumulatedResponse,
        content: accumulatedResponse,
      };
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
      setModelOnTask(null);
    }
  };
  const chat_room_title_generation = async (address, messages) => {
    const preprocess_messages = (messages, memory_length) => {
      let processed_messages = instructions.chat_room_title_generation_prompt;

      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "user") {
          processed_messages +=
            messages[i].role + ": " + messages[i].content + "\n\n\n";
        }
      }
      return processed_messages;
    };
    let prompt = preprocess_messages(messages, 7);
    setModelOnTask("naming the chat room");
    try {
      const request = {
        model: selectedModel,
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
      update_title(address, title);
      setModelOnTask(null);
      return title;
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
      setModelOnTask(null);
    }
  };
  /* { Ollama APIs } ---------------------------------------------------------------------------------- */

  /* { Event Listener } ------------------------------------------------------------------------------- */
  /* { window size listener } */
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  /* { Event Listener } ------------------------------------------------------------------------------- */

  return (
    <RootDataContexts.Provider
      value={{
        addressBook,
        sectionData,
        sectionStarted,
        selectedModel,

        append_message,
        chat_room_title_generation,
        delete_address_in_local_storage,
        load_section_data,
        reset_regenerate_title_count_down,
        set_expand_section_message,
        setSelectedModel,
        start_new_section,
        update_title,

        /* { Ollama APIs } ----------------------- */
        generate_llm_message_on_index,
        /* { Ollama APIs } ----------------------- */
      }}
    >
      <RootStatusContexts.Provider
        value={{
          /* { UI Related Status } ============================================================================= */
          /* { which UI component is selected } */
          componentOnFocus,
          setComponentOnFocus,
          /* { window width } */
          windowWidth,
          /* { UI Related Status } ============================================================================= */

          /* { Model Related Status } ========================================================================== */
          /* { indicate current model working on task } */
          modelOnTask,
          setModelOnTask,
          /* { Model Related Status } ========================================================================== */
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          onClick={() => {
            setComponentOnFocus("");
          }}
        >
          <Control_Panel />
        </div>
      </RootStatusContexts.Provider>
    </RootDataContexts.Provider>
  );
};

export default RootDataManager;
