import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import {
  ComputerUseConsentModal,
  useComputerUseConsent,
} from "./consent_modal";
import { readComputerUseConsent } from "../../../SERVICEs/computer_use_consent_store";

// The modal's close button renders an Icon; stub it out.
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const withProviders = (ui, themeMode = "light_mode") =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{ onThemeMode: themeMode, theme: { font: {}, modal: {} } }}
      >
        {ui}
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

beforeEach(() => {
  window.localStorage.clear();
});

/* The six disclosure points required by the informed-consent contract:        */
/* five bullet disclosures + one explicit affirmative button.                    */
const BULLET_MATCHERS = [
  /control your real desktop mouse and keyboard/i, // ① real desktop, not sandbox
  /sent to the selected model provider.*local Ollama model/i, // ② provider/local destination
  /Malicious content on your screen/i, // ③ on-screen injection risk
  /asks for your confirmation before it runs/i, // ④ per-action confirmation
  /revoke the permission in your system settings/i, // ⑤ off / revoke anytime
];

describe("ComputerUseConsentModal", () => {
  test("renders the six informed-consent points when open", async () => {
    withProviders(
      <ComputerUseConsentModal
        open
        onAgree={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    for (const matcher of BULLET_MATCHERS) {
      await waitFor(() =>
        expect(screen.getByText(matcher)).toBeInTheDocument(),
      );
    }
    // ⑥ the explicit affirmative button — close / backdrop is NOT consent.
    expect(screen.getByText("I understand, enable")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  test("affirmative button fires onAgree; decline fires onDecline", async () => {
    const onAgree = jest.fn();
    const onDecline = jest.fn();
    const { rerender } = withProviders(
      <ComputerUseConsentModal open onAgree={onAgree} onDecline={onDecline} />,
    );

    await waitFor(() =>
      expect(screen.getByText("I understand, enable")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("I understand, enable"));
    expect(onAgree).toHaveBeenCalledTimes(1);

    onAgree.mockClear();
    onDecline.mockClear();
    rerender(
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <ConfigContext.Provider
          value={{ onThemeMode: "light_mode", theme: { font: {}, modal: {} } }}
        >
          <ComputerUseConsentModal
            open
            onAgree={onAgree}
            onDecline={onDecline}
          />
        </ConfigContext.Provider>
      </LocaleContext.Provider>,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAgree).not.toHaveBeenCalled();
  });
});

/* Harness that exercises the gate and surfaces its resolved value. */
const Harness = () => {
  const { requireComputerUseConsent, consentRecord, consentModal } =
    useComputerUseConsent();
  const [result, setResult] = useState("pending");

  return (
    <div>
      <button
        onClick={async () => {
          const agreed = await requireComputerUseConsent();
          setResult(String(agreed));
        }}
      >
        trigger
      </button>
      <div data-testid="result">{result}</div>
      <div data-testid="record">{consentRecord ? "has" : "none"}</div>
      {consentModal}
    </div>
  );
};

describe("useComputerUseConsent gate", () => {
  test("no consent → agree records consent and resolves true", async () => {
    withProviders(<Harness />);

    expect(screen.getByTestId("record")).toHaveTextContent("none");
    fireEvent.click(screen.getByText("trigger"));

    await waitFor(() =>
      expect(screen.getByText("I understand, enable")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("I understand, enable"));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("record")).toHaveTextContent("has");

    const persisted = readComputerUseConsent();
    expect(persisted).not.toBeNull();
    expect(persisted.version).toBe(1);
    expect(Number.isFinite(Date.parse(persisted.acceptedAt))).toBe(true);
  });

  test("no consent → decline writes nothing and resolves false", async () => {
    withProviders(<Harness />);

    fireEvent.click(screen.getByText("trigger"));
    await waitFor(() =>
      expect(screen.getByText("Cancel")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("record")).toHaveTextContent("none");
    expect(readComputerUseConsent()).toBeNull();
  });

  test("valid consent on record → gate resolves true and opens no modal", async () => {
    // Seed a valid record before the component reads it.
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify({ version: 1, acceptedAt: new Date().toISOString() }),
    );

    withProviders(<Harness />);
    fireEvent.click(screen.getByText("trigger"));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent("true"),
    );
    // The affirmative button must never appear — consent was already on record.
    expect(screen.queryByText("I understand, enable")).toBeNull();
  });
});
