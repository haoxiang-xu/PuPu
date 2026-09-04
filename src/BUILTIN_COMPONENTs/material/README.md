# material

Cross-component **surface-treatment** selector — `plain` (line-minimal default), `glass`
(frosted), and whatever else a component chooses to support. Deliberately SEPARATE from the
color `theme` system.

## Public API (three names)

- **`MaterialProvider`** — sets the material for a subtree. Explicit `material` prop sets the
  value; a bare provider (no prop) inherits the parent's value; a nested inner provider
  overrides an outer one.
- **`useMaterial()`** — reads the current subtree material. Defaults to `"plain"`.
- **`resolveComponentMaterial(requested, supportedMap, fallback)`** — pure resolver: returns
  `requested` if the component's `supportedMap` has it, otherwise the component's own
  `fallback`.

## Rules

- **Priority: explicit `material` prop > context material > component's own default.** An
  explicit prop always overrides context.
- **Unsupported → own default.** A component that doesn't implement the requested material
  renders its own default treatment — never the context value, never an error, never blank.
  (Button is plain-only; under `material="glass"` it renders plain.)
- **Open vocabulary, per component.** There is no fixed enum. switch/menu support
  `plain | glass`; toast supports `solid | outline | frosted`.

## theme vs material

- **theme** (`ConfigContext`, `theme_seed.js`) supplies **color / dark tokens** — which colors
  a surface uses.
- **material** selects the component **implementation / treatment**. A glass impl reads theme
  color tokens for color but owns its own blur/frosting locally. Do NOT add blur/material
  tokens to the theme.

## Adoption (dispatcher-map)

```js
const contextMaterial = useMaterial();
const requested = material !== undefined ? material : contextMaterial;
const resolved = resolveComponentMaterial(requested, COMPONENT_MATERIALS, COMPONENT_DEFAULT_MATERIAL);
const Impl = COMPONENT_MATERIALS[resolved];
return <Impl {...props} />;
```
