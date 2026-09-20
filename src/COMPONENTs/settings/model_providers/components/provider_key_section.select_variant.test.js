/**
 * The Platform row must use the SAME Select configuration as the Appearance
 * theme/language rows (design pick B2).
 *
 * This has its own suite because the failure it guards is invisible to every
 * other test: the row first shipped with Appearance's `option_style`
 * (`borderRadius: 14`) but WITHOUT `variant="palette"`. The palette variant owns
 * the dropdown panel's frosted look and radius, so the option corners ended up
 * fighting the panel's — a purely visual defect that rendered, behaved and
 * tested perfectly. Asserting the props is the only way to catch it in jsdom,
 * where the dropdown never paints.
 */
import { render } from "@testing-library/react";
import ProviderKeySection from "./provider_key_section";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { SHIPPED_PROVIDERS } from "../../../../SERVICEs/shipped_provider_registry";

const mockSelectProps = [];

jest.mock("../../../../BUILTIN_COMPONENTs/select/select", () => ({
  __esModule: true,
  default: (props) => {
    mockSelectProps.push(props);
    return null;
  },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

jest.mock("../../../../SERVICEs/provider_secret_status", () => ({
  __esModule: true,
  providerSecretConfigured: () => false,
}));

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  customProviderKey: (slug) => `custom.${slug}`,
  setCustomProviderSecret: jest.fn(),
  removeCustomProviderSecret: jest.fn(),
}));

jest.mock("../storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(),
}));

const kimi = SHIPPED_PROVIDERS.find((p) => p.id === "kimi");

const renderKimi = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <ProviderKeySection
        title={kimi.title}
        icon={kimi.icon}
        sites={kimi.sites}
        placeholder={kimi.placeholder}
      />
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  mockSelectProps.length = 0;
});

describe("platform Select configuration", () => {
  test("uses the palette variant that owns the dropdown's radius", () => {
    renderKimi();

    expect(mockSelectProps).toHaveLength(1);
    expect(mockSelectProps[0].variant).toBe("palette");
  });

  test("carries the palette variant's companion option and dropdown styling", () => {
    renderKimi();

    const props = mockSelectProps[0];
    // These three travel together. option_style's radius only reads correctly
    // inside the palette panel, so shipping one without the variant is the bug.
    expect(props.option_style).toEqual({ height: 24, borderRadius: 14 });
    expect(props.dropdown_style).toEqual({ width: 224, maxHeight: 220 });
    expect(props.filterable).toBe(false);
  });

  test("offers both Kimi sites, labelled with the host derived from the preset", () => {
    renderKimi();

    expect(mockSelectProps[0].options).toEqual([
      { value: "kimi", label: "model_providers.site_global · api.moonshot.ai" },
      { value: "kimi-cn", label: "model_providers.site_china · api.moonshot.cn" },
    ]);
    expect(mockSelectProps[0].value).toBe("kimi");
  });
});
