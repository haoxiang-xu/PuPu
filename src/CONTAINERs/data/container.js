import { useEffect, useState, useCallback, useContext } from "react";
import { RETITLE_TURNS } from "../root_consts";

import { StatusContexts } from "../status/contexts";
import { RequestContexts } from "../requests/contexts";
import { DataContexts } from "./contexts";

import ScaleLoader from "react-spinners/ScaleLoader";
import Side_Menu from "../../COMPONENTs/side_menu/side_menu";
import Title_Bar from "../../COMPONENTs/title_bar/title_bar";
import Dialog from "../../COMPONENTs/dialog/dialog";

import {
  available_large_language_models,
  available_vision_models,
} from "../../COMPONENTs/settings/ollama";

import storage from "../../utils/storage";

const DataContainer = ({ children }) => {
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
  const [avaliableModels, setAvaliableModels] = useState([]);
  const [favouredModels, setFavouredModels] = useState({
    language_models: [],
    vision_model: null,
  });
  useEffect(() => {
    if (!avaliableModels.includes(sectionData.language_model_using)) {
      setSectionData((prev) => ({
        ...prev,
        language_model_using: null,
      }));
    }
    setFavouredModels((prev) => {
      let new_favoured_models = { ...prev };
      if (!new_favoured_models.language_models) {
        new_favoured_models.language_models = [];
      }
      for (let model of new_favoured_models.language_models) {
        if (avaliableModels.includes(model)) {
          continue;
        }
        new_favoured_models.language_models =
          new_favoured_models.language_models.filter((name) => name !== model);
      }
      if (!avaliableModels.includes(new_favoured_models.vision_model)) {
        new_favoured_models.vision_model = null;
      }
      return new_favoured_models;
    });
  }, [avaliableModels]);
  /* { Model Related } ------------------------------------------------------------------------------- */

  /* { Local Storage } ------------------------------------------------------------------------------- */
  const [addressBook, setAddressBook] = useState({ avaliable_addresses: [] });
  const [sectionData, setSectionData] = useState({});

  /* { load from local storage } */
  useEffect(() => {
    const load_from_local_storage = async () => {
      const address_book = await storage.readAddressBook();
      const favoured_models = await storage.readFavouredModels();
      
      if (favoured_models) {
        setFavouredModels(favoured_models);
      } else {
        setFavouredModels({
          language_models: [],
          vision_model: null,
        });
      }
      if (
        address_book &&
        address_book.avaliable_addresses &&
        address_book.avaliable_addresses[0]
      ) {
        const section_data = await storage.readSection(
          address_book.avaliable_addresses[0]
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
      }
    };
    app_initialization();
  }, []);
  /* { save to local storage } */
  useEffect(() => {
    const save_to_local_storage = async () => {
      setSectionData((prev) => {
        if (prev.address) {
          storage.writeSection(prev.address, prev);
        }
        return prev;
      });
      setAddressBook((prev) => {
        storage.writeAddressBook(prev);
        return prev;
      });
      setFavouredModels((prev) => {
        storage.writeFavouredModels(prev);
        return prev;
      });
    };
    save_to_local_storage();
  }, [sectionData, addressBook, favouredModels]);
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
  const load_models = () => {
    try {
      ollama_list_available_models().then((response) => {
        setAvaliableModels(response);
      });
    } catch (error) {
      console.error("Error loading models:", error);
    }
  };
  /* { Local Storage } -------------------------------------------------------------------------------- */

  /* { Section Data } --------------------------------------------------------------------------------- */
  const [sectionStarted, setSectionStarted] = useState(false);
  const start_new_section = useCallback(() => {
    const check_is_language_model = (model_name) => {
      for (let model_family of available_large_language_models) {
        for (let model of model_family.models) {
          if (model_name.includes(model.name)) {
            return true;
          }
        }
      }
      return false;
    };
    const generated_address = generate_new_address();
    for (let model of favouredModels.language_models) {
      if (check_is_language_model(model)) {
        setSectionData({
          address: generated_address,
          n_turns_to_regenerate_title: 0,
          last_edit_date: new Date().getTime(),
          language_model_using: model,
          on_mode: "chat",
          messages: [],
        });
        setSectionStarted(false);
        return;
      }
    }
    setSectionData({
      address: generated_address,
      n_turns_to_regenerate_title: 0,
      last_edit_date: new Date().getTime(),
      language_model_using: null,
      on_mode: "chat",
      messages: [],
    });
    setSectionStarted(false);
  }, [favouredModels]);
  const load_section_data = useCallback(
    async (target_address) => {
      let section_data = await storage.readSection(target_address);
      if (section_data) {
        if (!avaliableModels.includes(section_data.language_model_using)) {
          section_data.language_model_using = null;
        }
        setSectionData(section_data);
        setSectionStarted(true);
      }
    },
    [avaliableModels]
  );
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
  const update_lanaguage_model_using = (target_address, model) => {
    setSectionData((prev) => {
      if (target_address !== prev.address) {
        return prev;
      }
      return {
        ...prev,
        language_model_using: model,
      };
    });
  };
  const update_message_on_index = (target_address, message_index, message) => {
    let updated_messages = [];
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
      updated_messages = [...prev.messages];
      updated_messages[index] = message_to_append;
      return {
        ...prev,
        messages: updated_messages,
      };
    });
    return updated_messages;
  };
  const update_title = (target_address, title) => {
    setAddressBook((prev) => {
      let newAddressBook = { ...prev };
      newAddressBook[target_address] = {
        chat_title: title,
      };
      return newAddressBook;
    });
    setSectionData((prev) => ({
      ...prev,
      n_turns_to_regenerate_title: RETITLE_TURNS,
    }));
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
  const delete_address_in_local_storage = async (target_address) => {
    await storage.deleteSection(target_address);
    await storage.deleteSectionFiles(target_address);
    setAddressBook((prev) => {
      let newAddressBook = { ...prev };
      delete newAddressBook[target_address];
      let avaliable_addresses = newAddressBook.avaliable_addresses || [];
      newAddressBook.avaliable_addresses = avaliable_addresses.filter(
        (address) => address !== target_address
      );
      storage.writeAddressBook(newAddressBook);
      return newAddressBook;
    });
    start_new_section();
  };
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
  const save_input_files = (target_address, files) => {
    let saved_keys = [];
    setSectionData((prev) => {
      const index_to_save = prev.messages.length - 1;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const file_key = target_address + "_" + (index_to_save + 1) + "_" + i;
        storage.saveFile(file_key, file);
        saved_keys.push(file_key);
      }
      return prev;
    });
    return saved_keys;
  };
  const load_saved_files = async (target_address, message_index, file_addresses) => {
    let loaded_images = [];
    for (let i = 0; i < file_addresses.length; i++) {
      const file_key = file_addresses[i];
      const file = await storage.loadFile(file_key);
      if (file) {
        loaded_images.push(file);
      }
    }
    return loaded_images;
  };
  const get_all_available_language_models = useCallback(() => {
    const check_is_language_model = (model_name) => {
      for (let model_family of available_large_language_models) {
        for (let model of model_family.models) {
          if (model_name.includes(model.name)) {
            return true;
          }
        }
      }
      return false;
    };
    let all_models = [];
    for (let model of avaliableModels) {
      if (check_is_language_model(model)) {
        all_models.push(model);
      }
    }

    return all_models;
  }, [avaliableModels]);
  const get_all_available_vision_models = useCallback(() => {
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
    let all_models = [];
    for (let model of avaliableModels) {
      if (check_is_vision_model(model)) {
        all_models.push(model);
      }
    }

    return all_models;
  }, [avaliableModels]);

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
        avaliableModels,
        setAvaliableModels,
        favouredModels,
        setFavouredModels,

        append_message,
        update_lanaguage_model_using,
        delete_address_in_local_storage,
        load_section_data,
        set_expand_section_message,
        start_new_section,
        update_title,
        update_message_on_index,
        append_message,
        trigger_section_mode,
        save_input_files,
        load_saved_files,

        get_all_available_language_models,
        get_all_available_vision_models,
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
          {children}
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
      <Title_Bar />
      {ollamaServerStatus === true ? <Side_Menu /> : null}
      <Dialog />
    </DataContexts.Provider>
  );
};

export default DataContainer;
