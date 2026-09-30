"""skills_inventory — the backend-authoritative skill inventory for PuPu (ticket #291).

One resolution path feeds three consumers: the developer agent (Unchain
`SkillsModule` mounted with the same descriptors), the renderer command menu
(`GET /skills/inventory`, schema `pupu.skill_inventory.v1`) and the per-send
stale-selection check (`options.skill_inventory_revision`).

Sources:
- every installed pure-skill pack (persisted store rows, never a live MCP
  connection) as skills-only descriptors, `source="skillpack"`,
  `source_id=<pack toolkit id>`, `base_dir=None` (instruction-only imports);
- toolkit-embedded `[[skills]]` only from the executable toolkits actually
  selected for the run (`Toolkit.skills`, set by Unchain for builtins and by the
  MCP runtime toolkit builder);
- workspace `.unchain/skills` / `.agents/skills` and the user directories,
  discovered by Unchain's `SkillRegistry` itself.

Unchain owns conflict resolution (rank, then identity key) and publishes one
`SkillInventory(skills, diagnostics, revision)`; this module only assembles
inputs and projects the result onto the CLOSED wire schema.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence

from skill_packs import SKILL_PACK_ID_PREFIX, list_installed_skill_packs
from skill_rows import normalize_skill_rows

INVENTORY_SCHEMA = "pupu.skill_inventory.v1"
# Builtin / interject command names owned by the renderer (`command_registry.js`);
# they never resolve as skill invocations.
RESERVED_COMMANDS = ("btw", "fyi", "queue", "steer")
SKILLPACK_SOURCE = "skillpack"

_INVENTORY_ENTRY_KEYS = (
    "id",
    "name",
    "description",
    "source",
    "source_id",
    "aliases",
    "model_invocable",
    "user_invocable",
    "reserved",
)
_DIAGNOSTIC_KEYS = ("kind", "name", "source", "source_id", "message")


def _skill_descriptor_type():
    from unchain.tools.models import SkillDescriptor  # submodule import: immune to lazy-export mocks

    return SkillDescriptor


def pack_skill_descriptors(packs: Iterable[Dict[str, Any]]) -> list:
    """Skills-only descriptors for installed pure-skill packs (frontend record shape)."""

    SkillDescriptor = _skill_descriptor_type()
    descriptors: list = []
    for pack in packs:
        if not isinstance(pack, dict):
            continue
        toolkit_id = str(pack.get("toolkitId") or pack.get("toolkit_id") or "").strip()
        if not toolkit_id.startswith(SKILL_PACK_ID_PREFIX):
            continue
        # normalize_skill_rows is idempotent: stored rows already carry the
        # canonical name / aliases / policy fields, legacy rows get them here.
        for row in normalize_skill_rows(pack.get("skills")):
            descriptors.append(
                SkillDescriptor(
                    str(row["name"]),
                    str(row.get("description") or ""),
                    str(row["body"]),
                    tuple(str(tool) for tool in row.get("tools") or ()),
                    None,
                    model_invocable=bool(row.get("model_invocable", True)),
                    user_invocable=bool(row.get("user_invocable", True)),
                    metadata=dict(row.get("metadata") or {}),
                    aliases=tuple(str(alias) for alias in row.get("aliases") or ()),
                    source=SKILLPACK_SOURCE,
                    source_id=toolkit_id,
                )
            )
    return descriptors


def installed_pack_skill_descriptors(data_dir: Any = None) -> list:
    """Descriptors for every installed pure-skill pack (single read point)."""

    return pack_skill_descriptors(list_installed_skill_packs(data_dir))


def selected_toolkit_skill_descriptors(toolkits: Sequence[Any] | None) -> list:
    """`[[skills]]` carried by the executable toolkits selected for this run."""

    descriptors: list = []
    for toolkit in toolkits or ():
        descriptors.extend(tuple(getattr(toolkit, "skills", ()) or ()))
    return descriptors


def catalog_skill_rows_by_toolkit(catalog: Dict[str, Any] | None = None) -> Dict[str, list]:
    """`toolkitId -> normalized skill rows` for every *executable* toolkit in the
    v2 catalog (packs are excluded: they are a separate source). Reads persisted
    store rows / shipped manifests only — never connects an MCP server."""

    if catalog is None:
        from unchain_adapter import get_toolkit_catalog_v2

        catalog = get_toolkit_catalog_v2()
    rows_by_id: Dict[str, list] = {}
    for entry in (catalog or {}).get("toolkits") or ():
        if not isinstance(entry, dict):
            continue
        toolkit_id = str(entry.get("toolkitId") or "").strip()
        if not toolkit_id or toolkit_id.startswith(SKILL_PACK_ID_PREFIX):
            continue
        rows_by_id[toolkit_id] = normalize_skill_rows(entry.get("skills"))
    return rows_by_id


def embedded_skill_descriptors(
    selected_toolkit_ids: Iterable[str],
    *,
    rows_by_toolkit: Dict[str, list] | None = None,
) -> list:
    """Descriptors for the `[[skills]]` of the *selected* executable toolkits.

    This is the single identity rule shared by the command menu, the stale
    check and the run itself: `source="toolkit"`, `source_id=<catalog toolkit
    id as the renderer selects it>`. The runtime attaches the very same
    descriptors to the instantiated toolkits (`attach_embedded_skills`), so
    menu, dispatch validation and activation agree on every identity.
    """

    SkillDescriptor = _skill_descriptor_type()
    if rows_by_toolkit is None:
        rows_by_toolkit = catalog_skill_rows_by_toolkit()
    descriptors: list = []
    seen: set = set()
    for raw_id in selected_toolkit_ids or ():
        toolkit_id = str(raw_id or "").strip()
        if not toolkit_id or toolkit_id in seen or toolkit_id.startswith(SKILL_PACK_ID_PREFIX):
            continue
        seen.add(toolkit_id)
        for row in rows_by_toolkit.get(toolkit_id, ()):
            descriptors.append(
                SkillDescriptor(
                    str(row["name"]),
                    str(row.get("description") or ""),
                    str(row["body"]),
                    tuple(str(tool) for tool in row.get("tools") or ()),
                    None,
                    model_invocable=bool(row.get("model_invocable", True)),
                    user_invocable=bool(row.get("user_invocable", True)),
                    metadata=dict(row.get("metadata") or {}),
                    aliases=tuple(str(alias) for alias in row.get("aliases") or ()),
                    source="toolkit",
                    source_id=toolkit_id,
                )
            )
    return descriptors


def attach_embedded_skills(toolkit: Any, toolkit_id: str, rows_by_toolkit: Dict[str, list]) -> None:
    """Give an instantiated executable toolkit exactly the descriptors the
    inventory publishes for it (replacing whatever Unchain/MCP attached)."""

    try:
        toolkit.skills = tuple(embedded_skill_descriptors([toolkit_id], rows_by_toolkit=rows_by_toolkit))
    except (AttributeError, TypeError):
        return


def build_skills_config(
    *,
    workspace_root: str | None,
    include_user_dirs: bool = True,
    extra_skills: Sequence[Any] = (),
):
    """`SkillsConfig` for one run/inventory lookup.

    With no workspace the project roots are skipped entirely (never the
    sidecar's cwd); user directories follow the `skills.include_user_dirs`
    setting (default on).
    """

    from unchain.skills import SkillsConfig

    normalized_root = str(workspace_root or "").strip() or None
    return SkillsConfig(
        project_root=normalized_root,
        include_project_dirs=normalized_root is not None,
        include_user_dirs=bool(include_user_dirs),
        reserved_commands=RESERVED_COMMANDS,
        extra_skills=tuple(extra_skills),
    )


def skills_options(options: Dict[str, Any] | None) -> tuple[bool, str | None]:
    """`(include_user_dirs, skill_inventory_revision)` from renderer options.

    Missing or malformed values fall back to the defaults (user dirs on, no
    revision check) rather than failing the turn; the CLOSED request schema
    is enforced elsewhere.
    """

    include_user_dirs = True
    revision: str | None = None
    if isinstance(options, dict):
        skills = options.get("skills")
        if isinstance(skills, dict) and isinstance(skills.get("include_user_dirs"), bool):
            include_user_dirs = skills["include_user_dirs"]
        raw_revision = options.get("skill_inventory_revision")
        if isinstance(raw_revision, str) and raw_revision.strip():
            revision = raw_revision.strip()
    return include_user_dirs, revision


def resolve_skill_inventory(
    *,
    workspace_root: str | None,
    include_user_dirs: bool = True,
    selected_toolkit_ids: Iterable[str] = (),
    packs: Iterable[Dict[str, Any]] | None = None,
    rows_by_toolkit: Dict[str, list] | None = None,
    data_dir: Any = None,
):
    """Resolve the effective inventory for one workspace + toolkit selection —
    exactly what a run with that selection will see (`unchain.skills.SkillInventory`)."""

    from unchain.skills import SkillRegistry
    from unchain.tools import Toolkit

    if packs is None:
        packs = list_installed_skill_packs(data_dir)
    config = build_skills_config(
        workspace_root=workspace_root,
        include_user_dirs=include_user_dirs,
        extra_skills=tuple(pack_skill_descriptors(packs)),
    )
    embedded = embedded_skill_descriptors(selected_toolkit_ids, rows_by_toolkit=rows_by_toolkit)
    return SkillRegistry(config, runtime_toolkit=Toolkit(skills=tuple(embedded))).list()


def inventory_payload(inventory: Any) -> Dict[str, Any]:
    """Project a `SkillInventory` onto the CLOSED `pupu.skill_inventory.v1` schema."""

    reserved = {name.casefold() for name in RESERVED_COMMANDS}
    skills: List[Dict[str, Any]] = []
    for summary in sorted(inventory.skills, key=lambda item: item.name):
        entry = {
            "id": summary.identity.key,
            "name": summary.name,
            "description": summary.description,
            "source": summary.source,
            "source_id": summary.source_id,
            "aliases": [str(alias) for alias in summary.aliases],
            "model_invocable": bool(summary.model_invocable),
            "user_invocable": bool(summary.user_invocable),
            "reserved": summary.name.casefold() in reserved,
        }
        assert tuple(entry) == _INVENTORY_ENTRY_KEYS
        skills.append(entry)
    diagnostics = [
        {key: str(getattr(item, key)) for key in _DIAGNOSTIC_KEYS}
        for item in inventory.diagnostics
    ]
    return {
        "schema": INVENTORY_SCHEMA,
        "revision": str(inventory.revision),
        "skills": skills,
        "diagnostics": diagnostics,
    }


__all__ = [
    "INVENTORY_SCHEMA",
    "attach_embedded_skills",
    "catalog_skill_rows_by_toolkit",
    "embedded_skill_descriptors",
    "RESERVED_COMMANDS",
    "SKILLPACK_SOURCE",
    "build_skills_config",
    "installed_pack_skill_descriptors",
    "inventory_payload",
    "pack_skill_descriptors",
    "resolve_skill_inventory",
    "selected_toolkit_skill_descriptors",
    "skills_options",
]
