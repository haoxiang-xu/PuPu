# Proposed PuPu verification controls v0.1

Sources checked 2026-09-13. Recheck upstream versions and terms when selecting a pinned scanner. This is a PuPu policy assembled from relevant guidance, not a claim of complete conformance.

| Control | Required evidence | Applicability |
| --- | --- | --- |
| PV-01 Identity and integrity | Actual downloaded bytes, immutable source coordinates, publisher/package relationship, selected file and dependency manifests | Every artifact; hosted services get bounded endpoint identity/observation rather than an invented server digest |
| PV-02 Code and dependency risk | Entrypoints/install scripts, data flows, resolved dependency advisories and disposition | Executable components/dependencies; no executable payload is a justified narrower skill scope |
| PV-03 Instruction and tool metadata | Full selected instructions and reachable references, MCP descriptions/schemas/prompts/resources; intent, hidden actions, exfiltration and cross-tool manipulation analysis | Every agent-facing instruction surface |
| PV-04 Permissions and behavior | Enforced isolation, observed files/processes/network, credential boundaries, hostile-input probes and actual confirmation behavior | All supported execution paths; capability unavailable means NOT_RUN, not a waiver |
| PV-05 Reproducibility and lifecycle | Versioned policy/tool reports, actual reviewer, exact subject, sanitized evidence, recheck/revocation identity | Every report; publication needs durable, trusted record provenance |

## Reference mapping

- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html): use threat/permission/tool-poisoning/supply-chain/output-boundary guidance for PV-02/03/04. Select controls appropriate to the protocol and use case. Do not mechanically require authentication for a public read-only documentation endpoint, classify every imperative sentence as injection, or demand nonstandard message signing as a universal interoperability prerequisite.
- [OpenSSF OSPS Baseline](https://baseline.openssf.org/), current listed version v2026.08.28: maturity-sensitive source, release, dependency and vulnerability-management signals for PV-01/02/05. Record the exact version and selected control IDs if claiming an assessment. Missing upstream governance is not by itself proof of malicious code.
- [SLSA 1.2 artifact verification](https://slsa.dev/spec/v1.2/verifying-artifacts): verify provenance signatures and expected builder/build inputs against a configured trust root when evidence exists. A package hash by itself is not SLSA verification. Record missing provenance and limit the claim.

## Tool routing

**Instruction-only Skills:** [Cisco Skill Scanner](https://github.com/cisco-ai-defense/skill-scanner), with its local static/bytecode/pipeline/correlation analyzers and Python behavioral/dataflow analyzer where relevant. LLM/meta/cloud/VirusTotal analyzers are separate options with data/key requirements; do not enable uploads implicitly. Pin the selected tool version and rules before the run. Inspect `--help` for that version rather than assuming current flags are stable. The project's `is_safe` indicates no HIGH/CRITICAL detections, not freedom from all risks. Pair scanner evidence with contextual agent review and real host behavior.

**Dependencies:** [OSV-Scanner](https://google.github.io/osv-scanner/) against resolved lockfiles/SBOMs, with ecosystem audit tools as needed. Archive tool/database identity and analyze affected paths. A frozen npm date cutoff is not a complete immutable dependency lock; `npx package@version` can still leave the installed closure insufficiently bound to a security report. Use a verified lock/bundle or downgrade the evidence scope before granting version-wide verification.

**MCP descriptions and servers:** capture actual negotiated tools/prompts/resources and perform static source review plus sandbox behavior probes. [Snyk Agent Scan](https://github.com/snyk/agent-scan) is optional, not a required first-version dependency: it starts stdio commands and sends configurations/signatures/tool descriptions/skill content to its analysis API (with redaction). Its v0.5 and v0.6+ output schemas differ; pin a version and match the report adapter. Its README asks integrators using results in their own registry/project to contact Snyk for designated APIs and disallows large-scale scanning through the standard API. Resolve this integration entitlement before wiring PuPu marketplace automation to it. Do not install a supposed npm package; upstream documents uvx or a standalone binary.

**Dynamic probes:** use a real constrained environment with logged allow/deny observations and synthetic assets. Pick an available container/VM/network observer suitable for the platform; do not invent a syscall/network trace from application logs or describe mere temporary-directory execution as containment. Missing infrastructure yields a scoped INCOMPLETE report while static work proceeds.

**Agent review:** useful for instructions, code intent and finding applicability, but probabilistic. Record model, analyzed scope and evidence. No zero-finding result, extra voting round or impressive scanner count proves complete absence of malicious behavior.
