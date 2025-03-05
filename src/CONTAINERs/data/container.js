import React, { useEffect, useState, useCallback, useContext } from "react";
import { UNIQUE_KEY, RETITLE_TURNS } from "../root_consts";

import { StatusContexts } from "../status/contexts";
import { RequestContexts } from "../requests/contexts";
import { DataContexts } from "./contexts";

import Chat_Page from "../../PAGEs/chat_page/chat_page";
import ScaleLoader from "react-spinners/ScaleLoader";
import Side_Menu from "../../COMPONENTs/side_menu/side_menu";
import Title_Bar from "../../COMPONENTs/title_bar/title_bar";
import Dialog from "../../COMPONENTs/dialog/dialog";

const DataContainer = () => {
  const {
    setComponentOnFocus,
    ollamaServerStatus,
    setOllamaServerStatus,
    /* { pending delete models } */
    ollamaPendingDeleteModels,
    setOllamaPendingDeleteModels,
    /* { pending download models } */
    ollamaPendingDownloadModels,
    setOllamaPendingDownloadModels,
    /* { installing status } */
    setOllamaInstallingStatus,
  } = useContext(StatusContexts);
  const {
    ollama_get_version,
    ollama_list_available_models,
    ollama_delete_local_model,
    ollama_pull_cloud_model,
  } = useContext(RequestContexts);

  /* { Model Related } ------------------------------------------------------------------------------- */
  const [selectedModel, setSelectedModel] = useState(null);
  const [avaliableModels, setAvaliableModels] = useState([]);
  useEffect(() => {
    if (!selectedModel || !avaliableModels.includes(selectedModel)) {
      setSelectedModel(avaliableModels[0]);
    }
  }, [selectedModel, avaliableModels]);
  /* { Model Related } ------------------------------------------------------------------------------- */

  /* { Local Storage } ------------------------------------------------------------------------------- */
  const [addressBook, setAddressBook] = useState({ avaliable_addresses: [] });
  const [sectionData, setSectionData] = useState({});

  /* { load from local storage } */
  useEffect(() => {
    app_initialization();
  }, []);
  const app_initialization = () => {
    try {
      load_from_local_storage();
      ollama_get_version().then((version) => {
        if (!version) {
          setOllamaServerStatus(false);
          return false;
        } else {
          setTimeout(() => {
            setOllamaServerStatus(true);
          }, 1000);
          load_models();
          return true;
        }
      });
    } catch (error) {
      console.error("Error loading from local storage:", error);
      localStorage.clear();
    }
  };
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
  const load_models = () => {
    try {
      let selected_model = localStorage.getItem(UNIQUE_KEY + "selected_model");
      if (!selected_model) {
        selected_model = JSON.parse(selected_model);
      }
      ollama_list_available_models().then((response) => {
        if (response.includes(selected_model)) {
          setSelectedModel(selected_model);
        } else {
          setSelectedModel(response[0]);
        }
        setAvaliableModels(response);
      });
    } catch (error) {
      console.error("Error loading models:", error);
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
    setSelectedModel((prev) => {
      localStorage.setItem(UNIQUE_KEY + "selected_model", JSON.stringify(prev));
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
      on_mode: "chat",
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
    if (target_address !== sectionData.address) {
      return;
    }
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
  const update_message_on_index = (target_address, message_index, message) => {
    setSectionData((prev) => {
      let index = message_index;
      if (index === -1) {
        index = prev.messages.length - 1;
      } else if (index < 0 || index >= prev.messages.length) {
        return prev;
      }
      let message_to_append = message;
      message_to_append.expanded = prev.messages[index].expanded || true;
      if (target_address !== prev.address) {
        return prev;
      }
      let updated_messages = [...prev.messages];
      updated_messages[index] = message_to_append;
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
  const trigger_section_mode = (mode) => {
    setSectionData((prev) => {
      let updated_section = { ...prev };
      if (updated_section.on_mode === mode) {
        updated_section.on_mode = "chat";
        return updated_section;
      } else {
        updated_section.on_mode = mode;
        return updated_section;
      }
    });
  };
  const save_input_images = (target_address, images) => {
    let saved_keys = [];
    setSectionData((prev) => {
      const index_to_save = prev.messages.length - 1;
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const image_key = target_address + "_" + (index_to_save + 1) + "_" + i;
        localStorage.setItem(UNIQUE_KEY + image_key, image);
        saved_keys.push(image_key);
      }
      return prev;
    });
    return saved_keys;
  };
  const load_saved_images = (target_address, message_index, image_addresses) => {
    let loaded_images = [];
    for (let i = 0; i < image_addresses.length; i++) {
      const image_key = image_addresses[i];
      const image = localStorage.getItem(UNIQUE_KEY + image_key);
      if (image) {
        loaded_images.push(image);
      }
    }
    return loaded_images;
  };
  useEffect(() => {
    save_to_local_storage();
  }, [sectionData, addressBook, selectedModel]);
  /* { Section Data } --------------------------------------------------------------------------------- */

  /* { Model Data } ----------------------------------------------------------------------------------- */
  useEffect(() => {
    if (ollamaPendingDeleteModels.length === 0) {
      return;
    }
    ollama_delete_local_model(ollamaPendingDeleteModels[0]).then((response) => {
      ollama_list_available_models().then((response) => {
        setAvaliableModels(response);
        setOllamaPendingDeleteModels((prev) => {
          let new_list = [...prev];
          new_list.shift();
          return new_list;
        });
      });
    });
  }, [ollamaPendingDeleteModels]);
  useEffect(() => {
    if (ollamaPendingDownloadModels.length === 0) {
      return;
    }
    setOllamaInstallingStatus({
      model: ollamaPendingDownloadModels[0],
      percentage: 0,
      done: false,
    });
    ollama_pull_cloud_model(
      ollamaPendingDownloadModels[0],
      setOllamaInstallingStatus
    )
      .then((response) => {
        ollama_list_available_models().then((response) => {
          setAvaliableModels(response);
          setOllamaPendingDownloadModels((prev) => {
            let new_list = [...prev];
            new_list.shift();
            return new_list;
          });
        });
      })
      .finally(() => {
        setOllamaInstallingStatus(null);
      });
  }, [ollamaPendingDownloadModels]);
  /* { Model Data } ----------------------------------------------------------------------------------- */

  return (
    <DataContexts.Provider
      value={{
        addressBook,
        sectionData,
        sectionStarted,
        selectedModel,
        avaliableModels,
        setAvaliableModels,

        app_initialization,
        append_message,
        delete_address_in_local_storage,
        load_section_data,
        reset_regenerate_title_count_down,
        set_expand_section_message,
        setSelectedModel,
        start_new_section,
        update_title,
        update_message_on_index,
        append_message,
        trigger_section_mode,
        save_input_images,
        load_saved_images,
      }}
    >
      {!ollamaServerStatus ? null : (
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
          <Chat_Page />
        </div>
      )}
      {ollamaServerStatus === null ? (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.32,
          }}
        >
          <ScaleLoader color={"#cccccc"} size={12} margin={1} />
        </div>
      ) : null}
      <Dialog />
      <Title_Bar />
      {ollamaServerStatus === true ? <Side_Menu /> : null}
    </DataContexts.Provider>
  );
};

export default DataContainer;
