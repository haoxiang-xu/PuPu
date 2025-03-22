import React, {
  useState,
  useContext,
  useEffect,
  useRef,
  createContext,
  useCallback,
} from "react";

import { ConfigContexts } from "../../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../../CONTAINERs/status/contexts";
import { DataContexts } from "../../../CONTAINERs/data/contexts";

import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import MoonLoader from "react-spinners/MoonLoader";

import { available_large_language_models } from "../ollama";

const Contexts = createContext("");

/* { Cloud Model List } ------------------------------------------------------------------------------------------------------------------------------ */
const OptionTab = ({ model, option, selectedOption, setSelectedOption }) => {
  const sub_component_name = "available_models_section";
  const { RGB, colorOffset, modelDownloader } = useContext(ConfigContexts);
  const { ItemOnSelect, setItemOnSelect } = useContext(Contexts);

  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        transition: "all 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: 40,
        minWidth: 40,
        height: 24,
        border:
          ItemOnSelect === sub_component_name + model
            ? onHover
              ? modelDownloader.border
              : `1px solid rgba(225, 225, 225, 0)`
            : modelDownloader.border,
        boxSizing: "border-box",

        alignContent: "center",
        justifyContent: "center",
        display: "flex",

        borderRadius: 5,
      }}
      onMouseEnter={() => {
        setOnHover(true);
      }}
      onMouseLeave={() => {
        setOnHover(false);
      }}
      onClick={(e) => {
        setSelectedOption(option);
        if (ItemOnSelect === sub_component_name + model) {
          setItemOnSelect(null);
        } else {
          setItemOnSelect(sub_component_name + model);
        }
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,

          fontSize: 14,
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,

          userSelect: "none",
        }}
      >
        {ItemOnSelect === sub_component_name + model
          ? option.name
          : selectedOption.name}
      </span>
    </div>
  );
};
const ModelTab = ({ model }) => {
  const sub_component_name = "available_models_section";
  const { RGB, colorOffset, modelDownloader, dialog } =
    useContext(ConfigContexts);
  const { avaliableModels } = useContext(DataContexts);
  const { setOllamaPendingDownloadModels, ollamaPendingDownloadModels } =
    useContext(StatusContexts);
  const { ItemOnSelect, setItemOnSelect, scrollToTop } = useContext(Contexts);

  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const spanRef = useRef(null);
  const [spanWidth, setSpanWidth] = useState(0);
  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [isLoaded]);

  const [panelOnHover, setPanelOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  const filter_options = useCallback(
    (options) => {
      let filtered_options = [];
      for (let i = 0; i < options.length; i++) {
        if (
          avaliableModels.includes(options[i].download_id) ||
          ollamaPendingDownloadModels.includes(options[i].download_id)
        ) {
          continue;
        }
        filtered_options.push(options[i]);
      }
      return filtered_options;
    },
    [avaliableModels, ollamaPendingDownloadModels]
  );
  const [options, setOptions] = useState(
    filter_options(model.available_options)
  );
  const [selectedOption, setSelectedOption] = useState(
    filter_options(model.available_options)[0]
  );
  useEffect(() => {
    if (ItemOnSelect === sub_component_name + model.name) {
      setOptions(filter_options(model.available_options));
    } else {
      setOptions([filter_options(model.available_options)[0]]);
    }
  }, [ItemOnSelect]);

  return (
    <div
      style={{
        transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: "calc(100% - 12px)",
        height: 32,

        zIndex: ItemOnSelect === sub_component_name + model.name ? 1 : 0,

        margin: 5,
        border:
          ItemOnSelect === sub_component_name + model.name
            ? `1px solid rgba(225, 225, 225, 0)`
            : panelOnHover
            ? modelDownloader.border
            : `1px solid rgba(225, 225, 225, 0)`,
        backgroundColor:
          ItemOnSelect === sub_component_name + model.name
            ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
                RGB.G + colorOffset.middle_ground
              }, ${RGB.B + colorOffset.middle_ground}, 0)`
            : panelOnHover
            ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
                RGB.G + colorOffset.middle_ground
              }, ${RGB.B + colorOffset.middle_ground}, 0.64)`
            : `rgba(${RGB.R + colorOffset.middle_ground}, ${
                RGB.G + colorOffset.middle_ground
              }, ${RGB.B + colorOffset.middle_ground}, 0)`,
        borderRadius: 4,
      }}
      onMouseEnter={() => {
        setPanelOnHover(true);
      }}
      onMouseLeave={() => {
        setPanelOnHover(false);
        setOnClick(false);
      }}
      onMouseDown={() => {
        setOnClick(true);
      }}
      onMouseUp={() => {
        setOnClick(false);
      }}
      onClick={() => {
        setItemOnSelect(null);
      }}
    >
      <div
        style={{
          position: "relative",

          width: "calc(100% - 36px)",
          height: 32,

          borderRadius: 4,
        }}
      >
        <span
          ref={spanRef}
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 12,
            fontSize: 18,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
            userSelect: "none",
          }}
        >
          {model.name}
        </span>
      </div>
      <Icon
        src={"download"}
        style={{
          position: "absolute",
          transform: "translate(0, -50%)",
          top: "50%",
          right: 7,
          width: 20,

          opacity: 0.72,

          userSelect: "none",
          cursor: "pointer",
        }}
        onClick={(e) => {
          setOllamaPendingDownloadModels((prev) => [
            ...prev,
            selectedOption.download_id,
          ]);
          scrollToTop();
        }}
      />
      <div
        className="horizontal-scrolling-space"
        style={{
          transition:
            "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), background-color 0s",
          position: "absolute",

          zIndex: 1,
          top: 1,
          left:
            ItemOnSelect === sub_component_name + model.name
              ? spanWidth + 16
              : spanWidth + 13,

          maxWidth: `calc(100% - ${spanWidth + 53}px)`,
          padding: 2,

          borderRadius: 7,
          border:
            ItemOnSelect === sub_component_name + model.name
              ? modelDownloader.border
              : `1px solid rgba(225, 225, 225, 0)`,
          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflowX: "auto",
          overflowY: "hidden",
          whiteSpace: "nowrap",

          cursor: "pointer",
          backgroundColor:
            ItemOnSelect === sub_component_name + model.name
              ? dialog.backgroundColor
              : "rgba(0, 0, 0, 0)",
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {options.map((option, index) => {
          return (
            <OptionTab
              option={option}
              model={model.name}
              key={"model_option_" + index}
              index={index}
              selectedOption={selectedOption}
              setSelectedOption={setSelectedOption}
            />
          );
        })}
      </div>
    </div>
  );
};
const FamilyTab = ({ family }) => {
  return (
    <div
      style={{
        transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: "100%",

        borderRadius: 6,
        boxSizing: "border-box",
      }}
    >
      {family.models.map((model, index) => {
        return <ModelTab key={"ollama_model_" + index} model={model} />;
      })}
    </div>
  );
};
/* { Cloud Model List } ------------------------------------------------------------------------------------------------------------------------------ */

