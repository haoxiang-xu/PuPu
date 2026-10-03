# Ticket 377: keep known token usage when some receipts are unavailable

Ticket: https://github.com/haoxiang-xu/PuPu/issues/377
Clone: `/Users/red/Desktop/GITRepo/pupu-377`, branch `codex/ticket-377-token-usage-unknown-usage`, base dev `f7e4fb3102a0`.

## Goal

Settings → Token Usage must show totals, average and charts computed from every
request whose usage is known, state how many requests in the window were
excluded because their usage is unavailable, and keep a window of only
unavailable requests (`—`) distinguishable from an empty window (`0`).

## Non-goals

- No change to `src/SERVICEs/run_bundle_storage.js`, the run-bundle IPC
  envelope, stored rows, or the legacy `token_usage` localStorage path.
- No new components, no design alternatives (project owner chose existing
  patterns), no changes to `StatCard`, `formatTokenCount`, `BarChart`.
- No commit, no push: the start phase leaves the tree dirty for review.

## Root cause (established, do not re-investigate)

`useTokenUsageData` in `src/COMPONENTs/settings/token_usage/index.js`
(lines 204-310 at base) sets `hasUnknownConsumedTokens` /
`hasUnknownInputTokens` / `hasUnknownOutputTokens` when any filtered record has
a non-numeric count. It then returns `null` totals, `null` average and `[]`
chart data, while `requestCount = filtered.length` still counts every record.
`formatTokenCount(null)` renders `—`. Unavailable counts come only from
canonical run-bundle receipts with `usage_source: "unavailable"` (failed
provider calls); `presentationRecordFromReceipt` maps them to
`consumed_tokens / input_tokens / output_tokens = null` on purpose.

## Decisions already made (the worker must not change these)

1. Per-metric sums. A record contributes to a metric when that metric is a
   finite number (`typeof v === "number" && Number.isFinite(v)`).
2. `excludedRequestCount` = filtered records whose `consumed_tokens` is not a
   finite number. `requestCount` stays `filtered.length`.
3. A metric total is `null` (renders `—`) only when `requestCount > 0` and no
   record has that metric; otherwise the numeric sum (`0` for an empty window).
4. `avgConsumedTokens`: `0` when `requestCount === 0`; `null` when no record has
   a known `consumed_tokens`; otherwise `Math.round(totalConsumed / knownConsumedCount)`.
5. `chartData` is `[]` only when no record has known `consumed_tokens`;
   `breakdownChartData` is `[]` only when no record has known input or output.
   Otherwise buckets are built from the known values (a bucket holding only
   unavailable records shows 0).
6. Exclusion note: rendered inside the Overview `SettingsSection`, directly
   after the `token-usage-overview-grid` div, only when
   `excludedRequestCount > 0`:
   `data-testid="token-usage-excluded-note"`, `role="note"`, style
   `{ fontSize: 12, lineHeight: 1.5, color: "var(--pupu-text-faint)", fontFamily, padding: "0 0 14px" }`
   (same voice as the `ChartTitle` description). Text from
   `t("token_usage.excluded_note", { excluded, total })` with both numbers
   passed through `.toLocaleString()`.
7. Chart empty state: when `requestCount > 0 && excludedRequestCount === requestCount`,
   both `BarChart` and `TokenBreakdownChart` receive
   `emptyMessage={t("token_usage.no_known_usage")}`; otherwise the existing
   `t("token_usage.no_data")`.
8. New locale keys under `token_usage` in all 11 files in `src/locales/`
   (`de, en, es, fr, it, ja, ko, pt-BR, ru, zh-CN, zh-TW`), inserted right after
   `no_data`:
   - `excluded_note`: en `"{excluded} of {total} requests excluded because their usage is unavailable"`
   - `no_known_usage`: en `"Usage is unavailable for every request in this range"`
   Translations (use exactly):
   - zh-CN: `"已排除 {excluded} / {total} 个请求，其用量不可用"` / `"该时间段内所有请求的用量均不可用"`
   - zh-TW: `"已排除 {excluded} / {total} 個請求，其用量不可用"` / `"此時間範圍內所有請求的用量均不可用"`
   - ja: `"{total} 件中 {excluded} 件のリクエストは使用量が不明のため除外しました"` / `"この期間のすべてのリクエストで使用量が取得できません"`
   - ko: `"{total}개 중 {excluded}개 요청은 사용량을 알 수 없어 제외되었습니다"` / `"이 기간의 모든 요청에서 사용량을 확인할 수 없습니다"`
   - de: `"{excluded} von {total} Anfragen ausgeschlossen, da ihr Verbrauch nicht verfügbar ist"` / `"Für keine Anfrage in diesem Zeitraum ist der Verbrauch verfügbar"`
   - es: `"{excluded} de {total} solicitudes excluidas porque su uso no está disponible"` / `"El uso no está disponible para ninguna solicitud de este período"`
   - fr: `"{excluded} demandes sur {total} exclues car leur utilisation est indisponible"` / `"L'utilisation n'est disponible pour aucune demande de cette période"`
   - it: `"{excluded} richieste su {total} escluse perché il loro utilizzo non è disponibile"` / `"L'utilizzo non è disponibile per nessuna richiesta di questo periodo"`
   - pt-BR: `"{excluded} de {total} solicitações excluídas porque seu uso está indisponível"` / `"O uso não está disponível para nenhuma solicitação deste período"`
   - ru: `"Исключено {excluded} из {total} запросов, так как их использование недоступно"` / `"Данные об использовании недоступны для всех запросов за этот период"`

