# Evidence

### E-0001 | strict consumer positive run
- **source type**: 自证类
- **locator**: fixture://real-producer-consumer/positive
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-001
- **decision link**: P-0000-0001-2026-0812#AC-001
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://positive | frozen pair | 2026-08-12T13:00:00Z | sha256:0101010101010101010101010101010101010101010101010101010101010101 | full output

### E-0002 | strict consumer negative run
- **source type**: 自证类
- **locator**: fixture://real-producer-consumer/unknown-field
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-002
- **decision link**: P-0000-0001-2026-0812#AC-002
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://negative | frozen pair | 2026-08-12T13:00:00Z | sha256:0202020202020202020202020202020202020202020202020202020202020202 | full output

### E-0003 | first-use sequence
- **source type**: 自证类
- **locator**: fixture://sequence/first-use
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-003
- **decision link**: P-0000-0001-2026-0812#AC-003
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://first-use | frozen pair | 2026-08-12T13:00:00Z | sha256:0303030303030303030303030303030303030303030303030303030303030303 | full output

### E-0004 | repeat sequence
- **source type**: 自证类
- **locator**: fixture://sequence/repeat
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-004
- **decision link**: P-0000-0001-2026-0812#AC-004
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://repeat | frozen pair | 2026-08-12T13:00:00Z | sha256:0404040404040404040404040404040404040404040404040404040404040404 | full output

### E-0005 | retry and resume sequence
- **source type**: 自证类
- **locator**: fixture://sequence/retry-resume
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-005
- **decision link**: P-0000-0001-2026-0812#AC-005
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://retry-resume | frozen pair | 2026-08-12T13:00:00Z | sha256:0505050505050505050505050505050505050505050505050505050505050505 | full output

### E-0006 | cold restart sequence
- **source type**: 自证类
- **locator**: fixture://sequence/cold-restart
- **acquisition**: frozen revision pair execution
- **submission source**: AT-001
- **supports/refutes**: AC-006
- **decision link**: P-0000-0001-2026-0812#AC-006
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://cold-restart | frozen pair | 2026-08-12T13:00:00Z | sha256:0606060606060606060606060606060606060606060606060606060606060606 | full output

### E-0007 | deployed boundary revision observation
- **source type**: 自证类
- **locator**: fixture://deployment/boundary-revisions
- **acquisition**: producer and consumer runtime identity endpoint observation
- **submission source**: AT-001
- **supports/refutes**: boundary revision set
- **decision link**: P-0000-0001-2026-0812#PS-001
- **limitations**: conformance fixture only
- **stable slices**: ES-001 | fixture://revisions | sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222 | 2026-08-12T13:00:00Z | sha256:0707070707070707070707070707070707070707070707070707070707070707 | producer+consumer identity response
