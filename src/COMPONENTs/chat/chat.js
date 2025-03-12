import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
} from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { RequestContexts } from "../../CONTAINERs/requests/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import Input from "../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Term from "../terminal/terminal";
import FileDropZone from "../file_drop_zone/file_drop_zone";

import { LOADING_TAG } from "../../BUILTIN_COMPONENTs/markdown/const";
import {
  chat_room_title_generation_prompt,
  vision_prompt,
} from "../../CONTAINERs/requests/default_instructions";
import { side_menu_width_threshold } from "../side_menu/constants";
import { available_large_language_models } from "../settings/ollama";

const default_border_radius = 10;
const default_font_size = 14;

const component_name = "chat";

const ChatContexts = createContext("");

/* { Message List } -------------------------------------------------------------------------------------------------------- */
const Message_Bottom_Panel = ({ index, active, role, setPlainTextMode }) => {
  const { RGB, messageList } = useContext(ConfigContexts);
  const { sectionData } = useContext(DataContexts);
  const { update_message } = useContext(ChatContexts);

  const [onHover, setOnHover] = useState(null);
  const [onClick, setOnClick] = useState(null);

  if (role === "assistant") {
    return (
      <div
        style={{
          transition: "opacity 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 32,
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.16)`,
          opacity: active ? 1 : 0,
          pointerEvents: active ? "auto" : "none",
        }}
      >
        <Icon
          src="txt"
          style={{
            transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            width: 24,
            padding: 2,
            marginLeft: 1,
            opacity: onClick === "plainTextMode" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "plainTextMode"
                ? messageList.message_bottom_panel.backgroundColor_onActive
                : onHover === "plainTextMode"
                ? messageList.message_bottom_panel.backgroundColor_onHover
                : messageList.message_bottom_panel.backgroundColor,
            borderRadius: default_border_radius - 1,
            border:
              onClick === "plainTextMode"
                ? messageList.message_bottom_panel.border_onActive
                : onHover === "plainTextMode"
                ? messageList.message_bottom_panel.border_onHover
                : messageList.message_bottom_panel.border,
            userSelect: "none",
          }}
          onMouseEnter={() => {
            setOnHover("plainTextMode");
          }}
          onMouseLeave={() => {
            setOnHover(null);
            setOnClick(null);
          }}
          onMouseDown={() => {
            setOnClick("plainTextMode");
          }}
          onMouseUp={() => {
            setOnClick(null);
          }}
          onClick={() => {
            setPlainTextMode((prev) => !prev);
          }}
        />
        <Icon
          src="update"
          style={{
            transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            left: 24,
            width: 18,
            padding: 5,
            marginLeft: 1,
            opacity: onClick === "regenerate" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "regenerate"
                ? messageList.message_bottom_panel.backgroundColor_onActive
                : onHover === "regenerate"
                ? messageList.message_bottom_panel.backgroundColor_onHover
                : messageList.message_bottom_panel.backgroundColor,
            borderRadius: default_border_radius - 1,
            border:
              onClick === "regenerate"
                ? messageList.message_bottom_panel.border_onActive
                : onHover === "regenerate"
                ? messageList.message_bottom_panel.border_onHover
                : messageList.message_bottom_panel.border,
            userSelect: "none",
          }}
          onMouseEnter={() => {
            setOnHover("regenerate");
          }}
          onMouseLeave={() => {
            setOnHover(null);
            setOnClick(null);
          }}
          onMouseDown={() => {
            setOnClick("regenerate");
          }}
          onMouseUp={() => {
            setOnClick(null);
          }}
          onClick={() => {
            update_message(sectionData.address, sectionData.messages, index);
          }}
        />
      </div>
    );
  } else {
    return null;
  }
};
const Message_Upper_Panel_File_Item = ({ index, imageSrc }) => {
  const { messageList } = useContext(ConfigContexts);
  const { setOnDialog } = useContext(StatusContexts);

  return imageSrc ? (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        height: 32,
        marginLeft: 24,
        cursor: "pointer",
      }}
      onClick={(e) => {
        setOnDialog("image_viewer|" + imageSrc);
      }}
    >
      <img
        src={imageSrc}
        draggable="false"
        style={{
          height: 96,
          borderRadius: 4,
          userSelect: "none",
        }}
      />
    </div>
  ) : null;
};
const Message_Upper_Panel = ({ role, index, images }) => {
  return images.length !== 0
    ? images.map((image, i) => (
        <Message_Upper_Panel_File_Item key={i} index={index} imageSrc={image} />
      ))
    : null;
};
const Message = ({ index, role, message, image_addresses, is_last_index }) => {
  const { RGB, colorOffset, boxShadow } = useContext(ConfigContexts);
  const { sectionData, load_saved_images } = useContext(DataContexts);
  const { targetAddress } = useContext(StatusContexts);
  const { awaitResponse } = useContext(ChatContexts);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
  });
  const [onHover, setOnHover] = useState(false);
  const [plainTextMode, setPlainTextMode] = useState(false);
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (sectionData.address !== targetAddress) {
      setPlainTextMode(false);
    }
  }, [sectionData, targetAddress]);
  useEffect(() => {
    if (role === "assistant") {
      setStyle({
        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B},0)`,
      });
    } else if (role === "terminal") {
      setStyle({
        backgroundColor: `#b45200`,
      });
    } else {
      setStyle({
        plainText: true,
      });
    }
  }, [role]);
  useEffect(() => {
    if (image_addresses && image_addresses.length !== 0) {
      setImages(load_saved_images(targetAddress, index, image_addresses));
    }
  }, [image_addresses, index, targetAddress]);

  return (
    <>
      <div
        style={{
          transition: "margin-left 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
          transition: "width 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "relative",
          width: role === "user" ? "none" : "100%",
          maxWidth: role === "user" ? 328 : "100%",

          float: role === "user" ? "right" : "left",
          marginTop: index === 0 ? 40 : 0,
          marginBottom: is_last_index ? 256 : 36,
          borderRadius: default_border_radius,
        }}
        onMouseEnter={(e) => {
          setOnHover(true);
        }}
        onMouseLeave={(e) => {
          setOnHover(false);
        }}
      >
        {role === "assistant" || !image_addresses ? null : (
          <div
            className="h_2_scrolling-space"
            style={{
              transition: "opacity 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
              position: "relative",
              display: "flex",
              flexDirection: "row-reverse",
              justifyContent: "flex-start",
              maxWidth: "328px",
              height: 112,
              marginBottom: 8,
              overflowX: "auto",
              overflowY: "hidden",
            }}
          >
            <Message_Upper_Panel role={role} index={index} images={images} />
          </div>
        )}
        {!plainTextMode ? (
          <Markdown index={index} style={style}>
            {message}
          </Markdown>
        ) : (
          <span
            style={{
              color: `rgba(${RGB.R + colorOffset.font}, ${
                RGB.G + colorOffset.font
              }, ${RGB.B + colorOffset.font}, 1)`,
            }}
          >
            {message}
          </span>
        )}

        <div
          className="message-bottom-panel"
          style={{
            transition: "opacity 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            width: "100%",
            height: 32,
          }}
        >
          <Message_Bottom_Panel
            index={index}
            active={onHover && awaitResponse === null}
            role={role}
            setPlainTextMode={setPlainTextMode}
          />
        </div>
      </div>
    </>
  );
};
const Message_Scrolling_List = () => {
  const { sectionData, sectionStarted } = useContext(DataContexts);
  const { windowWidth, setComponentOnFocus, unload_context_menu } =
    useContext(StatusContexts);
  const {
    awaitResponse,
    preLoadingCompleted,
    arrivedAtPosition,
    setArrivedAtPosition,
  } = useContext(ChatContexts);
  /* { Scrolling } ----------------------------------------------------------- */
  const scrollRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  useEffect(() => {
    const handleScroll = () => {
      setIsUserScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 3000);
    };
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (scrollElement) {
        scrollElement.removeEventListener("scroll", handleScroll);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (
      !isUserScrolling &&
      scrollRef.current &&
      awaitResponse !== null &&
      awaitResponse === -1
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sectionData, awaitResponse, awaitResponse]);
  useEffect(() => {
    if (!preLoadingCompleted && !arrivedAtPosition) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 16);
      setTimeout(() => {
        setArrivedAtPosition(true);
      }, 32);
    }
  }, [preLoadingCompleted, arrivedAtPosition]);
  /* { Scrolling } ----------------------------------------------------------- */

  return (
    <div
      ref={scrollRef}
      className="scrolling-space"
      style={{
        transition: preLoadingCompleted
          ? "opacity 0.64s cubic-bezier(0.32, 0, 0.32, 1)"
          : "none",
        position: "absolute",

        top: 0,
        left: 0,
        right: 0,
        bottom: 4,

        padding: 32,
        overflowX: "hidden",
        overflowY: "overlay",
        boxSizing: "border-box",
        scrollBehavior: preLoadingCompleted ? "smooth" : "auto",

        opacity: sectionStarted && preLoadingCompleted ? 1 : 0,
      }}
      onClick={(e) => {
        e.stopPropagation();
        unload_context_menu();
        setComponentOnFocus(component_name);
      }}
    >
      <div
        style={{
          position: "absolute",
          transform: "translate(-50%, 0%)",
          top: 0,
          left: "calc(50%  + 4px)",
          padding: "4px 8px",

          width: windowWidth > 760 ? 684 : windowWidth - 60,
        }}
      >
        {sectionData && sectionData.messages
          ? sectionData.messages.map((msg, index) => (
              <Message
                key={index}
                index={index}
                role={msg.role}
                message={msg.message}
                image_addresses={msg.images}
                is_last_index={
                  index === sectionData.messages.length - 1 ? true : false
                }
              />
            ))
          : null}
      </div>
      <div
        className="message-bottom-panel"
        style={{
          position: "relative",
          width: "100%",
          height: 64,
          pointerEvents: "none",
          userSelect: "none",
        }}
      ></div>
    </div>
  );
};
/* { Message List } -------------------------------------------------------------------------------------------------------- */

