import { useContext, useEffect, useState } from "react";
import { NavigationContext } from "../../CONTAINERs/config/context";
import { TOP_BAR_HEIGHT } from "../../BUILTIN_COMPONENTs/electron/title_bar";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../SERVICEs/feature_flags";
import { AgentsModalContent } from "./agents_modal_content";

/* The app shell offsets its content box this far from the window top (see
   ConfigContainer). The workspace starts below the title bar instead, because
   the bar is a drag region drawn above the content and would swallow clicks
   on the controls along the workspace's top strip. */
const SHELL_CONTENT_TOP = 18;
const SIDE_MENU_WIDTH = 320;

/**
 * The Agents builder as a full surface beside the chat rather than a modal
 * over it. The side menu drills into it ("Agents ›") and back ("‹ Chats");
 * the agent list renders in the side menu's Agents pane, the graph fills the
 * window.
 */
export default function AgentsWorkspace({ active }) {
  const nav = useContext(NavigationContext) || {};
  const { onFragment, setAppMode, agentsSidebarSlot } = nav;
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);
  const isAgentsEnabled = featureFlags.enable_user_access_to_agents === true;
  const isCharactersEnabled =
    featureFlags.enable_user_access_to_characters === true;

  const defaultSection = isAgentsEnabled ? "agents" : "characters";
  const [selectedSection, setSelectedSection] = useState(defaultSection);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  useEffect(() => {
    if (selectedSection === "agents" && !isAgentsEnabled) {
      setSelectedSection(defaultSection);
    }
  }, [selectedSection, isAgentsEnabled, defaultSection]);

  /* Escape used to close the modal after first stepping out of a selected
     node. With no modal left to close it only does the first half; leaving
     the workspace is the side menu's "‹ Chats". The canvas stops the key
     itself when it uses it (drilling up out of a subagent). */
  useEffect(() => {
    if (!active || !selectedNodeId) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      setSelectedNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedNodeId]);

  const backToChat = () => {
    if (typeof setAppMode === "function") setAppMode("chat");
  };

  return (
    <div
      data-testid="agents-workspace"
      aria-hidden={active ? undefined : true}
      style={{
        position: "absolute",
        top: TOP_BAR_HEIGHT - SHELL_CONTENT_TOP,
        left: onFragment === "side_menu" ? SIDE_MENU_WIDTH : 0,
        right: 0,
        bottom: 0,
        transition: "left 0.3s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "var(--pupu-text)",
        visibility: active ? "visible" : "hidden",
      }}
    >
      <AgentsModalContent
        isAgentsEnabled={isAgentsEnabled}
        isCharactersEnabled={isCharactersEnabled}
        selectedSection={selectedSection}
        onSectionChange={setSelectedSection}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        fullscreen={false}
        explorerSlot={agentsSidebarSlot || null}
        explorerDocked
        onClose={backToChat}
      />
    </div>
  );
}
