import { useState, useContext, useEffect, useRef } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Tooltip from "../../BUILTIN_COMPONENTs/tooltip/tooltip";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SegmentedButton from "../../BUILTIN_COMPONENTs/input/segmented_button";
import Carousel from "../../BUILTIN_COMPONENTs/carousel/carousel";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Sections } -------------------------------------------------------------------------------------------------------------- */
import SwitchDemo from "./individual_component_demo/switch_demo";
import SliderDemo from "./individual_component_demo/slider_demo";
import SpinnerDemo from "./individual_component_demo/spinner_demo";
import InputDemo from "./individual_component_demo/input_demo";
import TextFieldDemo from "./individual_component_demo/textfield_demo";
import ButtonDemo from "./individual_component_demo/button_demo";
import MarkdownDemo from "./individual_component_demo/markdown_demo";
import SelectDemo from "./individual_component_demo/select_demo";
import CardDemo from "./individual_component_demo/card_demo";
import IconDemo from "./individual_component_demo/icon_demo";
import OthersDemo from "./individual_component_demo/others_demo";
import DndDemo from "./individual_component_demo/dnd_demo";
import ExplorerDemo from "./individual_component_demo/explorer_demo";
import ModalDemo from "./individual_component_demo/modal_demo";
import FlowEditorDemo from "./individual_component_demo/flow_editor_demo";
import CarouselDemo from "./individual_component_demo/carousel_demo";
import SettingsShowroom from "./show_room_demo/settings_showroom";
import ChatShowroom from "./show_room_demo/chat_showroom";
import ChatExplorerShowroom from "./show_room_demo/chat_explorer_showroom";
/* { Sections } -------------------------------------------------------------------------------------------------------------- */

const Landing = ({ tab, onTabChange }) => {
  const { theme } = useContext(ConfigContext);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "64px 24px 0",
        textAlign: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          width: 128,
          height: 128,
          marginBottom: 32,
          color: theme?.color || "black",
        }}
      >
        <Icon src="mini_ui" />
      </div>
      <h1
        style={{
          fontSize: 72,
          fontWeight: 400,
          fontFamily: "NunitoSans",
          color: theme?.color || "black",
          margin: 0,
          letterSpacing: "-1.5px",
          lineHeight: 1.1,
        }}
      >
        mini UI
      </h1>
      <p
        style={{
          fontSize: 18,
          fontFamily: "Jost, sans-serif",
          color: theme?.color || "black",
          opacity: 0.4,
          margin: "16px 0 0",
          maxWidth: 480,
          lineHeight: 1.6,
        }}
      >
        A starting point for your React Project.
      </p>
      <div style={{ marginTop: 32 }}>
        <SegmentedButton
          options={["Components", "Show Rooms"]}
          value={tab}
          on_change={onTabChange}
        />
      </div>
      <div
        style={{
          marginTop: 48,
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: theme?.color || "black",
            opacity: 0.25,
          }}
        >
          v0.1.0
        </span>
      </div>
      {/* scroll hint */}
      <div
        style={{
          position: "absolute",
          bottom: 36,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity: 0.36,
          color: theme?.color || "black",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontFamily: "Jost, sans-serif",
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          Scroll
        </span>
        <svg
          width="16"
          height="24"
          viewBox="0 0 16 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 4 L8 18 M3 14 L8 20 L13 14" />
        </svg>
      </div>
    </div>
  );
};

const CustomizedTooltip = ({ children, code }) => {
  return (
    <Tooltip
      position="bottom"
      tooltip_component={
        <Markdown
          style={{
            pre: {
              margin: 0,
              border: "1px solid #E0E0E0",
            },
            code: {
              margin: 0,
            },
          }}
        >
          {code}
        </Markdown>
      }
      trigger={["hover"]}
      style={{
        padding: 4,
        borderRadius: 10,
      }}
      open_delay={600}
      close_delay={80}
    >
      {children}
    </Tooltip>
  );
};
const Demo = () => {
  const { theme } = useContext(ConfigContext);
  const scrollRef = useRef(null);
  const [tab, setTab] = useState("Components");
  const [chatShowroomIndex, setChatShowroomIndex] = useState(0);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tab]);
  return (
    <div
      id="demo"
      style={{
        transition: "background-color 0.36s cubic-bezier(0.32, 1, 0.32, 1)",
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",

        backgroundColor: theme?.backgroundColor || "white",
      }}
    >
      <div
        ref={scrollRef}
        id="component_scroll_container"
        className="scrollable"
        style={{
          position: "absolute",
          top: 0,
          left: 4,
          right: 4,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          paddingBottom: "512px",
          overflow: "scroll",
        }}
      >
        <Landing tab={tab} onTabChange={setTab} />
        {tab === "Components" && (
          <div
            style={{
              position: "relative",
              margin: "0 auto",
              width: "75%",
              minWidth: 700,
              maxWidth: 1000,
              paddingBottom: "512px",
            }}
          >
            <SwitchDemo />
            <SliderDemo />
            <SpinnerDemo />
            <InputDemo />
            <TextFieldDemo />
            <ButtonDemo />
            <SelectDemo />
            <CardDemo />
            <MarkdownDemo />
            <DndDemo />
            <ExplorerDemo />
            <ModalDemo />
            <FlowEditorDemo />
            <CarouselDemo />
            <OthersDemo />
            <IconDemo />
          </div>
        )}
        {tab === "Show Rooms" && (
          <div
            style={{
              position: "relative",
              margin: "0 auto",
              width: "85%",
              minWidth: 700,
              maxWidth: 1000,
              paddingBottom: "512px",
              display: "flex",
              flexDirection: "column",
              gap: 48,
              padding: "32px 24px 512px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <span
                style={{
                  width: "100%",
                  textAlign: "center",
                  fontSize: 18,
                  fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                  color: theme?.color || "black",
                  opacity: 0.7,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                Settings
              </span>
              <SettingsShowroom />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <span
                style={{
                  width: "100%",
                  textAlign: "center",
                  fontSize: 18,
                  fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                  color: theme?.color || "black",
                  opacity: 0.7,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                Chat
              </span>
              <Carousel
                items={[
                  { key: "chat", label: "Chat", component: <ChatShowroom /> },
                  {
                    key: "chat-explorer",
                    label: "Chat Explorer",
                    component: <ChatExplorerShowroom />,
                  },
                ]}
                render_item={({ item }) => (
                  <div style={{ width: "100%", height: "100%" }}>
                    {item.component}
                  </div>
                )}
                active_index={chatShowroomIndex}
                on_change={setChatShowroomIndex}
                card_width={820}
                card_height={520}
                card_gap={40}
                visible_count={3}
                max_rotate_y={0}
                overlap={0}
                style={{ backgroundColor: "transparent" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export { Demo as default, CustomizedTooltip };