/* { Available Model List } ========================================================================================================================== */
const ModelTag = ({ model }) => {
  const sub_component_name = "installed_models_section";

  const { RGB, colorOffset, modelDownloader } = useContext(ConfigContexts);
  const { sectionData, update_lanaguage_model_using } =
    useContext(DataContexts);
  const {
    /* { pending delete models } */
    ollamaPendingDeleteModels,
    setOllamaPendingDeleteModels,
    /* { pending download models } */
    ollamaPendingDownloadModels,
    /* { installing status } */
    ollamaInstallingStatus,

    load_context_menu,
    unload_context_menu,
    setOnDialog,
  } = useContext(StatusContexts);
  const { favouredModels, setFavouredModels, avaliableModels } =
    useContext(DataContexts);
  const { setItemOnSelect } = useContext(Contexts);

  const tagRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tagWidth, setTagWidth] = useState(0);

  useEffect(() => {
    setIsLoaded(true);
  }, []);
  useEffect(() => {
    if (tagRef.current) {
      setTagWidth(tagRef.current.offsetWidth);
    }
  }, [isLoaded]);

  return (
    <div
      ref={tagRef}
      style={{
        position: "relative",
        display: "inline-block",
        margin: 5,
        padding: "2px 6px",
        borderRadius: 5,
        border: modelDownloader.border,
        boxSizing: "border-box",
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        load_context_menu(e, 140, [
          {
            img_src: "chat",
            label: "Chat",
            onClick: () => {
              update_lanaguage_model_using(sectionData.address, model);
              setOnDialog("");
              unload_context_menu();
            },
          },
          {
            img_src: "delete",
            label: "Delete",
            onClick: () => {
              setOllamaPendingDeleteModels((prev) => [...prev, model]);
              unload_context_menu();
            },
          },
        ]);
      }}
    >
      {ollamaInstallingStatus && ollamaInstallingStatus.model === model ? (
        <div
          style={{
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            top: 0,
            left: 0,
            width: `calc(${ollamaInstallingStatus.percentage}% - 4px)`,
            height: "calc(100% - 4px)",
            backgroundColor: modelDownloader.progress_bar.backgroundColor,
            borderRadius: 3,
            margin: 2,
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          }}
        ></div>
      ) : null}
      {avaliableModels.includes(model) ? (
        <Icon
          src={
            favouredModels.language_models.includes(model) ? "star_1" : "star_0"
          }
          style={{
            transform: "translate(0, -2px)",
            width: 16,
            height: 16,
            display: "inline-block",
            verticalAlign: "middle",
            alignContent: "center",
            margin: "0 6px 0 0",
          }}
          onClick={(e) => {
            if (favouredModels.language_models.includes(model)) {
              setFavouredModels((prev) => ({
                ...prev,
                language_models: prev.language_models.filter(
                  (item) => item !== model
                ),
              }));
            } else {
              setFavouredModels((prev) => {
                let new_favoured_models = [...prev.language_models];
                if (new_favoured_models.length >= 5) {
                  new_favoured_models.shift();
                }
                new_favoured_models.push(model);
                return {
                  ...prev,
                  language_models: new_favoured_models,
                };
              });
            }
          }}
        />
      ) : null}
      <span
        style={{
          position: "relative",
          display: "inline-block",
          fontSize: 14,
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          userSelect: "none",
        }}
      >
        {model}
      </span>
      <div
        style={{
          position: "relative",
          display: "inline-block",
          margin: "0 0 0 6px",
          top: 3,
          width: 17,
          height: 17,
        }}
      >
        {ollamaPendingDeleteModels.includes(model) ||
        ollamaPendingDownloadModels.includes(model) ? (
          <MoonLoader
            size={13}
            color={modelDownloader.loader.color}
            speedMultiplier={0.8}
          />
        ) : (
          <Icon
            src={"more"}
            style={{
              width: 17,
              height: 17,
              opacity: 0.72,

              userSelect: "none",
              cursor: "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setItemOnSelect(sub_component_name + model);
              load_context_menu(
                e,
                140,
                [
                  {
                    img_src: "chat",
                    label: "Chat",
                    onClick: () => {
                      update_lanaguage_model_using(sectionData.address, model);
                      setOnDialog("");
                      unload_context_menu();
                    },
                  },
                  {
                    img_src: "delete",
                    label: "Delete",
                    onClick: () => {
                      setOllamaPendingDeleteModels((prev) => [...prev, model]);
                      unload_context_menu();
                    },
                  },
                ],
                tagRef.current?.getBoundingClientRect().x + tagWidth - 10,
                tagRef.current?.getBoundingClientRect().y + 28
              );
            }}
          />
        )}
      </div>
    </div>
  );
};
const AvailableModel = () => {
  const { avaliableModels, favouredModels } = useContext(DataContexts);
  const { ollamaPendingDownloadModels } = useContext(StatusContexts);

  const [availableLanguageModels, setAvailableLanguageModels] = useState([]);
  useEffect(() => {
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
    let available_models = [];
    for (let model of favouredModels.language_models) {
      if (check_is_language_model(model)) {
        available_models.push(model);
      }
    }
    for (let model of avaliableModels) {
      if (!favouredModels.language_models.includes(model)) {
        if (check_is_language_model(model)) {
          available_models.push(model);
        }
      }
    }
    setAvailableLanguageModels(available_models);
  }, [avaliableModels, favouredModels]);
  const [pendingDownloadModels, setPendingDownloadModels] = useState([]);
  useEffect(() => {
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
    let pending_download_models = [];
    for (let model of ollamaPendingDownloadModels) {
      if (check_is_language_model(model)) {
        if (!favouredModels.language_models.includes(model)) {
          pending_download_models.push(model);
        }
      }
    }
    setPendingDownloadModels(pending_download_models);
  }, [ollamaPendingDownloadModels, favouredModels]);

  return (
    <>
      {availableLanguageModels.map((model, index) => {
        return <ModelTag key={"available_model_" + index} model={model} />;
      })}
      {pendingDownloadModels.map((model, index) => {
        return <ModelTag key={"installing_model_" + index} model={model} />;
      })}
    </>
  );
};
/* { Available Model List } ========================================================================================================================== */

