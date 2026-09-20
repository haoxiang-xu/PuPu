# Update settings: remove the feature gate

Owner request: make the existing Update settings page unconditional. Remove its feature definition, navigation filter and flag subscription. Updater services, install/restart actions, platform support and user preferences are unchanged.

BC-001: stored/build feature-flag input -> feature service -> settings navigation. The existing CLOSED definition registry no longer admits the retired key; legacy values are ignored on read and dropped during normal subsequent writes. No storage migration or appearance/update preference deletion. Navigation always includes the existing Update component. No IPC, backend, Unchain protocol, release profile or artifact pairing changes apply.

SEQ-001 / AC-001: open settings without flag configuration -> select Update -> existing update page mounts. Existing legacy-snapshot rejection and explicit-false override tests continue to cover supported flags using an Agents build default, preserving coverage after removing the only code-default-true flag. Repeated reads retain explicit supported-flag choices. Malformed storage and unknown-key rejection remain covered by the feature-service suite.

GitNexus impact returned UNKNOWN for the flag property and SettingsModalContent. Text inspection confirms the lazy settings-modal consumer and generated developer flag list; no additional runtime/build references were found. No automatic update, installation or deployment is performed by this change.

Verification: 13 tests passed across feature_flags and settings_modal, including selecting Update without configuration. No retired flag reference remains in src/electron/scripts/contracts/workflows; whitespace checks passed. GitNexus change analysis was run; its graph retains the index's documented coverage limits. Test log: `/tmp/update-flag-tests.log`.