## Files and reference patterns

- `src/COMPONENTs/settings/token_usage/index.js`
  - `useTokenUsageData` (aggregate), `TokenUsageSettings` (render). Keep the
    existing structure; add `excludedRequestCount` to the hook's return and
    destructure it in the component.
  - Existing pattern for faint captions: `ChartTitle`'s description `div`.
  - `TokenBreakdownChart` already takes `emptyMessage`; find where the
    component passes `t("token_usage.no_data")` to it and to `BarChart`.
- `src/COMPONENTs/settings/token_usage/index.test.js`
  - Use the `"TokenUsageSettings — canonical RunBundle mode"` describe block:
    `installRunBundleBridge([...])`, `renderTokenUsageSettings()`,
    `expectStatCardValue(label, value)`, `lastBarChartProps`. `Date.now` is
    mocked to `2026-08-14T12:00:00Z` there so the fixture is inside 30 days.
  - Mixed window fixture: `buildRunBundleV1({ multiModel: true, unavailable: true })`
    yields one bundle with an Anthropic receipt (known: consumed 450, input 350,
    output 100) and an OpenAI receipt with unavailable usage. Verified to
    normalize and project as two records.
- `src/locales/*.json` — `token_usage` object; keep JSON valid and the key order
  described above.

## Slice 1 (the only slice): tests first, then the fix

Permitted edit scope: the two files above plus the 11 locale files. Nothing else.

1. Add these tests to the canonical-mode describe block and run them; they must
   fail on the current code for the stated reason before you change `index.js`:
   - `"keeps known totals and reports excluded requests when some usage is unavailable"`:
     bridge with `[buildRunBundleV1({ multiModel: true, unavailable: true })]`;
     expect Consumed `"450"`, Input `"350"`, Output `"100"`, Requests `"2"`,
     Avg Consumed / Request `"450"`; `token-usage-excluded-note` text
     `"1 of 2 requests excluded because their usage is unavailable"`;
     `lastBarChartProps.data` sums to 450; `lastBarChartProps.emptyMessage`
     is `"No token usage data yet"`.
   - `"reports every request as excluded when no usage in the window is known"`:
     bridge with `[buildRunBundleV1({ unavailable: true })]`; expect the four
     `—` cards (already covered) plus note text
     `"1 of 1 requests excluded because their usage is unavailable"` and
     `lastBarChartProps.emptyMessage === "Usage is unavailable for every request in this range"`,
     and the breakdown chart element shows that same text.
   - Extend `"keeps a successful empty canonical query distinct from an unavailable query"`
     with `expect(screen.queryByTestId("token-usage-excluded-note")).not.toBeInTheDocument()`
     and Consumed `"0"`.
2. Implement decisions 1-8.
3. Run: `CI=true npx react-scripts test --watchAll=false src/COMPONENTs/settings/token_usage`
   (all green) and then the full renderer suite
   `CI=true npx react-scripts test --watchAll=false` (report the summary line).
4. Validate locale JSON: `for f in src/locales/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "BAD $f"; done`.

## Stop conditions

Stop and report (do not work around) if: the mixed fixture is rejected by the
bridge normalization; an existing token-usage test other than the one you
extend needs its expectation changed; the note or empty message needs a layout
change beyond the styles above; or any file outside the permitted scope needs
an edit.

## Checkpoint

One strong-model checkpoint after this slice: diff review, red→green evidence
(the new tests' failure output before the fix and the green run after), full
suite summary, locale validation. Do not commit or push.
