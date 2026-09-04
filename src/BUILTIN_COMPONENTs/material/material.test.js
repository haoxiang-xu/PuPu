import React from "react";
import { render } from "@testing-library/react";

import {
  MaterialProvider,
  useMaterial,
  resolveComponentMaterial,
} from "./index";

/* A probe that reports whatever useMaterial() currently resolves to. */
const Probe = ({ testid = "probe" }) => {
  const material = useMaterial();
  return <span data-testid={testid}>{material}</span>;
};

describe("useMaterial / MaterialProvider", () => {
  it("resolves to 'plain' by default (no provider)", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe")).toHaveTextContent("plain");
  });

  it("takes the material from the nearest provider", () => {
    const { getByTestId } = render(
      <MaterialProvider material="glass">
        <Probe />
      </MaterialProvider>,
    );
    expect(getByTestId("probe")).toHaveTextContent("glass");
  });

  it("nested inner provider overrides the outer one", () => {
    const { getByTestId } = render(
      <MaterialProvider material="glass">
        <Probe testid="outer" />
        <MaterialProvider material="plain">
          <Probe testid="inner" />
        </MaterialProvider>
      </MaterialProvider>,
    );
    expect(getByTestId("outer")).toHaveTextContent("glass");
    expect(getByTestId("inner")).toHaveTextContent("plain");
  });

  it("bare provider (no material prop) inherits the parent value — passthrough", () => {
    const { getByTestId } = render(
      <MaterialProvider material="glass">
        <MaterialProvider>
          <Probe />
        </MaterialProvider>
      </MaterialProvider>,
    );
    expect(getByTestId("probe")).toHaveTextContent("glass");
  });
});

describe("resolveComponentMaterial", () => {
  const SUPPORTED = { plain: () => null, glass: () => null };
  const FALLBACK = "plain";

  it("returns the requested material when supported", () => {
    expect(resolveComponentMaterial("glass", SUPPORTED, FALLBACK)).toBe("glass");
  });

  it("falls back to the component's own default when unsupported", () => {
    expect(resolveComponentMaterial("frosted", SUPPORTED, FALLBACK)).toBe("plain");
  });

  it("falls back when requested is undefined", () => {
    expect(resolveComponentMaterial(undefined, SUPPORTED, FALLBACK)).toBe("plain");
  });
});
