import { render, screen, waitFor } from "@testing-library/react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import { __mockApi as mockApi } from "../../SERVICEs/api.miso";
import { MemoryInspectModal } from "./memory_inspect_modal";

jest.mock("../../SERVICEs/api.miso", () => {
  const api = {
    getLongTermMemoryProjection: jest.fn(),
    getMemoryProjection: jest.fn(),
  };
  return {
    __mockApi: api,
    createMisoApi: () => api,
  };
});

jest.mock("../../BUILTIN_COMPONENTs/modal/modal", () => {
  return function MockModal({ open, children }) {
    return open ? <div>{children}</div> : null;
  };
});

jest.mock("../../BUILTIN_COMPONENTs/scatter", () => ({
  Scatter: () => <div data-testid="scatter" />,
}));

jest.mock("../../BUILTIN_COMPONENTs/select/select", () => ({
  Select: () => null,
}));

jest.mock("../../BUILTIN_COMPONENTs/input/slider", () => ({
  Slider: () => null,
}));

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ onClick }) {
    return <button onClick={onClick}>button</button>;
  };
});

jest.mock("../../BUILTIN_COMPONENTs/input/segmented_button", () => {
  return function MockSegmentedButton({ options, value, on_change }) {
    return (
      <div data-testid="segmented-button">
        {options.map((opt) => (
          <button
            key={opt.value}
            data-selected={opt.value === value ? "true" : "false"}
            onClick={() => on_change(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  };
});

describe("MemoryInspectModal long-term profiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows stored long-term profiles when there are no vectors", async () => {
    mockApi.getLongTermMemoryProjection.mockResolvedValue({
      points: [],
      variance: [0, 0],
      profiles: [
        {
          id: "pupu_default.json",
          storage_key: "pupu_default",
          size_bytes: 64,
          preview: '{"preferences":{"tone":"concise"}}',
          document: {
            preferences: {
              tone: "concise",
            },
          },
        },
      ],
    });

    render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <MemoryInspectModal open={true} onClose={() => {}} mode="long_term" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(mockApi.getLongTermMemoryProjection).toHaveBeenCalledTimes(1);
    });

    /* Auto-switches to JSON view when no vectors exist */
    expect(screen.getByText("1 stored profile.")).toBeInTheDocument();
    expect(screen.getByText("pupu_default")).toBeInTheDocument();
    expect(screen.getByText(/"tone": "concise"/)).toBeInTheDocument();
  });
});
