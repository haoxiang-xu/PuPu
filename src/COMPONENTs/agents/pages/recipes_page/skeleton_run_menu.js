import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { ControlHint } from "./canvas_chrome";

/* Run, in the control center: opens the Test panel. */

export const RUN_UNAVAILABLE = "Running from here is not available yet. Start a chat with this Agent to run it.";

export function RunTrigger({ open, onToggle, testId }) {
  const { t } = useTranslation();
  /* Icon only: a play triangle needs no word, the way Home needs none. The
     name stays in the tooltip and for assistive tech. */
  return (
    <ControlHint label={t("agents.run_menu.run")} testId={testId ? `${testId}-hint` : undefined}>
      <Button
        prefix_icon="play"
        ariaLabel={t("agents.run_menu.open")}
        onClick={onToggle}
        dom_props={{ "data-testid": testId }}
        style={{
          fontSize: 12,
          paddingVertical: 5,
          paddingHorizontal: 8,
          borderRadius: 7,
          opacity: open ? 1 : 0.7,
          content: { icon: { width: 13, height: 13 } },
        }}
      />
    </ControlHint>
  );
}