const Language_Model_Manager = ({ available_models }) => {
  const { modelDownloader } = useContext(ConfigContexts);
  const { unload_context_menu } = useContext(StatusContexts);
  const [ItemOnSelect, setItemOnSelect] = useState(null);
  const ScrollRef = useRef(null);

  const scrollToTop = () => {
    if (ScrollRef.current) {
      ScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <Contexts.Provider
      value={{
        ItemOnSelect,
        setItemOnSelect,
        scrollToTop,
      }}
    >
      <div
        ref={ScrollRef}
        className="scrolling-space"
        style={{
          position: "absolute",

          top: 0,
          left: 0,

          margin: 6,

          width: "calc(100% - 12px)",
          height: "calc(100% - 12px)",

          boxSizing: "border-box",

          overflowY: "auto",
          overflowX: "hidden",
          userSelect: "none",
        }}
        onClick={(e) => {
          setItemOnSelect(null);
          unload_context_menu();
        }}
      >
        <div
          style={{
            position: "relative",
            display: "block",

            margin: "6px 6px 32px 6px",
            height: 32,
          }}
        >
          <Icon
            src={"folder"}
            style={{
              position: "absolute",
              top: 0,

              width: 20,
              height: 20,
              margin: 6,

              userSelect: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              transform: "translate(0, -50%)",
              top: "50%",
              left: 30,
              fontSize: 20,
              color: modelDownloader.color,
              userSelect: "none",
            }}
          >
            Installed Models
          </span>
        </div>
        <AvailableModel />
        <div
          style={{
            position: "relative",
            display: "block",

            margin: "32px 6px 32px 6px",
            height: 32,
          }}
        >
          <Icon
            src={"install"}
            style={{
              position: "absolute",
              top: 0,

              width: 20,
              height: 20,
              margin: 6,

              userSelect: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              transform: "translate(0, -50%)",
              top: "50%",
              left: 30,
              fontSize: 20,
              color: modelDownloader.color,
            }}
          >
            Ollama Models
          </span>
        </div>
        {available_models.map((family, index) => {
          return <FamilyTab key={"model_family_" + index} family={family} />;
        })}
      </div>
    </Contexts.Provider>
  );
};

export default Language_Model_Manager;
