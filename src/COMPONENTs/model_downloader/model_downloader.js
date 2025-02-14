import React, {
  useState,
  useContext,
  useEffect,
  useRef,
  createContext,
  use,
} from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { RequestContexts } from "../../CONTAINERs/requests/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import MoonLoader from "react-spinners/MoonLoader";

const component_name = "model_downloader";

const contexts = createContext("");

/* { Cloud Model List } ------------------------------------------------------------------------------------------------------------------------------ */
const OptionTab = ({ model, option, selectedOption, setSelectedOption }) => {
  const sub_component_name = "available_models_section";
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { ItemOnSelect, setItemOnSelect } = useContext(contexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        transition: "all 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: 40,
        height: 24,
        border:
          ItemOnSelect === sub_component_name + model
            ? onHover
              ? `1px solid rgba(225, 225, 225, 0.16)`
              : `1px solid rgba(225, 225, 225, 0)`
            : `1px solid rgba(225, 225, 225, 0.16)`,
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
      onClick={() => {
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
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { ItemOnSelect, setItemOnSelect } = useContext(contexts);

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

  const [options, setOptions] = useState(model.available_options);
  const [selectedOption, setSelectedOption] = useState(
    model.available_options[0]
  );
  useEffect(() => {
    if (ItemOnSelect === sub_component_name + model.name) {
      setOptions(model.available_options);
    } else {
      setOptions([model.available_options[0]]);
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
            ? `1px solid rgba(225, 225, 225, 0.16)`
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

          opacity: 0.5,

          userSelect: "none",
        }}
      />
      <div
        className="scrolling-space"
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
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
              ? `1px solid rgba(225, 225, 225, 0.16)`
              : `1px solid rgba(225, 225, 225, 0)`,

          display: "flex",
          flexDirection: "row",
          gap: 2,
          overflowX: "auto",
          overflowY: "hidden",
          whiteSpace: "nowrap",
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
const OptionItem = ({ img_src, label, onClick }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  return (
    <>
      <div
        style={{
          position: "relative",
          display: "block",
          width: "clac(100%- 6px)",
          height: 30,
          margin: 2,

          border: `1px solid rgba(225, 225, 225, 0.16)`,
          borderRadius: 6,
        }}
        onClick={onClick}
      >
        <Icon
          src={img_src}
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 6,
            userSelect: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 30,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
            userSelect: "none",
          }}
        >
          {label}
        </span>
      </div>
    </>
  );
};
const MoreOption = ({ model, tagWidth }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { setOnDeleteModels } = useContext(contexts);

  return (
    <div
      style={{
        position: "absolute",
        maxHeight: (tagWidth + 2) * 0.618,
        top: 20,
        right: -1,
        width: tagWidth + 2,
        zIndex: 1,

        backgroundColor: `rgba(${RGB.R + colorOffset.middle_ground}, ${
          RGB.G + colorOffset.middle_ground
        }, ${RGB.B + colorOffset.middle_ground}, 1)`,
        borderRadius: 8,
        border: `1px solid rgba(225, 225, 225, 0.16)`,
        boxSizing: "border-box",
        boxShadow: `0 0 8px rgba(0, 0, 0, 0.32)`,
      }}
    >
      <OptionItem
        img_src={"delete"}
        label={"Delete"}
        onClick={() => {
          setOnDeleteModels((prev) => [...prev, model]);
        }}
      />
    </div>
  );
};
const ModelTag = ({ model }) => {
  const sub_component_name = "installed_models_section";

  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { ItemOnSelect, setItemOnSelect, onDeleteModels } =
    useContext(contexts);

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
        border: `1px solid rgba(225, 225, 225, 0.16)`,
        boxSizing: "border-box",
      }}
    >
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
        {onDeleteModels.includes(model) ? (
          <MoonLoader size={13} color={"#FFFFFF"} speedMultiplier={0.8} />
        ) : (
          <Icon
            src={"more"}
            style={{
              width: 17,
              height: 17,
              opacity: 0.5,

              userSelect: "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setItemOnSelect(sub_component_name + model);
            }}
          />
        )}
      </div>
      {ItemOnSelect === sub_component_name + model ? (
        <MoreOption model={model} tagWidth={tagWidth} />
      ) : null}
    </div>
  );
};
const AvailableModel = ({ avaliableModels }) => {
  return (
    <>
      {avaliableModels.map((model, index) => {
        return <ModelTag key={"available_model_" + index} model={model} />;
      })}
    </>
  );
};
/* { Available Model List } ========================================================================================================================== */

const ModelDownloader = ({ available_models }) => {
  const { avaliableModels, setAvaliableModels } = useContext(DataContexts);
  const { ollama_list_available_models, ollama_delete_local_model } =
    useContext(RequestContexts);
  const [ItemOnSelect, setItemOnSelect] = useState(null);
  const [onDeleteModels, setOnDeleteModels] = useState([]);

  useEffect(() => {
    if (onDeleteModels.length === 0) {
      return;
    }
    ollama_delete_local_model(onDeleteModels[0]).then((response) => {
      ollama_list_available_models().then((response) => {
        setAvaliableModels(response);
      });
    });
  }, [onDeleteModels]);

  return (
    <contexts.Provider
      value={{
        ItemOnSelect,
        setItemOnSelect,
        onDeleteModels,
        setOnDeleteModels,
      }}
    >
      <div
        className="scrolling-space"
        style={{
          position: "absolute",

          top: 0,
          left: 0,

          margin: 6,

          width: "calc(100% - 12px)",
          height: "calc(100% - 12px)",

          boxSizing: "border-box",

          overflowX: "hidden",
          overflowY: "auto",
        }}
        onClick={(e) => {
          setItemOnSelect(null);
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
            src={"drive"}
            style={{
              position: "absolute",
              top: 0,

              width: 20,
              height: 20,
              margin: 6,
            }}
          />
          <span
            style={{
              position: "absolute",
              transform: "translate(0, -50%)",
              top: "50%",
              left: 30,
              fontSize: 20,
              color: `rgba(${225}, ${225}, ${225}, 0.72)`,
            }}
          >
            Installed Models
          </span>
        </div>
        <AvailableModel avaliableModels={avaliableModels} />
        <div
          style={{
            position: "relative",
            display: "block",

            margin: "32px 6px 32px 6px",
            height: 32,
          }}
        >
          <Icon
            src={"cloud"}
            style={{
              position: "absolute",
              top: 0,

              width: 20,
              height: 20,
              margin: 6,
            }}
          />
          <span
            style={{
              position: "absolute",
              transform: "translate(0, -50%)",
              top: "50%",
              left: 30,
              fontSize: 20,
              color: `rgba(${225}, ${225}, ${225}, 0.72)`,
            }}
          >
            Available Ollama Models
          </span>
        </div>
        {available_models.map((family, index) => {
          return <FamilyTab key={"model_family_" + index} family={family} />;
        })}
      </div>
    </contexts.Provider>
  );
};

export default ModelDownloader;
