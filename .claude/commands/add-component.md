# Add a New Component

Create a new domain feature component in the PuPu project.

## Arguments
- $ARGUMENTS: Component name and description (e.g. "voice-input Voice recording and transcription input widget")

## Steps

1. Read `.github/skills/project-conventions-and-build.md` for naming and structure conventions
2. Determine the correct location:
   - **Domain feature** → `src/COMPONENTs/<kebab-case-name>/`
   - **Reusable primitive** → `src/BUILTIN_COMPONENTs/<kebab-case-name>/`

3. Create the component directory and files:
   ```
   src/COMPONENTs/<name>/
     <name>.js          — Main component (PascalCase export)
     <name>.test.js     — Tests
     hooks/             — Custom hooks (if complex logic)
     components/        — Sub-components (if needed)
     utils/             — Helpers (if needed)
   ```

4. Follow these rules:
   - **JavaScript only** — no TypeScript
   - **Inline styles** with `isDark` from ConfigContext:
     ```js
     import { useContext } from "react";
     import { ConfigContext } from "../../CONTAINERs/config/context";

     const MyComponent = ({ onAction }) => {
       const { isDark } = useContext(ConfigContext);
       return (
         <div style={{ backgroundColor: isDark ? "#1e1e1e" : "#fff" }}>
           ...
         </div>
       );
     };
     ```
   - **Function components only** — no class components
   - **No PropTypes** — use typeof guards if needed
   - **Callback props** use `on` prefix: `onSend`, `onClose`

5. If the component needs state management, extract logic into a `hooks/use_<name>.js` custom hook
6. Write a basic test using `@testing-library/react`
7. Show where to import and use the component
