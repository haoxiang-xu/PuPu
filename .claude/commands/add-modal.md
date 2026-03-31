# Add a New Modal

Create a new modal dialog following PuPu's modal standard.

## Arguments
- $ARGUMENTS: Modal name and description (e.g. "export_chat Chat export format selection dialog")

## Steps

1. Read `.github/skills/modal-standard.md` for the modal pattern
2. Read `src/BUILTIN_COMPONENTs/modal/` for the base modal component

3. Create the modal component:
   ```
   src/COMPONENTs/<feature>/<name>_modal.js
   ```

4. Follow the standard pattern:
   ```js
   import { useContext } from "react";
   import { ConfigContext } from "../../CONTAINERs/config/context";

   const MyModal = ({ isOpen, onClose, onConfirm }) => {
     const { isDark } = useContext(ConfigContext);

     if (!isOpen) return null;

     return (
       <div style={{
         position: "fixed", inset: 0,
         display: "flex", alignItems: "center", justifyContent: "center",
         backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000,
       }}
         onClick={onClose}
       >
         <div style={{
           backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
           borderRadius: 12, padding: 24,
           minWidth: 400, maxWidth: 600,
         }}
           onClick={(e) => e.stopPropagation()}
         >
           {/* Header */}
           {/* Body */}
           {/* Footer with action buttons */}
         </div>
       </div>
     );
   };
   ```

5. Manage open/close state in the parent via `useState`:
   ```js
   const [showModal, setShowModal] = useState(false);
   ```

6. Use inline styles with isDark — no CSS files
7. Write a test for the modal
