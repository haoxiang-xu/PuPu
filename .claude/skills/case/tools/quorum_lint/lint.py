"""Lint Quorum boundary protocol v1 records without external dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import unicodedata

from .schema import BOUNDARY_V1


FIELD_RE = re.compile(r"^\s*-\s+\*\*(?P<name>[^*]+)\*\*:\s*(?P<value>.*)\s*$")
SECTION_RE = re.compile(r"^###\s+(?P<id>(?:BC|SEQ)-\d{3})\b")
H3_RE = re.compile(r"^###\s+")
PS_HEADING_RE = re.compile(r"^###\s+(?P<id>PS-\d{3})\b")
PROPOSAL_HEADING_RE = re.compile(r"^##\s+P-\d{4}-\d{4}-\d{4}-\d{4}\b")
AT_HEADING_RE = re.compile(r"^##\s+(?P<id>AT-\d{3})\b")
AT_TIMESTAMP_RE = re.compile(r"^##\s+AT-\d{3}\s*\|\s*(?P<timestamp>[^|]+?)\s*$")
AC_DECL_RE = re.compile(r"^\s*-\s+(?P<id>AC-\d{3})\s*\|", re.MULTILINE)
REF_PATTERNS = {
    "BC": re.compile(r"(?<![A-Z0-9-])BC-\d{3}(?![A-Z0-9-])"),
    "SEQ": re.compile(r"(?<![A-Z0-9-])SEQ-\d{3}(?![A-Z0-9-])"),
    "AC": re.compile(r"(?<![A-Z0-9-])AC-\d{3}(?![A-Z0-9-])"),
    "HS": re.compile(r"(?<![A-Z0-9-])HS-\d{3}(?![A-Z0-9-])"),
    "E": re.compile(r"(?<![A-Z0-9-])E-\d{4}(?![A-Z0-9-])"),
}
EVENT_HEADING_RE = re.compile(r"^##\s+(S-\d{4})\b")
RULING_HEADING_RE = re.compile(r"^##\s+(R-\d{4})\b")
EVIDENCE_HEADING_RE = re.compile(r"^###\s+(E-\d{4})\b")
HEADING_TIMESTAMP_RE = re.compile(r"^##\s+(?:S|R)-\d{4}\s*\|\s*(?P<timestamp>[^|]+?)\s*$")
CRITERION_RE = re.compile(
    r"^\s*-\s+(?P<id>AC-\d{3})\s*\|\s*"
    r"(?P<status>PASS|FAIL|NOT_RUN|PENDING)\s*\|\s*"
    r"method:\s*(?P<method>.*?)\s*\|\s*evidence:\s*(?P<evidence>.*?)\s*$"
)
FRONTMATTER_RE = re.compile(r"\A---\s*\n(?P<body>.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
FRONTMATTER_FIELD_RE = re.compile(r"^(?P<name>[A-Za-z_][A-Za-z0-9_]*):\s*(?P<value>.*)\s*$", re.MULTILINE)
HASH_RE = re.compile(r"^sha256:[0-9a-f]{64}$", re.IGNORECASE)
SHA256_TOKEN_RE = re.compile(r"(?:^|[^0-9A-Za-z])sha256:[0-9a-f]{64}(?:$|[^0-9a-f])", re.IGNORECASE)
EXACT_REVISION_PAIR_RE = re.compile(
    r"^sha256:[0-9a-f]{64}\+sha256:[0-9a-f]{64}$"
)
PLACEHOLDER_VALUES = {"", "...", "…", "TODO", "TBD", "NONE"}
MOVING_REVISION_RE = re.compile(
    r"(?:\blatest\b|\bHEAD\b|\bmain\b|\bmaster\b|\bsibling\b|最新版|最新分支|未冻结)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Issue:
    path: Path
    message: str

    def __str__(self) -> str:
        return f"{self.path}: {self.message}"


@dataclass(frozen=True)
class Section:
    identifier: str
    fields: dict[str, str]
    duplicate_fields: frozenset[str]


@dataclass(frozen=True)
class Event:
    identifier: str
    fields: dict[str, str]
    duplicate_fields: frozenset[str]
    timestamp: str | None


@dataclass
class ConfirmationRequirement:
    owners: set[str]
    objects: set[str]
    criteria: set[str]


@dataclass(frozen=True)
class CaseIndex:
    path: Path
    case_id: str
    current_ps: str
    current_artifact_ref: str
    review_snapshot_ref: str | None
    boundary_contract_refs: set[str]
    state_sequence_refs: set[str]
    contract_set_refs: set[str]
    procedure_mode: str
    status: str


@dataclass(frozen=True)
class EffectivePlanContract:
    criteria: set[str]
    revision_set: str | None
    ruling: Event | None
    commit: Event | None


def _normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _frontmatter(text: str) -> tuple[dict[str, str], set[str]]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, set()
    result: dict[str, str] = {}
    duplicates: set[str] = set()
    for item in FRONTMATTER_FIELD_RE.finditer(match.group("body")):
        name = item.group("name")
        if name in result:
            duplicates.add(name)
        else:
            result[name] = item.group("value").strip()
    return result, duplicates


def _fields_with_duplicates(lines: list[str]) -> tuple[dict[str, str], set[str]]:
    result: dict[str, str] = {}
    duplicates: set[str] = set()
    for line in lines:
        match = FIELD_RE.match(line)
        if match:
            name = _normalize_name(match.group("name"))
            if name in result:
                duplicates.add(name)
            else:
                result[name] = match.group("value").strip()
    return result, duplicates


def _fields(lines: list[str]) -> dict[str, str]:
    return _fields_with_duplicates(lines)[0]


def _sections(text: str) -> tuple[dict[str, Section], set[str]]:
    lines = text.splitlines()
    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        match = SECTION_RE.match(line)
        if match:
            starts.append((index, match.group("id")))
    result: dict[str, Section] = {}
    duplicates: set[str] = set()
    for start, identifier in starts:
        end = next(
            (index for index in range(start + 1, len(lines)) if H3_RE.match(lines[index])),
            len(lines),
        )
        fields, duplicate_fields = _fields_with_duplicates(lines[start + 1 : end])
        section = Section(identifier, fields, frozenset(duplicate_fields))
        if identifier in result:
            duplicates.add(identifier)
        else:
            result[identifier] = section
    return result, duplicates


def _record_items(text: str, heading_re: re.Pattern[str]) -> list[Event]:
    lines = text.splitlines()
    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        match = heading_re.match(line)
        if match:
            starts.append((index, match.group(1)))
    result: list[Event] = []
    for position, (start, identifier) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        fields, duplicate_fields = _fields_with_duplicates(lines[start + 1 : end])
        timestamp_match = HEADING_TIMESTAMP_RE.match(lines[start])
        result.append(
            Event(
                identifier,
                fields,
                frozenset(duplicate_fields),
                timestamp_match.group("timestamp").strip() if timestamp_match else None,
            )
        )
    return result


def _events(text: str) -> list[Event]:
    return _record_items(text, EVENT_HEADING_RE)


def _rulings(text: str) -> list[Event]:
    return _record_items(text, RULING_HEADING_RE)


def _evidence(text: str) -> list[Event]:
    return _record_items(text, EVIDENCE_HEADING_RE)


def _refs(kind: str, value: str) -> set[str]:
    return set(REF_PATTERNS[kind].findall(value))


def _meaningful(value: str | None, *, allow_not_applicable: bool = False) -> bool:
    if value is None:
        return False
    normalized = value.strip()
    if normalized.upper() in PLACEHOLDER_VALUES:
        return False
    if not allow_not_applicable and normalized.upper() in {"NOT_APPLICABLE", "STATELESS"}:
        return False
    return True


def _issue(issues: list[Issue], path: Path, message: str) -> None:
    issues.append(Issue(path, message))


def _nfc_json(value: object) -> object:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_nfc_json(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[str, object] = {}
        for key, item in value.items():
            normalized_key = unicodedata.normalize("NFC", key)
            if normalized_key in normalized:
                raise ValueError(f"duplicate NFC-normalized JSON key: {normalized_key}")
            normalized[normalized_key] = _nfc_json(item)
        return normalized
    return value


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        _nfc_json(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _domain_hash(domain: bytes, value: object) -> str:
    return "sha256:" + hashlib.sha256(domain + _canonical_json(value)).hexdigest()


def _closure_event_hash(payload: dict[str, object]) -> str:
    return _domain_hash(b"quorum.closure.event.v1\0", payload)


def _closure_bundle_hash(payload: dict[str, object]) -> str:
    return _domain_hash(b"quorum.closure.bundle.v1\0", payload)


def _boundary_object_hash(
    bc_sections: dict[str, Section], seq_sections: dict[str, Section]
) -> str:
    objects = []
    for identifier, section in sorted({**bc_sections, **seq_sections}.items()):
        objects.append(
            {
                "fields": {
                    unicodedata.normalize("NFC", name): unicodedata.normalize("NFC", value)
                    for name, value in sorted(section.fields.items())
                },
                "id": identifier,
            }
        )
    payload = _canonical_json(objects)
    return "sha256:" + hashlib.sha256(b"quorum.boundary.objects.v1\0" + payload).hexdigest()


def _review_snapshot_hash(event: Event) -> str:
    """Hash the immutable RS NOTICE body, excluding its self-referential hash."""

    fields = {
        unicodedata.normalize("NFC", name): unicodedata.normalize("NFC", value)
        for name, value in sorted(event.fields.items())
        if name != "content hash"
    }
    payload = _canonical_json(fields)
    return "sha256:" + hashlib.sha256(b"quorum.review.snapshot.v1\0" + payload).hexdigest()


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_exact_ref_list(
    value: str,
    kind: str,
    *,
    bracketed: bool,
) -> tuple[set[str], list[str]]:
    errors: list[str] = []
    content = value.strip()
    if bracketed:
        if not (content.startswith("[") and content.endswith("]")):
            return set(), ["must use [REF-###, ...] list syntax"]
        content = content[1:-1].strip()
    if content in {"", "[]"}:
        return set(), errors
    items = [item.strip() for item in content.split(",")]
    digits = 4 if kind in {"S", "R", "E"} else 3
    expected = re.compile(rf"^{kind}-\d{{{digits}}}$")
    invalid = [item for item in items if not expected.fullmatch(item)]
    if invalid:
        errors.append(f"contains invalid tokens: {invalid}")
    valid = [item for item in items if expected.fullmatch(item)]
    duplicates = sorted({item for item in valid if valid.count(item) > 1})
    if duplicates:
        errors.append(f"contains duplicate refs: {duplicates}")
    return set(valid), errors


def _check_exact_refs(
    issues: list[Issue],
    path: Path,
    subject: str,
    value: str | None,
    kind: str,
    *,
    require_nonempty: bool = True,
) -> set[str]:
    refs, errors = _parse_exact_ref_list(value or "", kind, bracketed=False)
    for error in errors:
        _issue(issues, path, f"{subject} {error}")
    if require_nonempty and not refs:
        _issue(issues, path, f"{subject} must contain at least one exact same-case {kind} ref")
    return refs


def _check_embedded_same_case_refs(
    issues: list[Issue],
    path: Path,
    subject: str,
    value: str,
    kinds: tuple[str, ...],
) -> None:
    for kind in kinds:
        digits = 4 if kind in {"S", "R", "E"} else 3
        token_re = re.compile(rf"(?<![A-Z0-9-]){kind}-\d{{{digits}}}(?![A-Z0-9-])")
        tokens = token_re.findall(value)
        duplicates = sorted({token for token in tokens if tokens.count(token) > 1})
        if duplicates:
            _issue(issues, path, f"{subject} contains duplicate {kind} refs: {duplicates}")
        qualified_re = re.compile(
            rf"(?:[MP]-[A-Za-z0-9-]+)#(?:{kind}-\d{{{digits}}})",
            re.IGNORECASE,
        )
        if qualified_re.search(value):
            _issue(issues, path, f"{subject} must use same-case bare {kind} refs, not foreign-qualified refs")


def _parse_exact_boundary_objects(value: str) -> tuple[set[str], list[str]]:
    items = [item.strip() for item in value.split(",") if item.strip()]
    pattern = re.compile(r"^(?:BC|SEQ)-\d{3}$")
    invalid = [item for item in items if not pattern.fullmatch(item)]
    errors = [f"contains invalid tokens: {invalid}"] if invalid else []
    valid = [item for item in items if pattern.fullmatch(item)]
    duplicates = sorted({item for item in valid if valid.count(item) > 1})
    if duplicates:
        errors.append(f"contains duplicate refs: {duplicates}")
    return set(valid), errors


def _parse_exact_mixed_refs(
    value: str, kinds: tuple[str, ...]
) -> tuple[set[str], list[str]]:
    items = [item.strip() for item in re.split(r"\s*[/,]\s*", value.strip()) if item.strip()]
    pattern = re.compile(rf"(?:{'|'.join(kinds)})-\d{{3}}")
    invalid = [item for item in items if not pattern.fullmatch(item)]
    errors = [f"contains invalid tokens: {invalid}"] if invalid else []
    valid = [item for item in items if pattern.fullmatch(item)]
    duplicates = sorted({item for item in valid if valid.count(item) > 1})
    if duplicates:
        errors.append(f"contains duplicate refs: {duplicates}")
    return set(valid), errors


def _check_exact_artifact_basis(
    issues: list[Issue],
    path: Path,
    subject: str,
    value: str,
    artifact_ref: str,
    predecessor_review: str | None,
) -> None:
    expected = artifact_ref
    if predecessor_review not in {None, "", "null"}:
        expected = f"{artifact_ref}, {predecessor_review}"
    if value != expected:
        _issue(issues, path, f"{subject} must exactly equal canonical basis '{expected}'")


def _check_action_ruling_basis(
    issues: list[Issue],
    ruling_path: Path,
    ruling: Event,
    case_index: CaseIndex,
    record_events: list[Event],
) -> None:
    value = ruling.fields.get("basis", "")
    items = [item.strip() for item in value.split(",")]
    expected_prefix = [case_index.current_artifact_ref, case_index.review_snapshot_ref or ""]
    if len(items) < 3 or items[:2] != expected_prefix:
        _issue(
            issues,
            ruling_path,
            f"{ruling.identifier} basis must begin with exact current artifact and RS: "
            f"{expected_prefix[0]}, {expected_prefix[1]}",
        )
    if any(not item for item in items):
        _issue(issues, ruling_path, f"{ruling.identifier} basis contains an empty token")
    duplicates = sorted({item for item in items if items.count(item) > 1})
    if duplicates:
        _issue(issues, ruling_path, f"{ruling.identifier} basis contains duplicate refs: {duplicates}")
    record_ids = {event.identifier for event in record_events}
    for item in items[2:]:
        if not re.fullmatch(r"S-\d{4}", item):
            _issue(issues, ruling_path, f"{ruling.identifier} basis contains invalid event ref: {item}")
        elif item not in record_ids:
            _issue(issues, ruling_path, f"{ruling.identifier} basis references missing canonical event: {item}")


def _parse_timestamp(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def _parse_canonical_json_object(
    issues: list[Issue], path: Path, subject: str, value: str | None
) -> dict[str, object] | None:
    duplicates: list[str] = []

    def object_hook(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, item in pairs:
            if key in result:
                duplicates.append(key)
            else:
                result[key] = item
        return result

    try:
        parsed = json.loads(value or "", object_pairs_hook=object_hook)
    except (TypeError, json.JSONDecodeError):
        _issue(issues, path, f"{subject} must be a canonical JSON object")
        return None
    if not isinstance(parsed, dict):
        _issue(issues, path, f"{subject} must be a canonical JSON object")
        return None
    if duplicates:
        _issue(issues, path, f"{subject} contains duplicate JSON keys: {sorted(set(duplicates))}")
    try:
        canonical = _canonical_json(parsed).decode("utf-8")
    except ValueError as exc:
        _issue(issues, path, f"{subject} is not canonical: {exc}")
        return None
    if value != canonical:
        _issue(issues, path, f"{subject} must use canonical JSON encoding")
    return parsed


def _event_heading_timestamp(event: Event) -> datetime | None:
    return _parse_timestamp(event.timestamp or "")


def _closure_record_payload(event: Event) -> dict[str, object]:
    return {
        "event_id": event.identifier,
        **{
            name.replace(" ", "_"): value
            for name, value in sorted(event.fields.items())
            if name != "payload hash"
        },
    }


def _closure_commit_payload(event: Event) -> dict[str, object]:
    try:
        precommit_hashes = json.loads(event.fields.get("precommit event hashes", ""))
    except json.JSONDecodeError:
        precommit_hashes = None
    return {
        "event_id": event.identifier,
        "type": event.fields.get("type"),
        "notice_kind": event.fields.get("notice kind"),
        "case_id": event.fields.get("case"),
        "ruling_id": event.fields.get("ruling"),
        "closure_bundle_hash": event.fields.get("closure bundle hash"),
        "precommit_event_hashes": precommit_hashes,
        "old_logical_state": event.fields.get("old logical state"),
        "new_logical_state": event.fields.get("new logical state"),
    }


def _bos_obligation_ids(record_text: str, bos_ref: str) -> set[str]:
    lines = record_text.splitlines()
    starts = [index for index, line in enumerate(lines) if EVENT_HEADING_RE.match(line)]
    result: set[str] = set()
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        block = lines[start:end]
        fields = _fields(block[1:])
        if fields.get("type") != "OBLIGATION_SET" or fields.get("bos") != bos_ref:
            continue
        for line in block:
            match = re.match(r"^\s+-\s+(BO-\d{3})\s+\|", line)
            if match:
                result.add(match.group(1))
    return result


def _lint_record_structure(record_path: Path, case_index: CaseIndex | None = None) -> list[Issue]:
    issues: list[Issue] = []
    if not record_path.exists():
        return issues
    events = _events(record_path.read_text(encoding="utf-8"))
    identifiers = [event.identifier for event in events]
    for identifier in sorted({item for item in identifiers if identifiers.count(item) > 1}):
        _issue(issues, record_path, f"duplicate record event identifier: {identifier}")
    for event in events:
        for field in sorted(event.duplicate_fields):
            _issue(issues, record_path, f"{event.identifier} contains duplicate field: {field}")
        if _parse_timestamp(event.timestamp or "") is None:
            _issue(issues, record_path, f"{event.identifier} heading must contain a timezone-aware timestamp")
        for field in ("case", "discussion type", "procedure mode", "speaker", "type", "target", "basis", "decision effect"):
            if not _meaningful(event.fields.get(field), allow_not_applicable=True):
                _issue(issues, record_path, f"{event.identifier} common envelope is missing concrete field '{field}'")
        if case_index is not None:
            if event.fields.get("case") != case_index.case_id:
                _issue(issues, record_path, f"{event.identifier} common envelope case must match canonical case_id")
            if event.fields.get("discussion type") != "proposal":
                _issue(issues, record_path, f"{event.identifier} discussion type must be proposal")
            if event.fields.get("procedure mode") not in {"collaboration", "debate", "full"}:
                _issue(issues, record_path, f"{event.identifier} procedure mode is invalid")
    if events and events[0].identifier != "S-0001":
        _issue(issues, record_path, "record event lineage must begin with S-0001")
    parsed_times = [_parse_timestamp(event.timestamp or "") for event in events]
    for previous, current in zip(parsed_times, parsed_times[1:]):
        if previous is not None and current is not None and current <= previous:
            _issue(issues, record_path, "record event timestamps must be strictly increasing in append order")
    return issues


def _load_case_index(case_path: Path) -> tuple[CaseIndex | None, list[Issue]]:
    issues: list[Issue] = []
    path = case_path / "case.md"
    if not path.exists():
        _issue(issues, path, "case.md is required as the canonical current-state index")
        return None, issues
    text = path.read_text(encoding="utf-8")
    metadata, duplicate_metadata = _frontmatter(text)
    for name in sorted(duplicate_metadata):
        _issue(issues, path, f"case.md frontmatter contains duplicate key: {name}")
    if metadata.get("boundary_protocol") != BOUNDARY_V1.version:
        _issue(issues, path, "case.md frontmatter must declare canonical boundary_protocol: v1")
    if metadata.get("discussion_type") != "proposal":
        _issue(issues, path, "boundary protocol v1 linter requires discussion_type: proposal")
    case_id = metadata.get("case_id", "")
    if not _meaningful(case_id):
        _issue(issues, path, "case.md frontmatter must declare case_id")
    current_artifact_ref = metadata.get("current_artifact_ref", "")
    current_ps_matches = re.findall(r"PS-\d{3}", current_artifact_ref)
    if len(current_ps_matches) != 1:
        _issue(issues, path, "case.md current_artifact_ref must identify exactly one PS-###")
        current_ps = ""
    else:
        current_ps = current_ps_matches[0]
    review_snapshot_ref = metadata.get("review_snapshot_ref")
    if review_snapshot_ref in {None, "", "null"}:
        review_snapshot_ref = None
    elif not re.fullmatch(r"RS-\d{3}", review_snapshot_ref):
        _issue(issues, path, "case.md review_snapshot_ref must be null or RS-###")
    boundary_refs, boundary_ref_errors = _parse_exact_ref_list(
        metadata.get("boundary_contract_refs", ""), "BC", bracketed=True
    )
    for error in boundary_ref_errors:
        _issue(issues, path, f"case.md boundary_contract_refs {error}")
    sequence_refs, sequence_ref_errors = _parse_exact_ref_list(
        metadata.get("state_sequence_refs", ""), "SEQ", bracketed=True
    )
    for error in sequence_ref_errors:
        _issue(issues, path, f"case.md state_sequence_refs {error}")
    fields, duplicate_fields = _fields_with_duplicates(text.splitlines())
    for name in sorted(duplicate_fields):
        _issue(issues, path, f"case.md contains duplicate canonical field: {name}")
    contract_value = fields.get("当前 contract_set")
    if contract_value is None:
        _issue(issues, path, "case.md must declare current contract_set")
        contract_refs: set[str] = set()
    else:
        contract_refs, contract_ref_errors = _parse_exact_ref_list(
            contract_value, "BC", bracketed=False
        )
        for error in contract_ref_errors:
            _issue(issues, path, f"case.md current contract_set {error}")
    return (
        CaseIndex(
            path=path,
            case_id=case_id,
            current_ps=current_ps,
            current_artifact_ref=current_artifact_ref,
            review_snapshot_ref=review_snapshot_ref,
            boundary_contract_refs=boundary_refs,
            state_sequence_refs=sequence_refs,
            contract_set_refs=contract_refs,
            procedure_mode=metadata.get("procedure_mode", ""),
            status=metadata.get("status", ""),
        ),
        issues,
    )


def _check_refs(
    issues: list[Issue],
    path: Path,
    owner_id: str,
    label: str,
    value: str | None,
    declared: set[str],
) -> set[str]:
    refs = _check_exact_refs(
        issues,
        path,
        f"{owner_id} field '{label}'",
        value,
        "AC",
    )
    missing = refs - declared
    if missing:
        _issue(issues, path, f"{owner_id} field '{label}' references missing criteria: {sorted(missing)}")
    return refs


def _check_confirmation(
    issues: list[Issue],
    path: Path,
    subject: str,
    owner: str,
    lead: str,
    confirmation: str | None,
    required_handoffs: dict[str, ConfirmationRequirement],
    object_id: str,
    criteria: set[str],
) -> None:
    value = (confirmation or "").strip()
    if owner == lead and value == "LEAD":
        return
    handoffs, handoff_errors = _parse_exact_ref_list(value, "HS", bracketed=False)
    if handoff_errors or len(handoffs) != 1:
        for error in handoff_errors:
            _issue(issues, path, f"{subject} confirmation {error}")
        if owner == lead:
            _issue(issues, path, f"{subject} confirmation must be LEAD or exactly one returned same-case HS-###")
        else:
            _issue(issues, path, f"{subject} is owned by {owner}, so confirmation must reference exactly one returned same-case HS-###")
        return
    for handoff in handoffs:
        requirement = required_handoffs.setdefault(
            handoff,
            ConfirmationRequirement(owners=set(), objects=set(), criteria=set()),
        )
        requirement.owners.add(owner)
        requirement.objects.add(object_id)
        requirement.criteria.update(criteria)


def _parse_handoffs(
    issues: list[Issue], record_path: Path, required: dict[str, ConfirmationRequirement]
) -> None:
    if not record_path.exists():
        if required:
            _issue(issues, record_path, "record.md is required to verify non-lead BC/SEQ confirmations")
        return
    events = _events(record_path.read_text(encoding="utf-8"))
    open_handoff: str | None = None
    targets: dict[str, str] = {}
    scopes: dict[str, str] = {}
    expiries: dict[str, datetime | None] = {}
    handoff_events: dict[str, Event] = {}
    returns: dict[str, Event] = {}
    terminals: dict[str, Event] = {}
    handoff_counts: dict[str, int] = {}
    terminal_counts: dict[str, int] = {}
    for event in events:
        event_type = event.fields.get("type", "")
        target = event.fields.get("target", "")
        target_refs, target_errors = _parse_exact_ref_list(target, "HS", bracketed=False)
        handoff = next(iter(target_refs), None) if len(target_refs) == 1 and not target_errors else None
        if event_type == "HANDOFF" and handoff:
            handoff_counts[handoff] = handoff_counts.get(handoff, 0) + 1
            if open_handoff is not None:
                _issue(
                    issues,
                    record_path,
                    f"{event.identifier} opens {handoff} while {open_handoff} is still open; owner handoffs must be serial",
                )
            open_handoff = handoff
            target_owner = event.fields.get("to")
            if target_owner:
                targets[handoff] = target_owner
            scopes[handoff] = event.fields.get("scope", "")
            _check_embedded_same_case_refs(
                issues,
                record_path,
                f"{event.identifier} HANDOFF scope",
                scopes[handoff],
                ("BC", "SEQ", "AC"),
            )
            expiries[handoff] = _parse_timestamp(event.fields.get("expires at", ""))
            handoff_events[handoff] = event
            if event.fields.get("status") != "OPEN":
                _issue(issues, record_path, f"{event.identifier} HANDOFF opening status must be OPEN")
            if expiries[handoff] is None:
                _issue(issues, record_path, f"{event.identifier} must declare timezone-aware expires at")
        elif event_type == "HANDOFF_RETURN" and handoff:
            status = event.fields.get("status", "")
            if status not in {"RETURNED", "DECLINED"}:
                _issue(issues, record_path, f"{event.identifier} HANDOFF_RETURN status must be RETURNED or DECLINED")
            terminal_counts[handoff] = terminal_counts.get(handoff, 0) + 1
            if open_handoff != handoff:
                _issue(issues, record_path, f"{event.identifier} returns {handoff}, but the open handoff is {open_handoff or 'none'}")
            terminals[handoff] = event
            if status == "RETURNED":
                returns[handoff] = event
            elif not _meaningful(event.fields.get("reason")):
                _issue(issues, record_path, f"{event.identifier} DECLINED terminal must record a concrete reason")
            if open_handoff == handoff:
                open_handoff = None
        elif event_type == "NOTICE" and handoff and event.fields.get("notice kind") in {
            "HANDOFF_EXPIRED",
            "HANDOFF_CANCELLED",
        }:
            notice_kind = event.fields.get("notice kind")
            expected_status = "EXPIRED" if notice_kind == "HANDOFF_EXPIRED" else "CANCELLED"
            terminal_counts[handoff] = terminal_counts.get(handoff, 0) + 1
            terminals[handoff] = event
            if event.fields.get("status") != expected_status:
                _issue(issues, record_path, f"{event.identifier} {notice_kind} status must be {expected_status}")
            if open_handoff != handoff:
                _issue(issues, record_path, f"{event.identifier} terminates {handoff}, but the open handoff is {open_handoff or 'none'}")
            if open_handoff == handoff:
                open_handoff = None
        elif event_type in {"HANDOFF", "HANDOFF_RETURN"} and (target_errors or handoff is None):
            _issue(issues, record_path, f"{event.identifier} {event_type} target must be exactly one same-case HS-###")
    for handoff, count in sorted(handoff_counts.items()):
        if count != 1:
            _issue(issues, record_path, f"{handoff} must have exactly one HANDOFF event; found {count}")
    for handoff, count in sorted(terminal_counts.items()):
        if count != 1:
            _issue(issues, record_path, f"{handoff} must have exactly one terminal event; found {count}")
    for handoff in sorted(set(handoff_counts) - set(terminals)):
        _issue(issues, record_path, f"{handoff} has no terminal RETURNED/DECLINED/EXPIRED/CANCELLED event")
    for handoff, returned_event in returns.items():
        if not _meaningful(returned_event.fields.get("contribution")):
            _issue(issues, record_path, f"{handoff} RETURNED event must record a material contribution")
        target_owner = targets.get(handoff)
        if target_owner and returned_event.fields.get("speaker") != target_owner:
            _issue(
                issues,
                record_path,
                f"{handoff} RETURNED speaker must be its target owner {target_owner}",
            )
        handoff_time = _parse_timestamp(handoff_events.get(handoff).timestamp or "") if handoff in handoff_events else None
        return_time = _parse_timestamp(returned_event.timestamp or "")
        expiry = expiries.get(handoff)
        if handoff_time is not None and return_time is not None and return_time <= handoff_time:
            _issue(issues, record_path, f"{handoff} return must occur after its HANDOFF")
        if return_time is not None and expiry is not None and return_time > expiry:
            _issue(issues, record_path, f"{handoff} return occurred after expires at")
        _check_embedded_same_case_refs(
            issues,
            record_path,
            f"{handoff} RETURNED contribution",
            returned_event.fields.get("contribution", ""),
            ("BC", "SEQ", "AC"),
        )
    for handoff, terminal_event in terminals.items():
        if terminal_event.fields.get("status") == "EXPIRED":
            terminal_time = _parse_timestamp(terminal_event.timestamp or "")
            expiry = expiries.get(handoff)
            if terminal_time is not None and expiry is not None and terminal_time < expiry:
                _issue(issues, record_path, f"{handoff} cannot be marked EXPIRED before expires at")
    if open_handoff is not None:
        _issue(issues, record_path, f"{open_handoff} remains open at ruling-ready check")
    for handoff, requirement in required.items():
        owners = requirement.owners
        if len(owners) != 1:
            _issue(
                issues,
                record_path,
                f"confirmation handoff {handoff} is reused for different owners: {sorted(owners)}",
            )
        if handoff not in returns:
            _issue(issues, record_path, f"confirmation handoff {handoff} is not RETURNED")
        target = targets.get(handoff)
        if target is None:
            _issue(issues, record_path, f"confirmation handoff {handoff} has no HANDOFF event")
        elif owners != {target}:
            _issue(
                issues,
                record_path,
                f"confirmation handoff {handoff} targets {target}, expected exactly {sorted(owners)}",
            )
        scope = scopes.get(handoff, "")
        scope_objects = _refs("BC", scope) | _refs("SEQ", scope)
        scope_criteria = _refs("AC", scope)
        if not requirement.objects.issubset(scope_objects):
            _issue(
                issues,
                record_path,
                f"confirmation handoff {handoff} scope does not cover responsibility objects {sorted(requirement.objects)}",
            )
        if not requirement.criteria.issubset(scope_criteria):
            _issue(
                issues,
                record_path,
                f"confirmation handoff {handoff} scope does not cover responsibility criteria {sorted(requirement.criteria)}",
            )
        returned_event = returns.get(handoff)
        if returned_event is not None:
            contribution = returned_event.fields.get("contribution", "")
            contribution_objects = _refs("BC", contribution) | _refs("SEQ", contribution)
            if not requirement.objects.issubset(contribution_objects):
                _issue(
                    issues,
                    record_path,
                    f"confirmation handoff {handoff} return contribution does not cover responsibility objects {sorted(requirement.objects)}",
                )


def _lint_proposal(
    proposal_path: Path, case_index: CaseIndex | None
) -> tuple[list[Issue], set[str], str | None]:
    issues: list[Issue] = []
    text = proposal_path.read_text(encoding="utf-8")
    metadata, duplicate_metadata = _frontmatter(text)
    for name in sorted(duplicate_metadata):
        _issue(issues, proposal_path, f"proposal frontmatter contains duplicate key: {name}")

    lines = text.splitlines()
    proposal_starts = [index for index, line in enumerate(lines) if PROPOSAL_HEADING_RE.match(line)]
    if len(proposal_starts) != 1:
        _issue(issues, proposal_path, "proposal must contain exactly one global proposal heading")
        proposal_start = 0
    else:
        proposal_start = proposal_starts[0]
    proposal_end = next(
        (index for index in range(proposal_start + 1, len(lines)) if H3_RE.match(lines[index])),
        len(lines),
    )
    all_fields, duplicate_proposal_fields = _fields_with_duplicates(
        lines[proposal_start + 1 : proposal_end]
    )
    for field in sorted(duplicate_proposal_fields):
        _issue(issues, proposal_path, f"global proposal contains duplicate field: {field}")
    lead = all_fields.get("主 owner")
    if not _meaningful(lead):
        _issue(issues, proposal_path, "proposal must declare a concrete 主 owner")
        lead = ""

    declared_ac_list = AC_DECL_RE.findall(text)
    declared_ac = set(declared_ac_list)
    for identifier in sorted({item for item in declared_ac_list if declared_ac_list.count(item) > 1}):
        _issue(issues, proposal_path, f"duplicate acceptance criterion identifier: {identifier}")
    if not declared_ac:
        _issue(issues, proposal_path, "proposal must declare at least one AC-###")

    sections, duplicate_sections = _sections(text)
    for identifier in sorted(duplicate_sections):
        _issue(issues, proposal_path, f"duplicate boundary object identifier: {identifier}")
    bc_sections = {key: value for key, value in sections.items() if key.startswith("BC-")}
    seq_sections = {key: value for key, value in sections.items() if key.startswith("SEQ-")}
    if case_index is not None:
        if metadata.get("case_id") != case_index.case_id:
            _issue(
                issues,
                proposal_path,
                f"proposal frontmatter case_id must exactly match canonical case.md case_id {case_index.case_id}",
            )
        if set(bc_sections) != case_index.boundary_contract_refs:
            _issue(
                issues,
                case_index.path,
                f"case.md boundary_contract_refs differ from proposal BC objects: "
                f"index={sorted(case_index.boundary_contract_refs)}, proposal={sorted(bc_sections)}",
            )
        if set(seq_sections) != case_index.state_sequence_refs:
            _issue(
                issues,
                case_index.path,
                f"case.md state_sequence_refs differ from proposal SEQ objects: "
                f"index={sorted(case_index.state_sequence_refs)}, proposal={sorted(seq_sections)}",
            )
        if set(bc_sections) != case_index.contract_set_refs:
            _issue(
                issues,
                case_index.path,
                f"case.md current contract_set differs from proposal BC objects: "
                f"index={sorted(case_index.contract_set_refs)}, proposal={sorted(bc_sections)}",
            )

    contract_set = all_fields.get("contract_set") or all_fields.get("当前 contract_set")
    if contract_set in {"NOT_APPLICABLE", "[]"}:
        proposal_contract_refs: set[str] = set()
    else:
        proposal_contract_refs, contract_errors = _parse_exact_ref_list(
            contract_set or "", "BC", bracketed=False
        )
        for error in contract_errors:
            _issue(issues, proposal_path, f"proposal contract_set {error}")
    if proposal_contract_refs != set(bc_sections):
        _issue(
            issues,
            proposal_path,
            f"proposal contract_set must exactly equal its BC objects: "
            f"contract_set={sorted(proposal_contract_refs)}, objects={sorted(bc_sections)}",
        )

    boundary_value = all_fields.get("boundary obligations")
    boundary_reason = all_fields.get("boundary n/a reason")
    boundary_refs: set[str] = set()
    if boundary_value == "NOT_APPLICABLE":
        if not _meaningful(boundary_reason):
            _issue(issues, proposal_path, "boundary NOT_APPLICABLE requires a concrete boundary N/A reason")
        if bc_sections:
            _issue(issues, proposal_path, "boundary obligations are NOT_APPLICABLE but BC sections exist")
    else:
        boundary_refs = _check_exact_refs(
            issues,
            proposal_path,
            "boundary obligations",
            boundary_value,
            "BC",
        )
        if boundary_reason != "NOT_APPLICABLE":
            _issue(issues, proposal_path, "boundary N/A reason must be NOT_APPLICABLE when BC refs are declared")
        if boundary_refs != set(bc_sections):
            _issue(
                issues,
                proposal_path,
                f"boundary obligations and BC sections differ: declared={sorted(boundary_refs)}, sections={sorted(bc_sections)}",
            )

    sequence_value = all_fields.get("state sequence obligations")
    sequence_reason = all_fields.get("state sequence n/a reason")
    sequence_refs: set[str] = set()
    if sequence_value in {"STATELESS", "NOT_APPLICABLE"}:
        if not _meaningful(sequence_reason):
            _issue(issues, proposal_path, f"state sequence {sequence_value} requires a concrete state sequence N/A reason")
        if seq_sections:
            _issue(issues, proposal_path, "state sequence obligations are N/A but SEQ sections exist")
    else:
        sequence_refs = _check_exact_refs(
            issues,
            proposal_path,
            "state sequence obligations",
            sequence_value,
            "SEQ",
        )
        if sequence_reason != "NOT_APPLICABLE":
            _issue(issues, proposal_path, "state sequence N/A reason must be NOT_APPLICABLE when SEQ refs are declared")
        if sequence_refs != set(seq_sections):
            _issue(
                issues,
                proposal_path,
                f"state sequence obligations and SEQ sections differ: declared={sorted(sequence_refs)}, sections={sorted(seq_sections)}",
            )
    state_character = all_fields.get("state character")
    if state_character == "STATEFUL" and not sequence_refs:
        _issue(issues, proposal_path, "STATEFUL proposal must reference at least one SEQ-###")

    required_handoffs: dict[str, ConfirmationRequirement] = {}
    for identifier, section in bc_sections.items():
        for field in sorted(section.duplicate_fields):
            _issue(issues, proposal_path, f"{identifier} contains duplicate field: {field}")
        for field in BOUNDARY_V1.boundary_fields:
            if not _meaningful(section.fields.get(field)):
                _issue(issues, proposal_path, f"{identifier} is missing concrete field '{field}'")
        policy = section.fields.get("admission policy", "")
        if policy not in BOUNDARY_V1.admission_policies:
            _issue(issues, proposal_path, f"{identifier} admission policy must be CLOSED, OPEN, or VERSIONED")
        binding = section.fields.get("identity/version binding", "")
        if MOVING_REVISION_RE.search(binding):
            _issue(issues, proposal_path, f"{identifier} identity/version binding contains a moving or unfrozen revision")
        positive_refs = _check_refs(issues, proposal_path, identifier, "positive acceptance", section.fields.get("positive acceptance"), declared_ac)
        negative_refs = _check_refs(issues, proposal_path, identifier, "negative acceptance", section.fields.get("negative acceptance"), declared_ac)
        responsibility_refs = positive_refs | negative_refs
        producer_owner = section.fields.get("producer owner", "")
        consumer_owner = section.fields.get("consumer owner", "")
        _check_confirmation(
            issues,
            proposal_path,
            f"{identifier} producer",
            producer_owner,
            lead,
            section.fields.get("producer owner confirmation"),
            required_handoffs,
            identifier,
            responsibility_refs,
        )
        _check_confirmation(
            issues,
            proposal_path,
            f"{identifier} consumer",
            consumer_owner,
            lead,
            section.fields.get("consumer owner confirmation"),
            required_handoffs,
            identifier,
            responsibility_refs,
        )

    for identifier, section in seq_sections.items():
        for field in sorted(section.duplicate_fields):
            _issue(issues, proposal_path, f"{identifier} contains duplicate field: {field}")
        for field in BOUNDARY_V1.sequence_fields:
            if not _meaningful(section.fields.get(field)):
                _issue(issues, proposal_path, f"{identifier} is missing concrete field '{field}'")
        positive_refs = _check_refs(issues, proposal_path, identifier, "positive acceptance", section.fields.get("positive acceptance"), declared_ac)
        negative_refs = _check_refs(issues, proposal_path, identifier, "negative acceptance", section.fields.get("negative acceptance"), declared_ac)
        responsibility_refs = positive_refs | negative_refs
        owner = section.fields.get("owner", "")
        contract_value = section.fields.get("boundary contracts", "")
        contract_refs: set[str] = set()
        if not contract_value.startswith("NOT_APPLICABLE"):
            contract_refs = _check_exact_refs(
                issues,
                proposal_path,
                f"{identifier} field 'boundary contracts'",
                contract_value,
                "BC",
            )
        if contract_refs:
            missing = contract_refs - set(bc_sections)
            if missing:
                _issue(issues, proposal_path, f"{identifier} references missing boundary contracts: {sorted(missing)}")
        elif not contract_value.startswith("NOT_APPLICABLE |") or not _meaningful(contract_value.partition("|")[2]):
            _issue(issues, proposal_path, f"{identifier} boundary contracts must list BC refs or NOT_APPLICABLE | <reason>")
        for cell in BOUNDARY_V1.sequence_cells:
            value = section.fields.get(cell, "")
            mode, separator, detail = value.partition("|")
            mode = mode.strip()
            detail = detail.strip()
            if mode == "REQUIRED":
                if not separator:
                    _issue(issues, proposal_path, f"{identifier} cell '{cell}' must use REQUIRED | <AC refs>")
                responsibility_refs.update(
                    _check_refs(issues, proposal_path, identifier, cell, detail, declared_ac)
                )
            elif mode == "NOT_APPLICABLE":
                if not separator or not _meaningful(detail):
                    _issue(issues, proposal_path, f"{identifier} cell '{cell}' N/A requires a concrete reason")
            else:
                _issue(issues, proposal_path, f"{identifier} cell '{cell}' must be REQUIRED or NOT_APPLICABLE")
        if section.fields.get("first use", "").partition("|")[0].strip() != "REQUIRED":
            _issue(issues, proposal_path, f"{identifier} first use must be REQUIRED")
        _check_confirmation(
            issues,
            proposal_path,
            identifier,
            owner,
            lead,
            section.fields.get("owner confirmation"),
            required_handoffs,
            identifier,
            responsibility_refs,
        )

    record_path = proposal_path.with_name("record.md")
    issues.extend(_lint_record_structure(record_path, case_index))
    _parse_handoffs(issues, record_path, required_handoffs)
    _check_lineage(
        issues,
        proposal_path,
        text,
        metadata,
        bc_sections,
        seq_sections,
        case_index,
        lead,
        required_handoffs,
    )
    return issues, declared_ac, metadata.get("boundary_revision_set") if bc_sections else None


def _parse_inherited_stances(value: str) -> tuple[dict[str, tuple[str, str]], list[str]]:
    if value == "NOT_APPLICABLE":
        return {}, []
    result: dict[str, tuple[str, str]] = {}
    errors: list[str] = []
    for item in _parse_csv(value):
        match = re.fullmatch(r"([^=,]+)=(S-\d{4})@(RS-\d{3})", item)
        if not match:
            errors.append(f"invalid inherited stance entry: {item}")
            continue
        owner, event_id, review_id = (part.strip() for part in match.groups())
        if owner in result:
            errors.append(f"duplicate inherited owner: {owner}")
        else:
            result[owner] = (event_id, review_id)
    return result, errors


def _parse_owner_list(value: str) -> tuple[set[str], list[str]]:
    owners = _parse_csv(value)
    errors: list[str] = []
    invalid = [owner for owner in owners if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", owner)]
    if invalid:
        errors.append(f"contains invalid owners: {invalid}")
    duplicates = sorted({owner for owner in owners if owners.count(owner) > 1})
    if duplicates:
        errors.append(f"contains duplicate owners: {duplicates}")
    return set(owners) - set(invalid), errors


def _check_review_stances(
    issues: list[Issue],
    record_path: Path,
    events: list[Event],
    review_snapshot: str,
    artifact: str,
    eligible_owners: set[str],
    lead: str,
    review: Event,
    re_review_owners: set[str],
    inherited_stances: dict[str, tuple[str, str]],
    case_index: CaseIndex | None,
    changed_blocks: str,
) -> None:
    """Validate canonical stance S events bound to the current RS."""

    owner_events: dict[str, list[Event]] = {}
    review_opened_at = _parse_timestamp(review.timestamp or "")
    review_deadline = _parse_timestamp(review.fields.get("review deadline", ""))
    disposition_deadline = _parse_timestamp(review.fields.get("lead disposition deadline", ""))
    by_id = {event.identifier: event for event in events}
    current_objections: list[Event] = []
    retargeted_objection_targets: dict[str, str] = {}
    invalidated_scopes = review.fields.get("invalidated scopes", "")
    if inherited_stances and (
        _normalize_name(changed_blocks) in {"all", "全案"}
        or _normalize_name(invalidated_scopes) in {"all", "全案"}
    ):
        _issue(
            issues,
            record_path,
            f"{review_snapshot} cannot inherit stances when changed blocks or invalidated scopes cover ALL",
        )
    for event in events:
        event_type = event.fields.get("type", "")
        if event_type == "OBJECTION":
            event_review = event.fields.get("review snapshot")
            objection_time = _parse_timestamp(event.timestamp or "")
            if event_review in {None, ""}:
                _issue(issues, record_path, f"{event.identifier} OBJECTION must bind a current RS or PENDING_RS")
                continue
            if event_review == "PENDING_RS":
                if event.fields.get("status") != "PENDING_REVIEW_TARGET":
                    _issue(issues, record_path, f"{event.identifier} PENDING_RS objection must be PENDING_REVIEW_TARGET")
                if objection_time is not None and review_opened_at is not None and objection_time >= review_opened_at:
                    _issue(issues, record_path, f"{event.identifier} cannot use PENDING_RS after {review_snapshot} opens")
                retargets = [
                    candidate for candidate in events
                    if candidate.fields.get("type") == "NOTICE"
                    and candidate.fields.get("notice kind") == "OBJECTION_RETARGET"
                    and candidate.fields.get("target") == event.identifier
                    and (
                        candidate.fields.get("review snapshot") == review_snapshot
                        or candidate.fields.get("new target / review snapshot", "").endswith(
                            f" | {review_snapshot}"
                        )
                    )
                ]
                if len(retargets) != 1:
                    _issue(issues, record_path, f"{event.identifier} must have exactly one current OBJECTION_RETARGET")
                    continue
                retarget = retargets[0]
                result = retarget.fields.get("result")
                old_target_status = retarget.fields.get("old target / status")
                if old_target_status != f"{event.fields.get('target')} | PENDING_REVIEW_TARGET":
                    _issue(issues, record_path, f"{retarget.identifier} must bind the original pending target and status")
                expected_new_target = f"{artifact} | {review_snapshot}"
                if retarget.fields.get("new target / review snapshot") != expected_new_target:
                    _issue(issues, record_path, f"{retarget.identifier} new target/review must exactly equal {expected_new_target}")
                retarget_time = _parse_timestamp(retarget.timestamp or "")
                if retarget_time is not None and review_opened_at is not None and retarget_time <= review_opened_at:
                    _issue(issues, record_path, f"{retarget.identifier} must occur after {review_snapshot} opens")
                if retarget_time is not None and review_deadline is not None and retarget_time > review_deadline:
                    _issue(issues, record_path, f"{retarget.identifier} occurred after {review_snapshot} review deadline")
                if result == "CONFIRMED":
                    current_objections.append(event)
                    retargeted_objection_targets[event.identifier] = artifact
                elif result not in {"WITHDRAWN", "RETURN_NO_LINK"}:
                    _issue(issues, record_path, f"{retarget.identifier} has invalid objection retarget result")
                continue
            if event_review == review_snapshot:
                current_objections.append(event)
            continue
        if event_type not in {"AGREE", "ABSTAIN"}:
            continue
        if event.fields.get("review snapshot") != review_snapshot:
            continue
        owner = event.fields.get("owner", "")
        if owner not in eligible_owners:
            _issue(
                issues,
                record_path,
                f"{event.identifier} records a {review_snapshot} stance for ineligible owner {owner or 'none'}",
            )
            continue
        owner_events.setdefault(owner, []).append(event)
        if event.fields.get("speaker") != owner:
            _issue(issues, record_path, f"{event.identifier} stance speaker must exactly match owner {owner}")
        stance_time = _parse_timestamp(event.timestamp or "")
        if (
            stance_time is not None
            and review_opened_at is not None
            and stance_time <= review_opened_at
        ):
            _issue(issues, record_path, f"{event.identifier} stance must occur after {review_snapshot} opens")
        if stance_time is not None and review_deadline is not None and stance_time > review_deadline:
            _issue(issues, record_path, f"{event.identifier} stance occurred after {review_snapshot} review deadline")
        if event_type in {"AGREE", "ABSTAIN"} and event.fields.get("target") != artifact:
            _issue(issues, record_path, f"{event.identifier} {event_type} target must exactly bind {artifact}")
        if event_type in {"AGREE", "ABSTAIN"} and not _meaningful(event.fields.get("scope")):
            _issue(issues, record_path, f"{event.identifier} {event_type} must record a concrete review scope")
        if event_type == "ABSTAIN" and not _meaningful(event.fields.get("reason")):
            _issue(issues, record_path, f"{event.identifier} ABSTAIN must record a concrete reason or TIMEOUT")

    for event in current_objections:
        event_owner = event.fields.get("owner", "")
        if event_owner in eligible_owners:
            owner_events.setdefault(event_owner, []).append(event)
            if event.fields.get("speaker") != event_owner:
                _issue(issues, record_path, f"{event.identifier} stance speaker must exactly match owner {event_owner}")
        elif not _meaningful(event.fields.get("speaker")):
            _issue(issues, record_path, f"{event.identifier} limited objection must identify its speaker")
        objection_time = _parse_timestamp(event.timestamp or "")
        if event.fields.get("review snapshot") == review_snapshot:
            if objection_time is not None and review_opened_at is not None and objection_time <= review_opened_at:
                _issue(issues, record_path, f"{event.identifier} objection must occur after {review_snapshot} opens")
            if objection_time is not None and review_deadline is not None and objection_time > review_deadline:
                _issue(issues, record_path, f"{event.identifier} objection occurred after {review_snapshot} review deadline")
        for field in ("target", "scope", "basis", "decision effect", "requested change"):
            if not _meaningful(event.fields.get(field)):
                _issue(issues, record_path, f"{event.identifier} OBJECTION must record concrete {field}")
        effective_target = retargeted_objection_targets.get(event.identifier, event.fields.get("target"))
        if effective_target != artifact:
            _issue(issues, record_path, f"{event.identifier} OBJECTION target must exactly bind {artifact}")
        dispositions = [
            candidate
            for candidate in events
            if candidate.fields.get("type") == "LEAD_DISPOSITION"
            and candidate.fields.get("target") == event.identifier
        ]
        if len(dispositions) != 1:
            _issue(
                issues,
                record_path,
                f"{event.identifier} must have exactly one canonical LEAD_DISPOSITION; found {len(dispositions)}",
            )
            continue
        disposition = dispositions[0]
        result = disposition.fields.get("disposition")
        if disposition.fields.get("speaker") != lead:
            _issue(issues, record_path, f"{disposition.identifier} speaker must be lead owner {lead}")
        if result not in {"ACCEPT", "REJECT", "PARTIAL_ACCEPT"}:
            _issue(issues, record_path, f"{disposition.identifier} has invalid disposition")
        if not _meaningful(disposition.fields.get("reason")):
            _issue(issues, record_path, f"{disposition.identifier} must record a concrete disposition reason")
        if result == "PARTIAL_ACCEPT":
            for field in ("accepted portion", "rejected portion"):
                if not _meaningful(disposition.fields.get(field)):
                    _issue(issues, record_path, f"{disposition.identifier} PARTIAL_ACCEPT must record {field}")
        disposition_time = _parse_timestamp(disposition.timestamp or "")
        if objection_time is not None and disposition_time is not None and disposition_time <= objection_time:
            _issue(issues, record_path, f"{disposition.identifier} must occur after {event.identifier}")
        if disposition_time is not None and disposition_deadline is not None and disposition_time > disposition_deadline:
            _issue(issues, record_path, f"{disposition.identifier} occurred after lead disposition deadline")
        if result in {"ACCEPT", "PARTIAL_ACCEPT"}:
            _issue(issues, record_path, f"{disposition.identifier} {result} requires a successor artifact and successor RS before ruling")
        if result == "REJECT" and case_index is not None:
            allowed_statuses = {
                "awaiting-objection-grouping",
                "awaiting-full-vote",
                "hearing",
                "awaiting-evidence-direction",
                "awaiting-ruling",
            }
            if case_index.procedure_mode not in {"debate", "full"} or case_index.status not in allowed_statuses:
                _issue(issues, case_index.path, f"rejected material objection requires debate/full procedure and objection-routing state")
            disposition_index = events.index(disposition)
            groups = [
                candidate
                for candidate in events[disposition_index + 1 :]
                if candidate.fields.get("type") == "OBJECTION_GROUP"
                and event.identifier in _parse_csv(candidate.fields.get("member objections", ""))
            ]
            if case_index.status != "awaiting-objection-grouping" and not groups:
                _issue(
                    issues,
                    record_path,
                    f"{event.identifier} REJECT must have a later canonical OBJECTION_GROUP before leaving objection grouping",
                )
            if case_index.status == "awaiting-ruling":
                summaries = [
                    candidate
                    for candidate in events[disposition_index + 1 :]
                    if candidate.fields.get("type") == "SUMMARY"
                    and candidate.fields.get("current artifact") == artifact
                    and candidate.fields.get("ruling-ready artifact") == artifact
                    and candidate.fields.get("review positions") == review_snapshot
                ]
                if not groups or not summaries or events.index(summaries[-1]) <= events.index(groups[-1]):
                    _issue(
                        issues,
                        record_path,
                        f"{event.identifier} REJECT cannot reach awaiting-ruling without ordered OBJECTION_GROUP and SUMMARY events",
                    )

    for owner, (source_id, source_review) in inherited_stances.items():
        source = by_id.get(source_id)
        if source is None:
            _issue(issues, record_path, f"{review_snapshot} inherited stance source {source_id} does not exist")
            continue
        if source.fields.get("type") not in {"AGREE", "ABSTAIN"}:
            _issue(issues, record_path, f"{review_snapshot} may inherit only AGREE or ABSTAIN, not {source.fields.get('type')}")
        if source.fields.get("owner") != owner or source.fields.get("review snapshot") != source_review:
            _issue(issues, record_path, f"{review_snapshot} inherited stance lineage for {owner} is inconsistent")
        if source_review == review_snapshot:
            _issue(issues, record_path, f"{review_snapshot} cannot inherit a stance from itself")
        predecessor_review = review.fields.get("supersedes")
        if predecessor_review == "null" or source_review != predecessor_review:
            _issue(
                issues,
                record_path,
                f"{review_snapshot} inherited stance for {owner} must come from direct predecessor {predecessor_review}",
            )
        source_time = _event_heading_timestamp(source)
        review_time = _event_heading_timestamp(review)
        if source_time is not None and review_time is not None and source_time >= review_time:
            _issue(issues, record_path, f"{review_snapshot} inherited stance source {source_id} must predate the successor review")

    direct_owners = set(owner_events)
    missing = re_review_owners - direct_owners
    if missing:
        _issue(
            issues,
            record_path,
            f"{review_snapshot} is missing canonical re-review stance events for owners: {sorted(missing)}",
        )
    unexpected_direct = direct_owners - re_review_owners
    if unexpected_direct:
        _issue(issues, record_path, f"{review_snapshot} has direct stances for owners declared inherited: {sorted(unexpected_direct)}")
    for owner, stance_events in owner_events.items():
        if len(stance_events) != 1:
            normalized = [
                "OBJECT" if event.fields.get("type") == "OBJECTION" else event.fields.get("type", "")
                for event in stance_events
            ]
            _issue(
                issues,
                record_path,
                f"{review_snapshot} must have exactly one canonical stance for {owner}; found {normalized}",
            )
    lead_events = owner_events.get(lead, [])
    if len(lead_events) != 1 or lead_events[0].fields.get("type") != "AGREE":
        _issue(issues, record_path, f"{review_snapshot} lead owner {lead} must have canonical baseline AGREE")


def _material_handoffs_before_review(
    events: list[Event], review: Event
) -> tuple[set[str], set[str]]:
    targets: dict[str, str] = {}
    completed: set[str] = set()
    for event in events:
        if event is review:
            break
        handoff = next(iter(_refs("HS", event.fields.get("target", ""))), None)
        if handoff is None:
            continue
        if event.fields.get("type") == "HANDOFF":
            owner = event.fields.get("to", "")
            if owner:
                targets[handoff] = owner
        elif (
            event.fields.get("type") == "HANDOFF_RETURN"
            and event.fields.get("status") == "RETURNED"
            and _meaningful(event.fields.get("contribution"))
        ):
            completed.add(handoff)
    return completed, {targets[handoff] for handoff in completed if handoff in targets}


def _check_lineage(
    issues: list[Issue],
    path: Path,
    text: str,
    metadata: dict[str, str],
    bc_sections: dict[str, Section],
    seq_sections: dict[str, Section],
    case_index: CaseIndex | None,
    lead: str,
    required_handoffs: dict[str, ConfirmationRequirement],
) -> None:
    """Check the explicit boundary lineage markers used by v1 fixtures.

    The protocol treats proposal.md as the expected boundary contract and
    record.md as the review record.  Actual deployed revisions are verified in
    the current AT, not self-asserted by the proposal author.
    """

    declared_revisions = metadata.get("boundary_revision_set")
    if bc_sections:
        if declared_revisions is None:
            _issue(
                issues,
                path,
                "proposals with BC objects require boundary_revision_set in frontmatter",
            )
        else:
            if MOVING_REVISION_RE.search(declared_revisions) or not EXACT_REVISION_PAIR_RE.fullmatch(declared_revisions):
                _issue(
                    issues,
                    path,
                    "boundary_revision_set must be an exact immutable sha256:<producer>+sha256:<consumer> pair",
                )
            if EXACT_REVISION_PAIR_RE.fullmatch(declared_revisions):
                revision_tokens = declared_revisions.split("+")
                for identifier, section in bc_sections.items():
                    binding = section.fields.get("identity/version binding", "")
                    missing_tokens = [token for token in revision_tokens if token not in binding]
                    if missing_tokens:
                        _issue(
                            issues,
                            path,
                            f"{identifier} identity/version binding does not contain the exact declared revision pair",
                        )
    elif declared_revisions is not None:
        _issue(issues, path, "boundary_revision_set must be absent when the proposal has no BC objects")
    if "boundary_verified_revision_set" in metadata:
        _issue(
            issues,
            path,
            "proposal authors must not declare boundary_verified_revision_set; actual revisions belong to the current AT",
        )

    lines = text.splitlines()
    ps_starts = [
        (index, match.group("id"))
        for index, line in enumerate(lines)
        if (match := PS_HEADING_RE.match(line))
    ]
    if not ps_starts:
        _issue(issues, path, "proposal must contain a PS-### snapshot")
        return
    ps_ids = [identifier for _, identifier in ps_starts]
    for identifier in sorted({item for item in ps_ids if ps_ids.count(item) > 1}):
        _issue(issues, path, f"duplicate proposal snapshot identifier: {identifier}")
    ps_snapshots: list[tuple[str, dict[str, str]]] = []
    for position, (start, identifier) in enumerate(ps_starts):
        end = next(
            (index for index in range(start + 1, len(lines)) if H3_RE.match(lines[index])),
            len(lines),
        )
        fields, duplicate_fields = _fields_with_duplicates(lines[start + 1 : end])
        for field in sorted(duplicate_fields):
            _issue(issues, path, f"{identifier} contains duplicate field: {field}")
        if not HASH_RE.fullmatch(fields.get("content hash", "")):
            _issue(issues, path, f"{identifier} must declare an exact 64-hex SHA-256 content hash")
        if position == 0:
            if identifier != "PS-001":
                _issue(issues, path, "proposal snapshot lineage must begin with PS-001")
            if fields.get("supersedes") != "null":
                _issue(issues, path, f"initial {identifier} must explicitly declare supersedes: null")
        else:
            previous = ps_starts[position - 1][1]
            expected_number = int(previous.partition("-")[2]) + 1
            if identifier != f"PS-{expected_number:03d}":
                _issue(issues, path, f"proposal snapshot identifiers must be contiguous after {previous}")
            if fields.get("supersedes") != previous:
                _issue(issues, path, f"{identifier} must directly supersede {previous}")
        ps_snapshots.append((identifier, fields))
    latest_ps, latest_fields = ps_snapshots[-1]
    if case_index is not None:
        if case_index.current_ps != latest_ps:
            _issue(
                issues,
                case_index.path,
                f"case.md current_artifact_ref points to {case_index.current_ps or 'none'}, latest proposal snapshot is {latest_ps}",
            )
        expected_artifact_ref = f"{case_index.case_id}#{latest_ps}"
        if case_index.current_artifact_ref != expected_artifact_ref:
            _issue(
                issues,
                case_index.path,
                f"case.md current_artifact_ref must exactly equal {expected_artifact_ref}",
            )
    predecessor = latest_fields.get("supersedes")
    if predecessor is None:
        _issue(issues, path, f"{latest_ps} must declare supersedes")
        return
    current_objects = set(bc_sections) | set(seq_sections)
    if current_objects:
        boundary_object_hash = latest_fields.get("boundary object hash")
        if not HASH_RE.fullmatch(boundary_object_hash or ""):
            _issue(issues, path, "the current PS containing BC/SEQ must declare an exact boundary object hash")
        expected_boundary_hash = _boundary_object_hash(bc_sections, seq_sections)
        if boundary_object_hash != expected_boundary_hash:
            _issue(
                issues,
                path,
                f"{latest_ps} boundary object hash does not match canonical BC/SEQ content; expected {expected_boundary_hash}",
            )
        artifact_content_hash = latest_fields.get("content hash", "")
        if not HASH_RE.fullmatch(artifact_content_hash):
            _issue(issues, path, f"{latest_ps} must declare an exact 64-hex SHA-256 content hash")
        successor_rs = case_index.review_snapshot_ref if case_index is not None else None
        if successor_rs is None:
            _issue(issues, case_index.path if case_index else path, "case.md must point to the canonical current RS")
        else:
            record_path = path.with_name("record.md")
            record_events = (
                _events(record_path.read_text(encoding="utf-8"))
                if record_path.exists()
                else []
            )
            matching_reviews = [
                event
                for event in record_events
                if event.fields.get("type") == "NOTICE"
                and event.fields.get("target") == successor_rs
            ]
            review_events = [
                event
                for event in record_events
                if event.fields.get("type") == "NOTICE"
                and re.fullmatch(r"RS-\d{3}", event.fields.get("target", ""))
            ]
            review_targets = [event.fields["target"] for event in review_events]
            for identifier in sorted(
                {item for item in review_targets if review_targets.count(item) > 1}
            ):
                _issue(issues, record_path, f"duplicate canonical review snapshot identifier: {identifier}")
            if len(matching_reviews) != 1:
                _issue(
                    issues,
                    record_path,
                    f"declared boundary successor review {successor_rs} must have exactly one canonical NOTICE event",
                )
            else:
                review = matching_reviews[0]
                review_position = review_events.index(review)
                if review_position != len(review_events) - 1:
                    _issue(issues, record_path, f"case.md review_snapshot_ref {successor_rs} must point to the latest RS NOTICE")
                expected_rs_number = review_position + 1
                if successor_rs != f"RS-{expected_rs_number:03d}":
                    _issue(issues, record_path, f"review snapshot identifiers must be contiguous from RS-001")
                completed_handoffs, material_handoff_owners = _material_handoffs_before_review(
                    record_events, review
                )
                missing_before_review = set(required_handoffs) - completed_handoffs
                if missing_before_review:
                    _issue(
                        issues,
                        record_path,
                        f"{successor_rs} was frozen before required confirmation handoffs returned: {sorted(missing_before_review)}",
                    )
                expected_owners = {lead} | material_handoff_owners
                artifact = review.fields.get("artifact", "")
                expected_artifact = case_index.current_artifact_ref if case_index is not None else latest_ps
                artifact_matches = artifact == expected_artifact
                if not artifact_matches:
                    _issue(issues, record_path, f"{successor_rs} artifact must exactly bind {expected_artifact}")
                review_predecessor = review.fields.get("supersedes", "")
                _check_exact_artifact_basis(
                    issues,
                    record_path,
                    f"{successor_rs} basis",
                    review.fields.get("basis", ""),
                    expected_artifact,
                    review_predecessor,
                )
                if predecessor == "null":
                    if review_position != 0 or review_predecessor != "null":
                        _issue(issues, record_path, f"initial review {successor_rs} must declare supersedes: null")
                else:
                    expected_review_predecessor = (
                        review_events[review_position - 1].fields.get("target")
                        if review_position > 0
                        else None
                    )
                    if review_predecessor != expected_review_predecessor:
                        _issue(
                            issues,
                            record_path,
                            f"successor review {successor_rs} must directly supersede "
                            f"{expected_review_predecessor or 'an existing predecessor RS'}",
                        )
                if review.fields.get("review kind") not in {"ORDINARY", "BOS_CHANGE_REVIEW"}:
                    _issue(issues, record_path, f"{successor_rs} must declare a canonical review kind")
                review_objects, review_object_errors = _parse_exact_boundary_objects(
                    review.fields.get("boundary reviewed objects", "")
                )
                for error in review_object_errors:
                    _issue(issues, record_path, f"{successor_rs} boundary reviewed objects {error}")
                if review_objects != current_objects:
                    _issue(
                        issues,
                        record_path,
                        f"{successor_rs} boundary reviewed objects must exactly equal current BC/SEQ objects",
                    )
                if review.fields.get("boundary object hash") != boundary_object_hash:
                    _issue(issues, record_path, f"{successor_rs} boundary object hash must match {latest_ps}")
                if review.fields.get("artifact content hash") != artifact_content_hash:
                    _issue(issues, record_path, f"{successor_rs} artifact content hash must match {latest_ps}")
                review_content_hash = review.fields.get("content hash", "")
                if not HASH_RE.fullmatch(review_content_hash):
                    _issue(issues, record_path, f"{successor_rs} must declare an exact 64-hex SHA-256 content hash")
                elif review_content_hash != _review_snapshot_hash(review):
                    _issue(
                        issues,
                        record_path,
                        f"{successor_rs} content hash does not match its canonical NOTICE body; expected {_review_snapshot_hash(review)}",
                    )
                eligible_owner_list = _parse_csv(review.fields.get("eligible owners", ""))
                eligible_owners = set(eligible_owner_list)
                if len(eligible_owner_list) != len(eligible_owners):
                    _issue(issues, record_path, f"{successor_rs} eligible owners contains duplicates")
                if eligible_owners != expected_owners:
                    _issue(
                        issues,
                        record_path,
                        f"{successor_rs} eligible owners differ from the confirmed responsibility owners: "
                        f"RS={sorted(eligible_owners)}, expected={sorted(expected_owners)}",
                    )
                try:
                    declared_n = int(review.fields.get("n", ""))
                except ValueError:
                    declared_n = -1
                if declared_n != len(expected_owners):
                    _issue(issues, record_path, f"{successor_rs} N must equal {len(expected_owners)}")
                if "owner stances" in review.fields:
                    _issue(
                        issues,
                        record_path,
                        f"{successor_rs} must not duplicate canonical stance S events in an owner stances field",
                    )
                inherited_stances, inherited_errors = _parse_inherited_stances(
                    review.fields.get("inherited stances", "")
                )
                for error in inherited_errors:
                    _issue(issues, record_path, f"{successor_rs} {error}")
                re_review_owners, re_review_errors = _parse_owner_list(
                    review.fields.get("re-review owners", "")
                )
                for error in re_review_errors:
                    _issue(issues, record_path, f"{successor_rs} re-review owners {error}")
                inherited_owners = set(inherited_stances)
                if inherited_owners & re_review_owners:
                    _issue(issues, record_path, f"{successor_rs} inherited and re-review owners must be disjoint")
                if inherited_owners | re_review_owners != eligible_owners:
                    _issue(issues, record_path, f"{successor_rs} inherited plus re-review owners must exactly equal its electorate")
                if lead not in re_review_owners:
                    _issue(issues, record_path, f"{successor_rs} lead owner must publish a current baseline AGREE")
                if review_position == 0 and inherited_stances:
                    _issue(issues, record_path, f"initial {successor_rs} cannot inherit predecessor stances")
                if not _meaningful(review.fields.get("invalidated scopes"), allow_not_applicable=True):
                    _issue(issues, record_path, f"{successor_rs} must declare concrete invalidated scopes")
                deadline_names = (
                    "review deadline",
                    "objection intake deadline",
                    "lead disposition deadline",
                    "lead reminder final deadline",
                )
                deadlines = {
                    name: _parse_timestamp(review.fields.get(name, ""))
                    for name in deadline_names
                }
                for name, deadline in deadlines.items():
                    if deadline is None:
                        _issue(issues, record_path, f"{successor_rs} must declare timezone-aware {name}")
                if all(deadlines.values()):
                    review_opened_at = _parse_timestamp(review.timestamp or "")
                    if review_opened_at is not None and not (
                        review_opened_at < deadlines["review deadline"]
                    ):
                        _issue(issues, record_path, f"{successor_rs} review deadline must be after its opening event")
                    if deadlines["review deadline"] != deadlines["objection intake deadline"]:
                        _issue(issues, record_path, f"{successor_rs} review and objection intake deadlines must match")
                    if not (
                        deadlines["review deadline"]
                        < deadlines["lead disposition deadline"]
                        < deadlines["lead reminder final deadline"]
                    ):
                        _issue(issues, record_path, f"{successor_rs} deadline order is invalid")
                _check_review_stances(
                    issues,
                    record_path,
                    record_events,
                    successor_rs,
                    expected_artifact,
                    expected_owners,
                    lead,
                    review,
                    re_review_owners,
                    inherited_stances,
                    case_index,
                    latest_fields.get("changed blocks", ""),
                )


def _validate_plan_closure(
    issues: list[Issue],
    ruling_path: Path,
    ruling: Event,
    case_index: CaseIndex | None,
) -> Event | None:
    record_path = ruling_path.with_name("record.md")
    if not record_path.exists():
        _issue(issues, record_path, f"{ruling.identifier} requires canonical record.md closure events")
        return None
    record_text = record_path.read_text(encoding="utf-8")
    record_events = _events(record_text)
    required_concrete = (
        "ruling identity",
        "discussion type / procedure mode",
        "basis",
        "evidence flag disposition",
        "mandatory responses",
        "authorized action",
        "boundary protocol",
        "boundary contracts / state sequences",
        "evidence disposition",
        "accepted uncovered risks",
        "bos disposition",
        "acceptance series",
        "effect status at append",
        "closure bundle manifest",
        "closure bundle hash",
        "expected commit payload hash",
        "closure deadline",
        "effective when",
        "next state / si",
        "parent release",
        "stop condition",
    )
    for field in required_concrete:
        if not _meaningful(ruling.fields.get(field), allow_not_applicable=True):
            _issue(issues, ruling_path, f"{ruling.identifier} is missing concrete closure/action field '{field}'")
    if ruling.fields.get("ruling identity") != "Chief Judge":
        _issue(issues, ruling_path, f"{ruling.identifier} ACTION ruling identity must be Chief Judge")
    if ruling.fields.get("effect status at append") != "PENDING_CLOSURE":
        _issue(issues, ruling_path, f"{ruling.identifier} effect status at append must be PENDING_CLOSURE")
    if ruling.fields.get("boundary protocol") != "v1":
        _issue(issues, ruling_path, f"{ruling.identifier} boundary protocol must be v1")
    approved_objects, approved_object_errors = _parse_exact_mixed_refs(
        ruling.fields.get("boundary contracts / state sequences", ""),
        ("BC", "SEQ"),
    )
    for error in approved_object_errors:
        _issue(issues, ruling_path, f"{ruling.identifier} boundary contracts/state sequences {error}")
    if case_index is not None:
        expected_objects = case_index.boundary_contract_refs | case_index.state_sequence_refs
        if approved_objects != expected_objects:
            _issue(issues, ruling_path, f"{ruling.identifier} approved boundary/state refs must exactly match canonical case")
    if not re.fullmatch(r"AS-\d{3}", ruling.fields.get("acceptance series", "")):
        _issue(issues, ruling_path, f"{ruling.identifier} ACTION approval must create an AS-###")
    if case_index is not None:
        expected_mode = f"proposal | {case_index.procedure_mode}"
        if ruling.fields.get("discussion type / procedure mode") != expected_mode:
            _issue(issues, ruling_path, f"{ruling.identifier} discussion/procedure must exactly equal {expected_mode}")
        _check_action_ruling_basis(issues, ruling_path, ruling, case_index, record_events)

    manifest = _parse_canonical_json_object(
        issues,
        ruling_path,
        f"{ruling.identifier} closure bundle manifest",
        ruling.fields.get("closure bundle manifest"),
    )
    if manifest is None:
        return None
    expected_manifest_keys = {"bundle_body", "precommit_event_payloads", "commit_payload"}
    if set(manifest) != expected_manifest_keys:
        _issue(issues, ruling_path, f"{ruling.identifier} closure manifest keys must be {sorted(expected_manifest_keys)}")
        return None
    body = manifest.get("bundle_body")
    precommit_payloads = manifest.get("precommit_event_payloads")
    commit_payload = manifest.get("commit_payload")
    if not isinstance(body, dict) or not isinstance(precommit_payloads, list) or not isinstance(commit_payload, dict):
        _issue(issues, ruling_path, f"{ruling.identifier} closure manifest members have invalid types")
        return None
    body_keys = {
        "case_id",
        "ruling_id",
        "old_logical_state",
        "new_logical_state",
        "precommit_events",
        "commit_event_id",
        "deadline",
    }
    if set(body) != body_keys:
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle body keys must be {sorted(body_keys)}")
        return None
    if case_index is not None and body.get("case_id") != case_index.case_id:
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle case_id must match canonical case")
    if body.get("ruling_id") != ruling.identifier:
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle ruling_id mismatch")
    if body.get("new_logical_state") != "implementing":
        _issue(issues, ruling_path, f"{ruling.identifier} approved ACTION closure must enter implementing")
    if not _meaningful(str(body.get("old_logical_state", ""))):
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle must freeze old logical state")
    deadline = _parse_timestamp(str(body.get("deadline", "")))
    if deadline is None or ruling.fields.get("closure deadline") != body.get("deadline"):
        _issue(issues, ruling_path, f"{ruling.identifier} closure deadline must be timezone-aware and match its bundle")
    commit_event_id = body.get("commit_event_id")
    if not isinstance(commit_event_id, str) or not re.fullmatch(r"S-\d{4}", commit_event_id):
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle must reserve one commit S-####")
        return None

    bos_disposition = ruling.fields.get("bos disposition", "")
    bos_match = re.fullmatch(r"(BOS-\d{3})(?:\s+.*)?", bos_disposition)
    bos_ref = bos_match.group(1) if bos_match else None
    applicable_obligations = _bos_obligation_ids(record_text, bos_ref) if bos_ref else set()
    if bos_disposition == "NOT_APPLICABLE" and (precommit_payloads or body.get("precommit_events")):
        _issue(issues, ruling_path, f"{ruling.identifier} with BOS NOT_APPLICABLE must have no THREAD_STATUS precommit events")
    elif bos_disposition != "NOT_APPLICABLE" and bos_ref is None:
        _issue(issues, ruling_path, f"{ruling.identifier} BOS disposition must be NOT_APPLICABLE or bind one BOS-###")

    thread_status_keys = {
        "event_id",
        "case",
        "discussion_type",
        "procedure_mode",
        "speaker",
        "type",
        "target",
        "basis",
        "decision_effect",
        "old_status",
        "new_status",
        "closed_conditions",
        "remaining_conditions",
        "rank_change",
    }
    actual_precommit_refs: list[dict[str, str]] = []
    actual_precommit_events: list[Event] = []
    for payload in precommit_payloads:
        if not isinstance(payload, dict) or not re.fullmatch(r"S-\d{4}", str(payload.get("event_id", ""))):
            _issue(issues, ruling_path, f"{ruling.identifier} has an invalid precommit event payload")
            continue
        if set(payload) != thread_status_keys:
            _issue(
                issues,
                ruling_path,
                f"{ruling.identifier} THREAD_STATUS payload {payload.get('event_id')} must have exact canonical keys {sorted(thread_status_keys)}",
            )
        if payload.get("type") != "THREAD_STATUS":
            _issue(issues, ruling_path, f"{payload.get('event_id')} precommit payload type must be THREAD_STATUS")
        target = payload.get("target")
        if not isinstance(target, str) or not re.fullmatch(r"BO-\d{3}", target):
            _issue(issues, ruling_path, f"{payload.get('event_id')} THREAD_STATUS target must be exactly one BO-###")
        elif target not in applicable_obligations:
            _issue(issues, ruling_path, f"{payload.get('event_id')} THREAD_STATUS target {target} is not in the ruling's applicable BOS")
        for required_field in (
            "old_status",
            "new_status",
            "closed_conditions",
            "remaining_conditions",
            "rank_change",
        ):
            if not _meaningful(str(payload.get(required_field, "")), allow_not_applicable=True):
                _issue(issues, ruling_path, f"{payload.get('event_id')} THREAD_STATUS missing concrete {required_field}")
        if case_index is not None:
            if payload.get("case") != case_index.case_id:
                _issue(issues, ruling_path, f"{payload.get('event_id')} THREAD_STATUS case must match canonical case")
            if payload.get("discussion_type") != "proposal" or payload.get("procedure_mode") != case_index.procedure_mode:
                _issue(issues, ruling_path, f"{payload.get('event_id')} THREAD_STATUS discussion/procedure mismatch")
        event_hash = _closure_event_hash(payload)
        actual_precommit_refs.append({"event_id": str(payload["event_id"]), "event_payload_hash": event_hash})
        matches = [event for event in record_events if event.identifier == payload["event_id"]]
        if len(matches) != 1:
            _issue(issues, record_path, f"{ruling.identifier} precommit event {payload['event_id']} must exist exactly once")
            continue
        actual = matches[0]
        actual_precommit_events.append(actual)
        if _closure_record_payload(actual) != payload:
            _issue(issues, record_path, f"{actual.identifier} does not match its frozen closure payload")
        if actual.fields.get("payload hash") != event_hash:
            _issue(issues, record_path, f"{actual.identifier} payload hash does not match its canonical payload")
    if body.get("precommit_events") != actual_precommit_refs:
        _issue(issues, ruling_path, f"{ruling.identifier} ordered precommit refs do not match frozen payloads")

    computed_bundle_hash = _closure_bundle_hash(body)
    if ruling.fields.get("closure bundle hash") != computed_bundle_hash:
        _issue(issues, ruling_path, f"{ruling.identifier} closure bundle hash does not match canonical bundle body")
    expected_commit = {
        "event_id": commit_event_id,
        "type": "NOTICE",
        "notice_kind": "CLOSURE_COMMIT",
        "case_id": body.get("case_id"),
        "ruling_id": ruling.identifier,
        "closure_bundle_hash": computed_bundle_hash,
        "precommit_event_hashes": [item["event_payload_hash"] for item in actual_precommit_refs],
        "old_logical_state": body.get("old_logical_state"),
        "new_logical_state": body.get("new_logical_state"),
    }
    if commit_payload != expected_commit:
        _issue(issues, ruling_path, f"{ruling.identifier} frozen commit payload does not match its bundle")
    expected_commit_hash = _closure_event_hash(expected_commit)
    if ruling.fields.get("expected commit payload hash") != expected_commit_hash:
        _issue(issues, ruling_path, f"{ruling.identifier} expected commit payload hash is invalid")
    expected_effective = f"record.md#{commit_event_id} NOTICE:CLOSURE_COMMIT"
    if ruling.fields.get("effective when") != expected_effective:
        _issue(issues, ruling_path, f"{ruling.identifier} effective when must exactly equal {expected_effective}")

    closure_candidates = [
        event
        for event in record_events
        if event.fields.get("type") == "NOTICE"
        and event.fields.get("notice kind") == "CLOSURE_COMMIT"
        and event.fields.get("ruling") == ruling.identifier
    ]
    if len(closure_candidates) != 1:
        _issue(issues, record_path, f"{ruling.identifier} must have exactly one canonical NOTICE:CLOSURE_COMMIT")
        return None
    commit = closure_candidates[0]
    if commit.identifier != commit_event_id:
        _issue(issues, record_path, f"{ruling.identifier} closure commit must use reserved ID {commit_event_id}")
    actual_commit_payload = _closure_commit_payload(commit)
    if actual_commit_payload != expected_commit:
        _issue(issues, record_path, f"{commit.identifier} closure commit payload does not match the frozen ruling payload")
    if commit.fields.get("payload hash") != expected_commit_hash:
        _issue(issues, record_path, f"{commit.identifier} closure commit payload hash is invalid")
    ruling_time = _event_heading_timestamp(ruling)
    commit_time = _event_heading_timestamp(commit)
    if ruling_time is None:
        _issue(issues, ruling_path, f"{ruling.identifier} heading must contain a timezone-aware timestamp")
    if commit_time is None or (ruling_time is not None and commit_time <= ruling_time):
        _issue(issues, record_path, f"{commit.identifier} closure commit must occur after {ruling.identifier}")
    if commit_time is not None and deadline is not None and commit_time > deadline:
        _issue(issues, record_path, f"{commit.identifier} closure commit occurred after the frozen deadline")
    commit_position = record_events.index(commit)
    precommit_positions: list[int] = []
    for event in actual_precommit_events:
        position = record_events.index(event)
        precommit_positions.append(position)
        event_time = _event_heading_timestamp(event)
        if position >= commit_position:
            _issue(issues, record_path, f"{event.identifier} THREAD_STATUS must be appended before closure commit {commit.identifier}")
        if ruling_time is not None and event_time is not None and event_time <= ruling_time:
            _issue(issues, record_path, f"{event.identifier} THREAD_STATUS must occur after {ruling.identifier}")
        if commit_time is not None and event_time is not None and event_time >= commit_time:
            _issue(issues, record_path, f"{event.identifier} THREAD_STATUS must occur before closure commit {commit.identifier}")
    if precommit_positions != sorted(precommit_positions) or len(precommit_positions) != len(set(precommit_positions)):
        _issue(issues, record_path, f"{ruling.identifier} THREAD_STATUS events must appear in frozen manifest order before commit")
    if case_index is not None and case_index.review_snapshot_ref:
        reviews = [
            event for event in record_events
            if event.fields.get("type") == "NOTICE"
            and event.fields.get("target") == case_index.review_snapshot_ref
        ]
        if len(reviews) == 1 and ruling_time is not None:
            review_deadline = _parse_timestamp(reviews[0].fields.get("review deadline", ""))
            if review_deadline is not None and ruling_time < review_deadline:
                _issue(issues, ruling_path, f"{ruling.identifier} cannot precede the current RS review deadline")
    return commit


def _approved_acceptance_contract(
    ruling_path: Path,
    proposal_ac: set[str],
    proposal_revision_set: str | None,
    case_index: CaseIndex | None,
) -> tuple[EffectivePlanContract, list[Issue]]:
    issues: list[Issue] = []
    if not ruling_path.exists():
        _issue(issues, ruling_path, "acceptance validation requires ruling.md with an approved PLAN_RULING")
        return EffectivePlanContract(proposal_ac, proposal_revision_set, None, None), issues
    rulings = _rulings(ruling_path.read_text(encoding="utf-8"))
    ruling_ids = [ruling.identifier for ruling in rulings]
    for identifier in sorted({item for item in ruling_ids if ruling_ids.count(item) > 1}):
        _issue(issues, ruling_path, f"duplicate ruling identifier: {identifier}")
    for item in rulings:
        for field in sorted(item.duplicate_fields):
            _issue(issues, ruling_path, f"{item.identifier} contains duplicate field: {field}")
    if rulings and rulings[0].identifier != "R-0001":
        _issue(issues, ruling_path, "ruling lineage must begin with R-0001")
    plan_rulings = [
        ruling for ruling in rulings if ruling.fields.get("record type") == "PLAN_RULING"
    ]
    if not plan_rulings:
        _issue(issues, ruling_path, "acceptance validation requires an APPROVED ACTION PLAN_RULING")
        return EffectivePlanContract(proposal_ac, proposal_revision_set, None, None), issues
    ruling = plan_rulings[-1]
    if ruling.fields.get("proposal result") != "APPROVED" or ruling.fields.get("ruling scope") != "ACTION":
        _issue(
            issues,
            ruling_path,
            f"latest PLAN_RULING {ruling.identifier} must be APPROVED with ACTION scope for acceptance",
        )
    snapshot = ruling.fields.get("approved proposal/snapshot", "")
    if case_index is not None and snapshot != case_index.current_artifact_ref:
        _issue(
            issues,
            ruling_path,
            f"{ruling.identifier} approved snapshot must exactly match {case_index.current_artifact_ref}",
        )
    approved_ac = _check_exact_refs(
        issues,
        ruling_path,
        f"{ruling.identifier} acceptance criteria",
        ruling.fields.get("acceptance criteria"),
        "AC",
    )
    if approved_ac != proposal_ac:
        _issue(
            issues,
            ruling_path,
            f"{ruling.identifier} acceptance criteria differ from its approved proposal: "
            f"ruling={sorted(approved_ac)}, proposal={sorted(proposal_ac)}",
        )
    approved_revision_set = ruling.fields.get("boundary revision set")
    if proposal_revision_set is None:
        if approved_revision_set not in {None, "NOT_APPLICABLE"}:
            _issue(issues, ruling_path, f"{ruling.identifier} boundary revision set must be NOT_APPLICABLE")
    else:
        if approved_revision_set != proposal_revision_set:
            _issue(
                issues,
                ruling_path,
                f"{ruling.identifier} boundary revision set must exactly match the approved proposal",
            )
    commit = _validate_plan_closure(issues, ruling_path, ruling, case_index)
    return EffectivePlanContract(approved_ac, approved_revision_set, ruling, commit), issues


def _validate_acceptance_evidence(
    evidence_path: Path,
    required_refs: set[str],
    revision_refs: set[str],
    criterion_evidence: dict[str, set[str]],
    approved_revision_set: str | None,
    approved_snapshot: str,
) -> list[Issue]:
    issues: list[Issue] = []
    if not required_refs:
        return issues
    if not evidence_path.exists():
        _issue(issues, evidence_path, "acceptance evidence refs require canonical evidence.md")
        return issues
    entries = _evidence(evidence_path.read_text(encoding="utf-8"))
    identifiers = [entry.identifier for entry in entries]
    for identifier in sorted({item for item in identifiers if identifiers.count(item) > 1}):
        _issue(issues, evidence_path, f"duplicate evidence identifier: {identifier}")
    by_id: dict[str, Event] = {}
    for entry in entries:
        by_id.setdefault(entry.identifier, entry)
        for field in sorted(entry.duplicate_fields):
            _issue(issues, evidence_path, f"{entry.identifier} contains duplicate field: {field}")
    missing = required_refs - set(by_id)
    if missing:
        _issue(issues, evidence_path, f"acceptance references missing canonical evidence: {sorted(missing)}")
    for identifier in sorted(required_refs & set(by_id)):
        stable_slices = by_id[identifier].fields.get("stable slices", "")
        if not _meaningful(stable_slices) or not SHA256_TOKEN_RE.search(stable_slices):
            _issue(
                issues,
                evidence_path,
                f"{identifier} must contain a stable slice with an exact 64-hex SHA-256 digest",
            )
    case_id = approved_snapshot.partition("#")[0]
    for criterion, evidence_refs in sorted(criterion_evidence.items()):
        expected_link = f"{case_id}#{criterion}"
        for identifier in sorted(evidence_refs & set(by_id)):
            entry = by_id[identifier]
            if entry.fields.get("supports/refutes") != criterion:
                _issue(issues, evidence_path, f"{identifier} must explicitly support {criterion}")
            if entry.fields.get("decision link") != expected_link:
                _issue(issues, evidence_path, f"{identifier} decision link must exactly bind {expected_link}")
    revision_tokens = (approved_revision_set or "").split("+")
    for identifier in sorted(revision_refs & set(by_id)):
        entry = by_id[identifier]
        if _normalize_name(entry.fields.get("supports/refutes", "")) != "boundary revision set":
            _issue(issues, evidence_path, f"{identifier} must explicitly support boundary revision set")
        if entry.fields.get("decision link") != approved_snapshot:
            _issue(issues, evidence_path, f"{identifier} decision link must exactly bind {approved_snapshot}")
        stable_slices = entry.fields.get("stable slices", "")
        if any(token not in stable_slices for token in revision_tokens):
            _issue(issues, evidence_path, f"{identifier} stable slice must bind the approved revision pair")
    return issues


def _lint_acceptance(
    acceptance_path: Path,
    proposal_ac: set[str],
    proposal_revision_set: str | None,
    case_index: CaseIndex | None,
) -> list[Issue]:
    issues: list[Issue] = []
    contract, ruling_issues = _approved_acceptance_contract(
        acceptance_path.with_name("ruling.md"), proposal_ac, proposal_revision_set, case_index
    )
    declared_ac = contract.criteria
    approved_revision_set = contract.revision_set
    issues.extend(ruling_issues)
    if not acceptance_path.exists():
        _issue(issues, acceptance_path, "acceptance phase requires acceptance.md")
        return issues
    text = acceptance_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    at_starts = [
        (index, match.group("id"))
        for index, line in enumerate(lines)
        if (match := AT_HEADING_RE.match(line))
    ]
    if not at_starts:
        _issue(issues, acceptance_path, "acceptance.md must contain an AT-### snapshot")
        return issues
    at_ids = [identifier for _, identifier in at_starts]
    duplicate_at_ids = sorted({identifier for identifier in at_ids if at_ids.count(identifier) > 1})
    for identifier in duplicate_at_ids:
        _issue(issues, acceptance_path, f"duplicate acceptance snapshot identifier: {identifier}")
    at_snapshots: list[tuple[str, int, int, dict[str, str], datetime | None]] = []
    for position, (start, identifier) in enumerate(at_starts):
        end = at_starts[position + 1][0] if position + 1 < len(at_starts) else len(lines)
        fields, duplicate_fields = _fields_with_duplicates(lines[start:end])
        timestamp_match = AT_TIMESTAMP_RE.match(lines[start])
        timestamp = _parse_timestamp(timestamp_match.group("timestamp")) if timestamp_match else None
        if timestamp is None:
            _issue(issues, acceptance_path, f"{identifier} heading must contain a timezone-aware timestamp")
        for field in sorted(duplicate_fields):
            _issue(issues, acceptance_path, f"{identifier} contains duplicate field: {field}")
        if position == 0:
            if identifier != "AT-001":
                _issue(issues, acceptance_path, "acceptance snapshot lineage must begin with AT-001")
            if fields.get("supersedes at") != "null":
                _issue(issues, acceptance_path, f"initial {identifier} must explicitly declare supersedes AT: null")
        else:
            previous = at_starts[position - 1][1]
            expected_number = int(previous.partition("-")[2]) + 1
            if identifier != f"AT-{expected_number:03d}":
                _issue(issues, acceptance_path, f"acceptance snapshot identifiers must be contiguous after {previous}")
            if fields.get("supersedes at") != previous:
                _issue(issues, acceptance_path, f"{identifier} must directly supersede {previous}")
        at_snapshots.append((identifier, start, end, fields, timestamp))
    current_at, current_start, current_end, current_fields, current_at_time = at_snapshots[-1]
    current_lines = lines[current_start:current_end]
    criteria_refs = _check_exact_refs(
        issues,
        acceptance_path,
        f"{current_at} criteria",
        current_fields.get("criteria"),
        "AC",
    )
    if criteria_refs != declared_ac:
        _issue(
            issues,
            acceptance_path,
            f"{current_at} criteria field differs from approved criteria: "
            f"AT={sorted(criteria_refs)}, approved={sorted(declared_ac)}",
        )
    verified_revision_set = current_fields.get("verified boundary revision set")
    verified_revision_evidence = current_fields.get("verified boundary revision evidence", "")
    if approved_revision_set in {None, "NOT_APPLICABLE"}:
        if verified_revision_set not in {None, "NOT_APPLICABLE"}:
            _issue(issues, acceptance_path, f"{current_at} verified boundary revision set must be NOT_APPLICABLE")
    else:
        if verified_revision_set != approved_revision_set:
            _issue(
                issues,
                acceptance_path,
                f"{current_at} verified boundary revision set does not match the approved revision pair",
            )
        if not _refs("E", verified_revision_evidence):
            _issue(
                issues,
                acceptance_path,
                f"{current_at} must cite stable evidence for its verified boundary revision set",
            )
    rows: dict[str, tuple[str, str, str]] = {}
    for line in current_lines:
        match = CRITERION_RE.match(line)
        if not match:
            continue
        criterion = match.group("id")
        if criterion in rows:
            _issue(issues, acceptance_path, f"{current_at} has duplicate criteria result for {criterion}")
        rows[criterion] = (match.group("status"), match.group("method").strip(), match.group("evidence").strip())
    revision_evidence_refs = _check_exact_refs(
        issues,
        acceptance_path,
        f"{current_at} verified boundary revision evidence",
        verified_revision_evidence,
        "E",
        require_nonempty=approved_revision_set not in {None, "NOT_APPLICABLE"},
    )
    evidence_refs = set(revision_evidence_refs)
    criterion_evidence: dict[str, set[str]] = {}
    for criterion, (_, _, evidence) in rows.items():
        refs = _check_exact_refs(
            issues,
            acceptance_path,
            f"{current_at} {criterion} evidence",
            evidence,
            "E",
        )
        criterion_evidence[criterion] = refs
        evidence_refs.update(refs)
    issues.extend(
        _validate_acceptance_evidence(
            acceptance_path.with_name("evidence.md"),
            evidence_refs,
            revision_evidence_refs,
            criterion_evidence,
            approved_revision_set,
            case_index.current_artifact_ref if case_index is not None else "",
        )
    )
    missing = declared_ac - set(rows)
    extra = set(rows) - declared_ac
    if missing:
        _issue(issues, acceptance_path, f"{current_at} criteria results are missing approved criteria: {sorted(missing)}")
    if extra:
        _issue(issues, acceptance_path, f"{current_at} criteria results contain criteria outside the proposal: {sorted(extra)}")
    for criterion, (status, method, evidence) in rows.items():
        if not _meaningful(method):
            _issue(issues, acceptance_path, f"{current_at} {criterion} must record a concrete method")
        if not _meaningful(evidence):
            _issue(issues, acceptance_path, f"{current_at} {criterion} must record concrete evidence")
        if status != "PASS":
            _issue(issues, acceptance_path, f"{current_at} {criterion} is {status}; acceptance gate requires PASS")
    initial_result = current_fields.get("initial result")
    all_pass = bool(declared_ac) and declared_ac == set(rows) and all(row[0] == "PASS" for row in rows.values())
    if all_pass and initial_result != "PASSED":
        _issue(issues, acceptance_path, f"{current_at} has all criteria PASS but initial result is not PASSED")
    if not all_pass and initial_result == "PASSED":
        _issue(issues, acceptance_path, f"{current_at} initial result cannot be PASSED while a criterion is missing or non-PASS")
    if contract.ruling is not None:
        if current_fields.get("implementation plan_ruling") != contract.ruling.identifier:
            _issue(issues, acceptance_path, f"{current_at} must bind effective PLAN_RULING {contract.ruling.identifier}")
        if case_index is not None and current_fields.get("effective proposal/snapshot") != case_index.current_artifact_ref:
            _issue(issues, acceptance_path, f"{current_at} effective snapshot must match canonical current PS")
        if current_fields.get("acceptance series") != contract.ruling.fields.get("acceptance series"):
            _issue(issues, acceptance_path, f"{current_at} acceptance series must match its PLAN_RULING")
    if contract.commit is None:
        _issue(issues, acceptance_path, f"{current_at} cannot exist before an effective PLAN_RULING closure commit")
    else:
        commit_time = _event_heading_timestamp(contract.commit)
        if current_at_time is not None and commit_time is not None and current_at_time <= commit_time:
            _issue(issues, acceptance_path, f"{current_at} must occur after the PLAN_RULING closure commit")
    if case_index is not None and case_index.status != "acceptance":
        _issue(issues, case_index.path, "case.md status must be acceptance while a current AT is being validated")
    return issues


def lint_case(path: str | Path, *, phase: str = "ruling") -> list[Issue]:
    """Return conformance issues for a canonical proposal case directory.

    ``phase='ruling'`` validates proposal structure, references and returned,
    serial owner handoffs. ``phase='acceptance'`` additionally requires every
    approved AC to have a concrete PASS row in ``acceptance.md``.
    """

    requested_path = Path(path)
    case_path = requested_path.parent if requested_path.name == "proposal.md" else requested_path
    proposal_path = case_path / "proposal.md"
    if not proposal_path.exists():
        return [Issue(proposal_path, "proposal.md does not exist")]
    case_index, issues = _load_case_index(case_path)
    proposal_issues, declared_ac, proposal_revision_set = _lint_proposal(proposal_path, case_index)
    issues.extend(proposal_issues)
    if phase == "acceptance":
        issues.extend(
            _lint_acceptance(
                proposal_path.with_name("acceptance.md"),
                declared_ac,
                proposal_revision_set,
                case_index,
            )
        )
    elif phase == "ruling":
        ruling_path = proposal_path.with_name("ruling.md")
        if ruling_path.exists():
            _, ruling_issues = _approved_acceptance_contract(
                ruling_path,
                declared_ac,
                proposal_revision_set,
                case_index,
            )
            issues.extend(ruling_issues)
    elif phase != "ruling":
        issues.append(Issue(proposal_path, f"unsupported phase: {phase}"))
    return issues
