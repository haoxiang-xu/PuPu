import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeModelCatalogRefresh } from "../../SERVICEs/model_catalog_refresh";
import { useOllamaInstalled } from "../settings/local_storage/hooks/use_ollama_installed";
import {
  ADD_CUSTOM_RAIL_ID,
  RAIL_KIND,
  buildProviderRailEntries,
  defaultRailSelection,
  hasConfiguredProvider,
} from "./rail_entries";
import { ProviderRail } from "./provider_rail";
import { KeyProviderPane } from "./panes/key_provider_pane";
import { WelcomePane } from "./panes/welcome_pane";
import { OllamaPane } from "./panes/ollama_pane";
import { CustomProviderPane } from "./panes/custom_provider_pane";
import { AddProviderPane } from "./panes/add_provider_pane";

/**
 * ModelProvidersModalContent — rail + pane (#204, design A1).
 *
 * The rail's entries are rebuilt on every catalog refresh (a saved or cleared
 * key emits one through the store helpers) so the B1 dots follow the truth
 * without the user reopening. Ollama's dot comes from the shared installed
 * hook, which is the same state the Ollama pane renders.
 *
 * Selection rules:
 *   - open with `initialEntryId` when the caller knows where to land
 *     (Settings → Model Providers hands over "openai" today);
 *   - otherwise the first configured provider; with none, the G3 welcome
 *     pane, which is reachable only while nothing is configured;
 *   - a selection that disappears (custom provider deleted) falls back the
 *     same way.
 */

const WELCOME_ID = "__welcome__";

export const ModelProvidersModalContent = ({ open = true, initialEntryId = null }) => {
  const ollama = useOllamaInstalled({ enabled: open });
  const ollamaReady = ollama.status === "ready";

  const [tick, setTick] = useState(0);
  useEffect(() => subscribeModelCatalogRefresh(() => setTick((n) => n + 1)), []);

  const entries = useMemo(
    () => buildProviderRailEntries({ ollamaReady }),
    // `tick` is the catalog-refresh signal the builder's readers depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ollamaReady, tick],
  );
  const anyConfigured = hasConfiguredProvider(entries);

  const [selectedId, setSelectedId] = useState(() =>
    initialEntryId || (anyConfigured ? defaultRailSelection(entries) : WELCOME_ID),
  );

  /* Reset between openings so a reopen lands on the default again, not on
     whatever was last inspected. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedId(
        initialEntryId || (anyConfigured ? defaultRailSelection(entries) : WELCOME_ID),
      );
    }
  }

  /* Two fallbacks. A vanished selection (deleted custom provider) falls
     back the same way the opening rule chose. And the welcome pane is only
     for "nothing usable": the Ollama probe resolves after the first render,
     so when it (or a key saved from another surface) lights a dot while
     the welcome is up, move to that provider — AC-06. */
  const selectedEntry = entries.find((e) => e.id === selectedId) || null;
  useEffect(() => {
    if (selectedId === WELCOME_ID) {
      if (anyConfigured) {
        setSelectedId(defaultRailSelection(entries));
      }
      return;
    }
    if (!selectedEntry) {
      setSelectedId(anyConfigured ? defaultRailSelection(entries) : WELCOME_ID);
    }
  }, [selectedId, selectedEntry, anyConfigured, entries]);

  const handleSelect = useCallback((id) => setSelectedId(id), []);

  /* After a custom provider is created from the Add pane, land on it. */
  const handleCustomCreated = useCallback((railId) => {
    setSelectedId(railId);
  }, []);

  let pane = null;
  if (selectedId === WELCOME_ID || !selectedEntry) {
    pane = <WelcomePane entries={entries} onSelect={handleSelect} />;
  } else if (
    selectedEntry.kind === RAIL_KIND.NATIVE ||
    selectedEntry.kind === RAIL_KIND.SHIPPED
  ) {
    pane = <KeyProviderPane entry={selectedEntry} />;
  } else if (selectedEntry.kind === RAIL_KIND.OLLAMA) {
    pane = <OllamaPane ollama={ollama} />;
  } else if (selectedEntry.kind === RAIL_KIND.CUSTOM) {
    pane = (
      <CustomProviderPane
        entry={selectedEntry}
        onDeleted={() => setSelectedId(ADD_CUSTOM_RAIL_ID)}
      />
    );
  } else if (selectedEntry.kind === RAIL_KIND.ADD_CUSTOM) {
    pane = <AddProviderPane onCreated={handleCustomCreated} />;
  }

  return (
    <>
      <ProviderRail
        entries={entries}
        selectedId={selectedEntry ? selectedEntry.id : null}
        onSelect={handleSelect}
      />
      <div
        data-testid="model-providers-pane"
        className="scrollable"
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          padding: "24px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        {pane}
      </div>
    </>
  );
};

export default ModelProvidersModalContent;