/* { Model Selector } ------------------------------------------------------------------------------------------------------ */
const Model_Selector_Add_Model_Button = () => {
  const { RGB, messageList } = useContext(ConfigContexts);
  const { setComponentOnFocus, setOnDialog } = useContext(StatusContexts);

  const [onHover, setOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  return (
    <div
      style={{
        transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
        position: "relative",

        width: "calc(100% - 12px)",
        minWidth: 180,
        height: 40,
        margin: 5,
        border: onHover
          ? "1px solid rgba(255, 255, 255, 0.16)"
          : "1px solid rgba(255, 255, 255, 0)",
        borderRadius: 4,
        backgroundColor: onClick
          ? messageList.add_model_button.backgroundColor_onActive
          : onHover
          ? messageList.add_model_button.backgroundColor_onHover
          : `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
        setOnClick(false);
      }}
      onMouseDown={(e) => {
        setOnClick(true);
      }}
      onMouseUp={(e) => {
        setOnClick(false);
      }}
      onClick={(e) => {
        setComponentOnFocus(component_name);
        setOnDialog("download_ollama_model");
      }}
    >
      <Icon
        src="add"
        alt="add"
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
        }}
      />
    </div>
  );
};
const Model_Selector_Item = ({ model }) => {
  const { messageList } = useContext(ConfigContexts);
  const { sectionData, setAvaliableModels, update_lanaguage_model_using } =
    useContext(DataContexts);
  const { ollama_list_available_models } = useContext(RequestContexts);
  const { setComponentOnFocus } = useContext(StatusContexts);
  const { targetAddress } = useContext(ChatContexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        top: 0,

        width: 180,
        margin: 5,
        padding: "2px 6px",

        color: messageList.model_list_item.color,

        border:
          sectionData.language_model_using === model
            ? "1px solid rgba(255, 255, 255, 0.32)"
            : onHover
            ? "1px solid rgba(255, 255, 255, 0.16)"
            : "1px solid rgba(255, 255, 255, 0)",
        borderRadius: 4,
        backgroundColor:
          sectionData.language_model_using === model
            ? messageList.model_list_item.backgroundColor_onActive
            : onHover
            ? messageList.model_list_item.backgroundColor_onHover
            : messageList.model_list_item.backgroundColor,
        boxShadow:
          sectionData.language_model_using === model
            ? messageList.model_list_item.boxShadow_onHover
            : "none",
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
      }}
      onClick={(e) => {
        update_lanaguage_model_using(targetAddress, model);
        setComponentOnFocus(component_name);
        ollama_list_available_models().then((response) => {
          setAvaliableModels(response);
        });
      }}
    >
      {model}
    </div>
  );
};
const Model_Selector = ({ value, setMenuWidth }) => {
  const sub_component_name = component_name + "_" + "model_selector";

  const { messageList } = useContext(ConfigContexts);
  const { sectionData, avaliableModels, setAvaliableModels } =
    useContext(DataContexts);
  const { ollamaOnTask, componentOnFocus, setComponentOnFocus } =
    useContext(StatusContexts);
  const { ollama_list_available_models } = useContext(RequestContexts);
  const { inputHeight } = useContext(ChatContexts);

  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuRef || !menuRef.current) return;
    setMenuWidth(menuRef.current.offsetWidth);
  }, [componentOnFocus, sectionData.language_model_using]);

  const [onHover, setOnHover] = useState(false);
  useEffect(() => {
    if (componentOnFocus !== sub_component_name) {
      setOnHover(false);
    }
  }, [componentOnFocus]);

  useEffect(() => {
    ollama_list_available_models().then((response) => {
      setAvaliableModels(response);
    });
  }, []);
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
    for (let model of avaliableModels) {
      if (check_is_language_model(model)) {
        available_models.push(model);
      }
    }
    setAvailableLanguageModels(available_models);
  }, [avaliableModels]);

  return (
    <div
      style={{
        userSelect: "none",
        transition:
          "bottom 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " left 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " opacity 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " border 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " box-shadow 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " padding 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        bottom:
          value.length !== 0 || ollamaOnTask !== null
            ? Math.max(inputHeight + 35, 84)
            : 34,
        left: value.length !== 0 || ollamaOnTask !== null ? 0 : 50,

        fontSize: default_font_size + 2,
        fontFamily: "inherit",
        fontWeight: 500,

        opacity: ollamaOnTask !== null ? 0 : 1,
        padding: componentOnFocus === sub_component_name ? "5px" : "2px 6px",

        borderRadius: componentOnFocus === sub_component_name ? 8 : 4,
        color:
          componentOnFocus === sub_component_name
            ? messageList.model_menu.color_onActive
            : messageList.model_menu.color,
        border:
          componentOnFocus === sub_component_name
            ? messageList.model_menu.border_onActive
            : onHover
            ? messageList.model_menu.border_onHover
            : messageList.model_menu.border,
        backgroundColor:
          componentOnFocus === sub_component_name
            ? messageList.model_menu.backgroundColor_onActive
            : messageList.model_menu.backgroundColor,

        boxShadow:
          onHover || componentOnFocus === sub_component_name
            ? messageList.model_menu.boxShadow_onHover
            : "none",
        cursor: "pointer",
        backdropFilter:
          componentOnFocus === sub_component_name ? "blur(16px)" : "none",
        pointerEvents: ollamaOnTask !== null ? "none" : "auto",
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        setComponentOnFocus(sub_component_name);
      }}
      onClick={(e) => {
        e.stopPropagation();
        ollama_list_available_models().then((response) => {
          setAvaliableModels(response);
        });
      }}
    >
      <div
        className="scrolling-space"
        style={{
          maxHeight: 111,
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {componentOnFocus === sub_component_name ? (
          availableLanguageModels.map((model, index) => (
            <Model_Selector_Item key={index} model={model} />
          ))
        ) : (
          <div
            ref={menuRef}
            style={{
              transition: "color 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
              position: "relative",
              top: 0,
              color: onHover
                ? messageList.model_menu.color_onHover
                : messageList.model_menu.color,
              minHeight: 23,
            }}
          >
            {sectionData.language_model_using
              ? sectionData.language_model_using
              : "a Model here"}
          </div>
        )}
        {componentOnFocus === sub_component_name ? (
          <Model_Selector_Add_Model_Button />
        ) : null}
      </div>
    </div>
  );
};
/* { Model Selector } ------------------------------------------------------------------------------------------------------ */

/* { Input Panel } --------------------------------------------------------------------------------------------------------- */
const Input_File_Panel_Item = ({ index, imageSrc }) => {
  const { messageList } = useContext(ConfigContexts);
  const { ollamaOnTask } = useContext(StatusContexts);
  const { setInputImages } = useContext(ChatContexts);

  return imageSrc ? (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        height: 32,
        marginRight: 24,
        opacity: ollamaOnTask !== null ? 0 : 1,
      }}
    >
      <img
        src={imageSrc}
        draggable="false"
        style={{
          height: 50,
          borderRadius: 4,
          border: messageList.input_images.border,
        }}
      />
      <Icon
        src="close"
        alt="close"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          transform: "translate(50%, -50%)",

          width: 12,

          backgroundColor: messageList.input_images.backgroundColor,
          borderRadius: 16,
          padding: 3,
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setInputImages((prev) => {
            return prev.filter((_, i) => i !== index);
          });
        }}
      />
    </div>
  ) : null;
};
const Input_File_Panel = ({ value }) => {
  const { inputHeight, inputImages } = useContext(ChatContexts);

  return (
    <div
      className="input-image-panel"
      style={{
        position: "absolute",
        transform: "translate(0%, -50%)",
        transition: "bottom 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        left: 0,
        bottom: value.length !== 0 ? Math.max(inputHeight + 55, 103) : 67,

        height: 50,
      }}
    >
      {inputImages.length !== 0
        ? inputImages.map((image, index) => (
            <Input_File_Panel_Item key={index} index={index} imageSrc={image} />
          ))
        : null}
    </div>
  );
};
const Input_Function_Panel = ({ value, menuWidth }) => {
  const { messageList } = useContext(ConfigContexts);
  const { ollamaOnTask } = useContext(StatusContexts);
  const { trigger_section_mode } = useContext(DataContexts);
  const { inputHeight, inputImages, setInputImages } = useContext(ChatContexts);

  const [onHover, setOnHover] = useState(null);
  const [onClick, setOnClick] = useState(null);

  const default_offset = {
    longer: 70,
    shorter: 20,
  };
  if (ollamaOnTask !== null) {
    return null;
  }
  const handleSelectImage = async () => {
    const { filePaths } = await window.dataAPI.selectFile();
    if (filePaths.length > 0) {
      const filePath = filePaths[0];
      const fileData = await window.dataAPI.readFileAsBase64(filePath);
      setInputImages((prev) => [...prev, fileData]);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        transition:
          "bottom 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16), left 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

        left:
          value.length !== 0
            ? menuWidth + default_offset.shorter
            : menuWidth + default_offset.longer,
        bottom: value.length !== 0 ? Math.max(inputHeight + 33, 83) : 32,

        height: 33,

        boxSizing: "border-box",
        border: "1px solid rgba(0, 0, 0, 0)",
      }}
    >
      <div
        className="attach_button"
        style={{
          transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: "50%",
          left: 0,
          width: 26,
          height: 26,
          backgroundColor:
            onClick === "attachMode"
              ? messageList.input_upper_panel.backgroundColor_onActive
              : onHover === "attachMode"
              ? messageList.input_upper_panel.backgroundColor_onHover
              : messageList.input_upper_panel.backgroundColor,
          borderRadius: default_border_radius - 2,
          border:
            onClick === "attachMode"
              ? messageList.input_upper_panel.border_onActive
              : onHover === "attachMode"
              ? messageList.input_upper_panel.border_onHover
              : messageList.input_upper_panel.border,
          boxShadow:
            onHover === "attachMode"
              ? messageList.input_upper_panel.boxShadow
              : "none",
          userSelect: "none",
        }}
        onMouseEnter={() => {
          setOnHover("attachMode");
        }}
        onMouseLeave={() => {
          setOnHover(null);
          setOnClick(null);
        }}
        onMouseDown={() => {
          setOnClick("attachMode");
        }}
        onMouseUp={() => {
          setOnClick(null);
        }}
        onClick={() => {}}
      >
        <Icon
          src="attachment"
          alt="attach"
          style={{
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            width: 20,
            opacity:
              onClick === "attachMode"
                ? messageList.input_upper_panel.opacity_onActive
                : onHover === "attachMode"
                ? messageList.input_upper_panel.opacity_onHover
                : messageList.input_upper_panel.opacity,
          }}
          onClick={handleSelectImage}
        />
      </div>
      <div
        className="terminal_button"
        style={{
          transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: "50%",
          left: 34,
          width: 26,
          height: 26,
          backgroundColor:
            onClick === "terminalMode"
              ? messageList.input_upper_panel.backgroundColor_onActive
              : onHover === "terminalMode"
              ? messageList.input_upper_panel.backgroundColor_onHover
              : messageList.input_upper_panel.backgroundColor,
          borderRadius: default_border_radius - 2,
          border:
            onClick === "terminalMode"
              ? messageList.input_upper_panel.border_onActive
              : onHover === "terminalMode"
              ? messageList.input_upper_panel.border_onHover
              : messageList.input_upper_panel.border,
          boxShadow:
            onHover === "terminalMode"
              ? messageList.input_upper_panel.boxShadow
              : "none",
        }}
        onMouseEnter={() => {
          setOnHover("terminalMode");
        }}
        onMouseLeave={() => {
          setOnHover(null);
          setOnClick(null);
        }}
        onMouseDown={() => {
          setOnClick("terminalMode");
        }}
        onMouseUp={() => {
          setOnClick(null);
        }}
        onClick={() => {
          trigger_section_mode("terminal");
        }}
      >
        <Icon
          src="terminal"
          alt="terminal"
          style={{
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            width: 20,
            borderRadius: 24,
            opacity:
              onClick === "terminalMode"
                ? messageList.input_upper_panel.opacity_onActive
                : onHover === "terminalMode"
                ? messageList.input_upper_panel.opacity_onHover
                : messageList.input_upper_panel.opacity,
            userSelect: "none",
          }}
        />
      </div>
      {/* <div
        className="github_button"
        style={{
          transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: "50%",
          left: 68,
          width: 26,
          height: 26,
          backgroundColor:
            onClick === "githubMode"
              ? messageList.input_upper_panel.backgroundColor_onActive
              : onHover === "githubMode"
              ? messageList.input_upper_panel.backgroundColor_onHover
              : messageList.input_upper_panel.backgroundColor,
          borderRadius: default_border_radius - 2,
          border:
            onClick === "githubMode"
              ? messageList.input_upper_panel.border_onActive
              : onHover === "githubMode"
              ? messageList.input_upper_panel.border_onHover
              : messageList.input_upper_panel.border,
          boxShadow:
            onHover === "githubMode"
              ? messageList.input_upper_panel.boxShadow
              : "none",
          userSelect: "none",
        }}
        onMouseEnter={() => {
          setOnHover("githubMode");
        }}
        onMouseLeave={() => {
          setOnHover(null);
          setOnClick(null);
        }}
        onMouseDown={() => {
          setOnClick("githubMode");
        }}
        onMouseUp={() => {
          setOnClick(null);
        }}
        onClick={() => {}}
      >
        <Icon
          src="github"
          alt="github"
          style={{
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            width: 20,
            opacity:
              onClick === "githubMode"
                ? messageList.input_upper_panel.opacity_onActive
                : onHover === "githubMode"
                ? messageList.input_upper_panel.opacity_onHover
                : messageList.input_upper_panel.opacity,
          }}
        />
      </div> */}
    </div>
  );
};
/* { Input Panel } --------------------------------------------------------------------------------------------------------- */

const Input_Box = ({ inputValue, setInputValue, on_input_submit }) => {
  const { RGB, color, inputBox, component } = useContext(ConfigContexts);
  const { windowWidth, componentOnFocus, onSideMenu } =
    useContext(StatusContexts);
  const { force_stop_ollama } = useContext(RequestContexts);
  const { awaitResponse, setInputHeight } = useContext(ChatContexts);

  const [menuWidth, setMenuWidth] = useState(0);
  const [style, setStyle] = useState({
    colorOffset: 0,
    opacity: 0,
    border: "1px solid rgba(255, 255, 255, 0)",
  });
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);
  const [onFocus, setOnFocus] = useState(false);

  useEffect(() => {
    if (onClicked) {
      setStyle({
        colorOffset: 64,
        opacity: 1,
        border: component.button.onActive.border,
        backgroundColor: component.button.onActive.backgroundColor,
        boxShadow: component.button.onActive.boxShadow,
      });
    } else if (onHover) {
      setStyle({
        colorOffset: 16,
        opacity: 1,
        border: component.button.onHover.border,
        backgroundColor: component.button.onHover.backgroundColor,
        boxShadow: component.button.onHover.boxShadow,
      });
    } else {
      setStyle({
        colorOffset: 0,
        opacity: 0,
        border: component.button.border,
        backgroundColor: component.button.backgroundColor,
        boxShadow: "none",
      });
    }
  }, [onHover, onClicked]);
  useEffect(() => {
    if (componentOnFocus === component_name) {
      setOnFocus(true);
    }
  }, [componentOnFocus]);

  return (
    <div
      style={{
        transition:
          "left 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
          "width 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "fixed",
        transform: "translate(-50%, 0%)",
        left:
          windowWidth > side_menu_width_threshold && onSideMenu
            ? "calc(50% + 150px)"
            : "50%",
        bottom: 0,

        height: 64,

        width: windowWidth > 740 ? 700 : windowWidth - 40,
        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
      }}
    >
      <Input_File_Panel value={inputValue} />
      <Input
        value={inputValue}
        setValue={setInputValue}
        onSubmit={on_input_submit}
        onFocus={onFocus}
        setOnFocus={setOnFocus}
        setInputHeight={setInputHeight}
        style={{
          transition: "height 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",

          bottom: 24,
          left: 0,
          right: 0,
          padding: 0,
          margin: 0,

          fontSize: 16,
          color: color,

          borderRadius: 12,
          backgroundColor: inputBox.backgroundColor,
          backdropFilter: "blur(24px)",
          boxShadow: inputBox.boxShadow,
          border: inputBox.border,
          boxSizing: "border-box",
        }}
      ></Input>
      {awaitResponse === null ? (
        <Icon
          src="send"
          alt="send"
          style={{
            transition:
              "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), bottom 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

            userSelect: "none",
            draggable: "false",
            position: "fixed",
            transform: "translate(-50%, -50%)",

            bottom: 14,
            right: -9,
            width: 16,
            height: 16,
            cursor: "pointer",

            padding: 8,
            borderRadius: 7,
            backgroundColor: style.backgroundColor,
            border: style.border,
            boxShadow: style.boxShadow,
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClicked(false);
          }}
          onMouseDown={() => {
            setOnClicked(true);
          }}
          onMouseUp={() => {
            setOnClicked(false);
          }}
          onClick={on_input_submit}
        />
      ) : (
        <Icon
          src="stop"
          alt="stop"
          style={{
            transition:
              "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), bottom 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

            userSelect: "none",
            draggable: "false",
            position: "fixed",
            transform: "translate(-50%, -50%)",

            bottom: 14,
            right: -9,
            width: 16,
            height: 16,
            cursor: "pointer",

            padding: 8,
            borderRadius: 7,
            backgroundColor: style.backgroundColor,
            border: style.border,
            boxShadow: style.boxShadow,
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClicked(false);
          }}
          onMouseDown={() => {
            setOnClicked(true);
          }}
          onMouseUp={() => {
            setOnClicked(false);
          }}
          onClick={() => {
            force_stop_ollama();
          }}
        />
      )}
      <Input_Function_Panel value={inputValue} menuWidth={menuWidth} />
      <Model_Selector value={inputValue} setMenuWidth={setMenuWidth} />
    </div>
  );
};

const Chat = () => {
  const { RGB } = useContext(ConfigContexts);
  const {
    sectionData,
    update_title,
    update_message_on_index,
    append_message,
    save_input_images,
  } = useContext(DataContexts);
  const { windowWidth, onSideMenu } = useContext(StatusContexts);
  const {
    run,
    ollama_chat_completion_streaming,
    ollama_update_title_no_streaming,
    ollama_image_to_text,
  } = useContext(RequestContexts);

  const [inputValue, setInputValue] = useState("");
  const [inputImages, setInputImages] = useState([]);
  const [inputHeight, setInputHeight] = useState(0);
  const [awaitResponse, setAwaitResponse] = useState(null);
  const [onFileDragOver, setOnFileDragOver] = useState(false);

  /* { Target Address } ------------------------------------------------------------------------------ */
  const [targetAddress, setTargetAddress] = useState(sectionData.address || "");
  useEffect(() => {
    if (awaitResponse === null) {
      setTargetAddress(sectionData.address || "");
    }
  }, [sectionData, awaitResponse]);
  /* { Target Address } ------------------------------------------------------------------------------ */

  /* { PreLoading } ================================================================================== */
  const [arrivedAtPosition, setArrivedAtPosition] = useState(false);
  const [preLoadingCompleted, setPreLoadingCompleted] = useState(false);
  useEffect(() => {
    if (arrivedAtPosition) {
      setPreLoadingCompleted(true);
    }
  }, [arrivedAtPosition]);
  useEffect(() => {
    if (targetAddress !== sectionData.address) {
      setPreLoadingCompleted(false);
      setArrivedAtPosition(false);
    }
  }, [targetAddress, sectionData]);
  /* { PreLoading } ================================================================================== */

  /* { Input Section } ------------------------------------------------------------------------------- */
  const on_input_submit = useCallback(() => {
    if (sectionData.on_mode === "terminal") {
      return;
    } else if (sectionData.on_mode === "chat") {
      if (
        inputValue.length > 0 &&
        awaitResponse === null &&
        sectionData.language_model_using
      ) {
        let image_keys = [];
        if (inputImages.length > 0) {
          image_keys = save_input_images(targetAddress, inputImages);
        }
        append_message(targetAddress, {
          role: "user",
          message: inputValue,
          content: inputValue,
          images: image_keys.length > 0 ? image_keys : null,
        });
        setInputValue("");
      }
    }
  }, [inputValue, inputImages, awaitResponse, sectionData]);
  const update_message = useCallback(
    (address, messages, index) => {
      setAwaitResponse(index);

      if (index === -1) {
        append_message(address, {
          role: "assistant",
          message: LOADING_TAG,
          content: "",
          expanded: true,
        });
      } else if (index < 0 || index >= messages.length) {
        return;
      } else {
        update_message_on_index(address, index, {
          role: "assistant",
          message: LOADING_TAG,
          content: "",
          expanded: true,
        });
      }

      if (inputImages.length > 0) {
        run({
          start: {
            type: "start_node",
            next_nodes: ["basically_describe_the_images"],
          },
          basically_describe_the_images: {
            type: "image_to_text_node",
            model_used: "llava:13b",
            model_provider: "ollama",
            update_callback: (response) => {},
            input: "input_images",
            prompt: "",
            output: "basic_description_for_images",
            next_nodes: ["generate_prompt_for_itt_model"],
          },
          generate_prompt_for_itt_model: {
            type: "prompt_generation_node",
            model_used: sectionData.language_model_using,
            model_provider: "ollama",
            update_callback: () => {},
            input: "chat_messages",
            prompt:
              "base on the chat message and this image descriptions below ${basic_description_for_images}$ " +
              "If you think the image descriptions are not enough to answer the user question, " +
              "Try to generate a prompt for the image to text model, " +
              "So to let the image to text model to take a closer look at the images and generate a more detailed description for the images, " +
              "Otherwise you can reply nothing.",
            output: "llm_generated_prompt_for_itt_model",
            next_nodes: ["deeper_look_at_the_images"],
          },
          deeper_look_at_the_images: {
            type: "image_to_text_node",
            model_used: "llava:13b",
            model_provider: "ollama",
            update_callback: (response) => {},
            input: "input_images",
            prompt: "",
            output: "deeper_look_at_the_images",
            next_nodes: ["chat_completion_node"],
          },
          chat_completion_node: {
            type: "chat_completion_node",
            model_used: sectionData.language_model_using,
            model_provider: "ollama",
            update_callback: (response) => {
              update_message_on_index(address, index, {
                role: "assistant",
                message: response,
                content: response,
              });
            },
            input: "chat_messages",
            prompt:
              "here are the images u have seen ${basic_description_for_images}$ and a deeper description of the images ${deeper_look_at_the_images}$",
            output: "llm_generated_text",
            next_nodes:
              sectionData.n_turns_to_regenerate_title === 0
                ? ["title_generation_node"]
                : ["end"],
          },
          title_generation_node: {
            type: "title_generation_node",
            model_used: sectionData.language_model_using,
            model_provider: "ollama",
            update_callback: (response) => {
              update_title(address, response);
            },
            input: "chat_messages",
            prompt: "assistant: ${llm_generated_text}$",
            output: "llm_generated_title",
            next_nodes: ["end"],
          },
          end: {
            type: "end_node",
            next_nodes: [],
          },
          variables: {
            chat_messages: index === -1 ? messages : messages.slice(0, index),
            llm_generated_title: "",
            llm_generated_text: "",
            basic_description_for_images: "",
            llm_generated_prompt_for_itt_model: "",
            deeper_look_at_the_images: "",
            input_images: inputImages,
          },
        }).then(() => {
          setAwaitResponse(null);
          setInputImages([]);
        });

        // ollama_image_to_text(inputImages, messages).then((response) => {
        //   setInputImages([]);
        //   ollama_chat_completion_streaming(
        //     sectionData.language_model_using,
        //     address,
        //     messages,
        //     index,
        //     update_message_on_index,
        //     vision_prompt + response
        //   )
        //     .then((response) => {
        //       setAwaitResponse(null);
        //     })
        //     .finally(() => {
        //       if (sectionData.n_turns_to_regenerate_title === 0) {
        //         ollama_update_title_no_streaming(
        //           sectionData.language_model_using,
        //           address,
        //           messages,
        //           update_title
        //         );
        //       }
        //     });
        // });
      } else {
        run({
          start: {
            type: "start_node",
            next_nodes: ["chat_completion_node"],
          },
          chat_completion_node: {
            type: "chat_completion_node",
            model_used: sectionData.language_model_using,
            model_provider: "ollama",
            update_callback: (response) => {
              update_message_on_index(address, index, {
                role: "assistant",
                message: response,
                content: response,
              });
            },
            input: "chat_messages",
            prompt: "",
            output: "llm_generated_text",
            next_nodes:
              sectionData.n_turns_to_regenerate_title === 0
                ? ["title_generation_node"]
                : ["end"],
          },
          title_generation_node: {
            type: "title_generation_node",
            model_used: sectionData.language_model_using,
            model_provider: "ollama",
            update_callback: (response) => {
              update_title(address, response);
            },
            input: "chat_messages",
            prompt: "assistant: ${llm_generated_text}$",
            output: "llm_generated_title",
            next_nodes: ["end"],
          },
          end: {
            type: "end_node",
            next_nodes: [],
          },
          variables: {
            chat_messages: index === -1 ? messages : messages.slice(0, index),
            llm_generated_text: "",
            llm_generated_title: "",
          },
        }).then(() => {
          setAwaitResponse(null);
        });
      }
    },
    [inputValue, sectionData.language_model_using, inputImages]
  );
  useEffect(() => {
    const messages = sectionData.messages || [];
    const address = targetAddress || "";
    if (address.length === 0) {
      return;
    }
    if (
      awaitResponse === null &&
      messages.length > 0 &&
      messages[messages.length - 1].role === "user"
    ) {
      update_message(address, messages, -1);
    }
  }, [sectionData, targetAddress, awaitResponse]);
  /* { Input Section } ------------------------------------------------------------------------------- */

  return (
    <ChatContexts.Provider
      value={{
        targetAddress,

        awaitResponse,
        setAwaitResponse,
        arrivedAtPosition,
        setArrivedAtPosition,
        preLoadingCompleted,
        setPreLoadingCompleted,
        inputHeight,
        setInputHeight,
        inputImages,
        setInputImages,

        update_message,
      }}
    >
      <div
        style={{
          transition: "all 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 0,
          left: windowWidth > side_menu_width_threshold && onSideMenu ? 300 : 0,

          width:
            windowWidth > side_menu_width_threshold && onSideMenu
              ? "calc(100% - 300px)"
              : "100%",
          height: "100%",
        }}
        onDragOver={(e) => {
          if (onFileDragOver) return;
          setOnFileDragOver(true);
        }}
      >
        <Message_Scrolling_List />
        {sectionData.on_mode === "terminal" ? <Term /> : null}
        <Input_Box
          inputValue={inputValue}
          setInputValue={setInputValue}
          on_input_submit={on_input_submit}
        />
        <div
          style={{
            position: "absolute",
            top: -9,
            left: 9,
            right: 9,

            height: 64,
            background: `linear-gradient(to bottom,  rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1) 0%, rgba(0, 0, 0, 0)) 100%`,
            pointerEvents: "none",
          }}
        ></div>
        {onFileDragOver ? (
          <FileDropZone
            onFileDragOver={onFileDragOver}
            setOnFileDragOver={setOnFileDragOver}
            setInputImages={setInputImages}
          />
        ) : null}
      </div>
    </ChatContexts.Provider>
  );
};

export default Chat;
