import React from "react";
import { render, screen } from "@testing-library/react";
import Tooltip from "./tooltip";
import { Z } from "../layer/z_layers";

test.each([[undefined, Z.TOOLTIP], ["popover", Z.POPOVER], ["unknown", Z.TOOLTIP]])(
  "the engine places layer %s on the outer portal", async (layer, expected) => {
    render(<Tooltip open layer={layer} tooltip_component={<span data-testid="layer-content">content</span>}><button>anchor</button></Tooltip>);
    const content = await screen.findByTestId("layer-content");
    expect(content.closest('[role="tooltip"]').style.zIndex).toBe(String(expected));
  },
);
