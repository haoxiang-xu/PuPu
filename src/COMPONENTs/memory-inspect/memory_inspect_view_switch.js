import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Button from "../../BUILTIN_COMPONENTs/input/button";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */

/* The two views the inspector can show. Frozen and exported so the modal and
   the tests name them from one place rather than passing bare strings. */
export const MEMORY_INSPECT_VIEWS = Object.freeze({
  VECTOR: "vector",
  TREE: "tree",
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  MemoryInspectViewSwitch                                                */
/*                                                                         */
/*  A two-segment control that floats above BOTH views (the tree is a       */
/*  full-bleed overlay over the scatter, so the switcher has to outrank it) */
/*  and stays in exactly one screen position across the switch — a control  */
/*  that moves when you use it reads as two different controls.             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const MemoryInspectViewSwitch = ({ view, onChange }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const track_bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const track_border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.07)";
  const selected_bg = isDark ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.95)";

  const segments = [
    { id: MEMORY_INSPECT_VIEWS.VECTOR, label: t("memory_inspect.view_vectors") },
    { id: MEMORY_INSPECT_VIEWS.TREE, label: t("memory_inspect.view_tree") },
  ];

  return (
    <div
      data-testid="memory-inspect-view-switch"
      style={{
        /* Below the title AND the chat-title subtitle (title bottom ~46,
           subtitle bottom ~62). Fixed rather than flowed, so it does not
           shift between a chat that has a title and one that does not — the
           tree view reserves a matching 108px header band. */
        position: "absolute",
        top: 72,
        left: 24,
        zIndex: 4,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 9,
        backgroundColor: track_bg,
        border: track_border,
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
      }}
    >
      {segments.map((segment) => {
        const active = view === segment.id;
        return (
          <Button
            key={segment.id}
            label={segment.label}
            onClick={() => onChange(segment.id)}
            style={{
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 11,
              borderRadius: 7,
              opacity: active ? 1 : 0.45,
              backgroundColor: active ? selected_bg : "transparent",
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.06)",
            }}
          />
        );
      })}
    </div>
  );
};

export { MemoryInspectViewSwitch as default, MemoryInspectViewSwitch };
