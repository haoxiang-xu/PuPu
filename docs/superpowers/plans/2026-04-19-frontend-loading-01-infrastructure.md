# Frontend Loading & Decoupling — Phase 1+2: Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立前端统一的 pending/loading/error 反馈基础设施（6 个原子 + 2 个 hook），为后续 Phase 的 45 处交互迁移铺路。

**Architecture:** 两条 bus（toast_bus、progress_bus）作为全局事件总线 + 4 个订阅组件（ToastHost、TopProgressBar、SuspenseFallback、SpinnerButton）+ 2 个业务 hook（useAsyncAction、useOptimisticUpdate）。本 Phase **只新增文件，不改业务代码**（除 App 根挂载 host）。

**Tech Stack:** React 19、jest + @testing-library/react、无 TypeScript、内联样式 + ConfigContext.isDark

**Spec:** `docs/superpowers/specs/2026-04-19-frontend-loading-decoupling-design.md`

---

## File Structure

**新增：**
- `src/SERVICEs/toast_bus.js` + `.test.js` — 事件总线
- `src/SERVICEs/toast.js` — toast API（`success/error/info`）
- `src/SERVICEs/progress_bus.js` + `.test.js` — progress 事件总线
- `src/BUILTIN_COMPONENTs/toast/toast_host.js` + `.test.js` — toast 渲染容器
- `src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js` + `.test.js` — 顶部 2px 进度条
- `src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js` — lazy modal 的 Suspense fallback
- `src/BUILTIN_COMPONENTs/input/spinner_button.js` + `.test.js` — 带 pending 态的 button
- `src/BUILTIN_COMPONENTs/mini_react/use_async_action.js` + `.test.js` — async action hook
- `src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js` + `.test.js` — 乐观更新 hook

**修改：**
- `src/App.js:18-36` — 挂载 `<ToastHost />` 和 `<TopProgressBar />`

---

## Task 1: toast_bus

建一个极简事件 bus：`subscribe(fn)` 返回 unsubscribe；`emit(event)` 同步通知所有 subscriber；单例模块。

**Files:**
- Create: `src/SERVICEs/toast_bus.js`
- Test: `src/SERVICEs/toast_bus.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/SERVICEs/toast_bus.test.js
import { subscribe, emit, _resetForTest } from "./toast_bus";

describe("toast_bus", () => {
  beforeEach(() => _resetForTest());

  test("emit 触发所有 subscriber", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    subscribe(fn1);
    subscribe(fn2);
    emit({ type: "success", message: "hi" });
    expect(fn1).toHaveBeenCalledWith({ type: "success", message: "hi" });
    expect(fn2).toHaveBeenCalledWith({ type: "success", message: "hi" });
  });

  test("unsubscribe 停止接收", () => {
    const fn = jest.fn();
    const unsubscribe = subscribe(fn);
    unsubscribe();
    emit({ type: "info", message: "x" });
    expect(fn).not.toHaveBeenCalled();
  });

  test("一个 subscriber 抛错不影响其他", () => {
    const good = jest.fn();
    subscribe(() => { throw new Error("boom"); });
    subscribe(good);
    expect(() => emit({ type: "info", message: "x" })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/toast_bus.test.js`
Expected: FAIL — "Cannot find module './toast_bus'"

- [ ] **Step 3: Implement toast_bus**

```js
// src/SERVICEs/toast_bus.js
const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function emit(event) {
  for (const fn of subscribers) {
    try { fn(event); } catch (e) { console.error("[toast_bus] subscriber threw:", e); }
  }
}

export function _resetForTest() {
  subscribers.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/toast_bus.test.js`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/SERVICEs/toast_bus.js src/SERVICEs/toast_bus.test.js
git commit -m "feat(toast): add toast_bus event dispatch"
```

---

## Task 2: toast API

在 toast_bus 之上封装 `toast.success/error/info` API，生成 unique id，支持 `duration` 覆盖。

**Files:**
- Create: `src/SERVICEs/toast.js`

- [ ] **Step 1: Implement toast API**

```js
// src/SERVICEs/toast.js
import { emit } from "./toast_bus";

let nextId = 1;

function fire(type, message, options = {}) {
  const id = `toast-${nextId++}`;
  emit({
    kind: "show",
    id,
    type,
    message,
    duration: options.duration ?? 4000,
    dedupeKey: options.dedupeKey ?? `${type}:${message}`,
  });
  return id;
}

export const toast = {
  success: (message, options) => fire("success", message, options),
  error:   (message, options) => fire("error", message, options),
  info:    (message, options) => fire("info", message, options),
  dismiss: (id) => emit({ kind: "dismiss", id }),
};
```

- [ ] **Step 2: Sanity-check by eye**

这个文件没单独测试（逻辑极薄，会在 ToastHost 集成测试里覆盖）。Read 检查 import/export 正确。

- [ ] **Step 3: Commit**

```bash
git add src/SERVICEs/toast.js
git commit -m "feat(toast): add toast.success/error/info API"
```

---

## Task 3: ToastHost

挂在根的 React 组件：订阅 toast_bus，维护一个 toast stack，右下角渲染，自动消失，支持点击关闭；去重（同 dedupeKey 2s 内只保留一条）。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/toast/toast_host.js`
- Test: `src/BUILTIN_COMPONENTs/toast/toast_host.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/BUILTIN_COMPONENTs/toast/toast_host.test.js
import { render, screen, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ToastHost from "./toast_host";
import { toast } from "../../SERVICEs/toast";
import { _resetForTest } from "../../SERVICEs/toast_bus";

function renderHost() {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <ToastHost />
    </ConfigContext.Provider>
  );
}

describe("ToastHost", () => {
  beforeEach(() => _resetForTest());

  test("显示 success toast", () => {
    renderHost();
    act(() => { toast.success("done"); });
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  test("4s 后自动消失", () => {
    jest.useFakeTimers();
    renderHost();
    act(() => { toast.success("done"); });
    expect(screen.queryByText("done")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(4100); });
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test("同 dedupeKey 2s 内只保留一条", () => {
    renderHost();
    act(() => {
      toast.error("boom");
      toast.error("boom");
    });
    expect(screen.getAllByText("boom")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/BUILTIN_COMPONENTs/toast/toast_host.test.js`
Expected: FAIL — "Cannot find module './toast_host'"

- [ ] **Step 3: Implement ToastHost**

```js
// src/BUILTIN_COMPONENTs/toast/toast_host.js
import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { subscribe } from "../../SERVICEs/toast_bus";

const DEDUPE_WINDOW_MS = 2000;

export default function ToastHost() {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [items, setItems] = useState([]);
  const dedupeRef = useRef(new Map());
  const timersRef = useRef(new Map());

  useEffect(() => {
    const unsub = subscribe((event) => {
      if (event.kind === "dismiss") {
        setItems((prev) => prev.filter((it) => it.id !== event.id));
        const t = timersRef.current.get(event.id);
        if (t) { clearTimeout(t); timersRef.current.delete(event.id); }
        return;
      }
      if (event.kind !== "show") return;
      const now = Date.now();
      const last = dedupeRef.current.get(event.dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      dedupeRef.current.set(event.dedupeKey, now);
      setItems((prev) => [...prev, event]);
      const t = setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== event.id));
        timersRef.current.delete(event.id);
      }, event.duration);
      timersRef.current.set(event.id, t);
    });
    return () => {
      unsub();
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {items.map((item) => {
        const borderColor = item.type === "error"
          ? (isDark ? "#c04a4a" : "#cc3333")
          : item.type === "success"
            ? (isDark ? "#4aa84a" : "#339933")
            : (isDark ? "#555" : "#ccc");
        return (
          <div key={item.id}
            onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
            style={{
              padding: "8px 12px",
              border: `1px solid ${borderColor}`,
              color: isDark ? "#eee" : "#222",
              background: isDark ? "#1e1e1e" : "#fff",
              fontSize: 13, cursor: "pointer", pointerEvents: "auto",
              minWidth: 180, maxWidth: 360,
            }}>
            {item.message}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/BUILTIN_COMPONENTs/toast/toast_host.test.js`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/toast/toast_host.js src/BUILTIN_COMPONENTs/toast/toast_host.test.js
git commit -m "feat(toast): add ToastHost with dedupe and auto-dismiss"
```

---

## Task 4: progress_bus

与 toast_bus 同构，但维护 active action 的 Map：`start(id, label)`、`stop(id)`、`getActive()`。

**Files:**
- Create: `src/SERVICEs/progress_bus.js`
- Test: `src/SERVICEs/progress_bus.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/SERVICEs/progress_bus.test.js
import { subscribe, start, stop, getActive, _resetForTest } from "./progress_bus";

describe("progress_bus", () => {
  beforeEach(() => _resetForTest());

  test("start/stop 更新 active count", () => {
    start("a", "Sending");
    expect(getActive().count).toBe(1);
    start("b", "Installing");
    expect(getActive().count).toBe(2);
    stop("a");
    expect(getActive().count).toBe(1);
    stop("b");
    expect(getActive().count).toBe(0);
  });

  test("subscriber 收到 change", () => {
    const fn = jest.fn();
    subscribe(fn);
    start("a", "X");
    stop("a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("stop 未知 id 不崩", () => {
    expect(() => stop("never-started")).not.toThrow();
  });

  test("labels 包含所有 active label", () => {
    start("a", "Save");
    start("b", "Upload");
    expect(getActive().labels).toEqual(expect.arrayContaining(["Save", "Upload"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/progress_bus.test.js`
Expected: FAIL — "Cannot find module './progress_bus'"

- [ ] **Step 3: Implement progress_bus**

```js
// src/SERVICEs/progress_bus.js
const actives = new Map();  // id -> label
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn(getActive()); } catch (e) { console.error("[progress_bus]", e); }
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function start(id, label) {
  actives.set(id, label);
  notify();
}

export function stop(id) {
  if (!actives.has(id)) return;
  actives.delete(id);
  notify();
}

export function getActive() {
  return { count: actives.size, labels: Array.from(actives.values()) };
}

export function _resetForTest() {
  actives.clear();
  subscribers.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/progress_bus.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/SERVICEs/progress_bus.js src/SERVICEs/progress_bus.test.js
git commit -m "feat(progress): add progress_bus for global loading indicator"
```

---

## Task 5: TopProgressBar

订阅 progress_bus，`count > 0` 时显示顶部 2px 条（宽度 0→80% 渐进，stop 后 100% 再淡出 200ms）。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js`
- Test: `src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.test.js
import { render, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TopProgressBar from "./top_progress_bar";
import { start, stop, _resetForTest } from "../../SERVICEs/progress_bus";

function renderBar() {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <TopProgressBar />
    </ConfigContext.Provider>
  );
}

describe("TopProgressBar", () => {
  beforeEach(() => _resetForTest());

  test("空 active 时不渲染 bar", () => {
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="top-progress-bar"]')).toBeNull();
  });

  test("start 后渲染 bar", () => {
    const { container } = renderBar();
    act(() => { start("a", "Sending"); });
    expect(container.querySelector('[data-testid="top-progress-bar"]')).not.toBeNull();
  });

  test("最后一个 stop 后 bar 进入 fade-out", () => {
    jest.useFakeTimers();
    const { container } = renderBar();
    act(() => { start("a", "X"); });
    act(() => { stop("a"); });
    // 100% + fade 200ms
    act(() => { jest.advanceTimersByTime(250); });
    expect(container.querySelector('[data-testid="top-progress-bar"]')).toBeNull();
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.test.js`
Expected: FAIL — "Cannot find module './top_progress_bar'"

- [ ] **Step 3: Implement TopProgressBar**

```js
// src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js
import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { subscribe } from "../../SERVICEs/progress_bus";

export default function TopProgressBar() {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [phase, setPhase] = useState("idle"); // idle | running | finishing
  const [widthPct, setWidthPct] = useState(0);
  const finishTimerRef = useRef(null);

  useEffect(() => {
    const unsub = subscribe(({ count }) => {
      if (finishTimerRef.current) { clearTimeout(finishTimerRef.current); finishTimerRef.current = null; }
      if (count > 0) {
        setPhase("running");
        setWidthPct(0);
        requestAnimationFrame(() => setWidthPct(80));
      } else {
        setPhase("finishing");
        setWidthPct(100);
        finishTimerRef.current = setTimeout(() => {
          setPhase("idle");
          setWidthPct(0);
        }, 200);
      }
    });
    return () => {
      unsub();
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (phase === "idle") return null;

  return (
    <div data-testid="top-progress-bar" style={{
      position: "fixed", top: 0, left: 0,
      height: 2, width: `${widthPct}%`,
      background: isDark ? "#4a9fd4" : "#2a7fc4",
      zIndex: 10000,
      transition: "width 400ms ease-out, opacity 200ms ease-out",
      opacity: phase === "finishing" ? 0 : 1,
      pointerEvents: "none",
    }} />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.test.js`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.js src/BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar.test.js
git commit -m "feat(progress): add TopProgressBar with phase animation"
```

---

## Task 6: SuspenseFallback

极简 ArcSpinner 居中容器。无 state、无 effect、纯展示组件。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js`

- [ ] **Step 1: Implement SuspenseFallback**

```js
// src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js
import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../spinner/arc_spinner";

export default function SuspenseFallback({ minHeight = 120 }) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight, width: "100%",
    }}>
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
}
```

- [ ] **Step 2: Sanity-check by eye**

Read 文件确认 import path 和 props 对。不单独测（渲染 ArcSpinner，逻辑极薄）。

- [ ] **Step 3: Commit**

```bash
git add src/BUILTIN_COMPONENTs/suspense/suspense_fallback.js
git commit -m "feat(suspense): add SuspenseFallback for lazy modals"
```

---

## Task 7: SpinnerButton

Button 带 pending 态：pending=true 时替换内容为居中 ArcSpinner，`min-width` 锁尺寸（mount 时 measure），`cursor: wait`，swallow 重复点击。onClick 返回 Promise 时自动进入 pending。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/input/spinner_button.js`
- Test: `src/BUILTIN_COMPONENTs/input/spinner_button.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/BUILTIN_COMPONENTs/input/spinner_button.test.js
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import SpinnerButton from "./spinner_button";

function renderBtn(props) {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <SpinnerButton {...props}>Send</SpinnerButton>
    </ConfigContext.Provider>
  );
}

describe("SpinnerButton", () => {
  test("pending=false 显示 children 文字", () => {
    renderBtn({ pending: false, onClick: () => {} });
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  test("pending=true 不显示 children 文字", () => {
    renderBtn({ pending: true, onClick: () => {} });
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
  });

  test("pending=true 时 onClick 被 swallow", () => {
    const onClick = jest.fn();
    renderBtn({ pending: true, onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("disabled=true 时 onClick 被 swallow", () => {
    const onClick = jest.fn();
    renderBtn({ disabled: true, onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("onClick 返回 Promise 时自动 pending", async () => {
    let resolveFn;
    const onClick = () => new Promise((r) => { resolveFn = r; });
    renderBtn({ onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
    await act(async () => { resolveFn(); });
    expect(screen.getByText("Send")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/BUILTIN_COMPONENTs/input/spinner_button.test.js`
Expected: FAIL — "Cannot find module './spinner_button'"

- [ ] **Step 3: Implement SpinnerButton**

```js
// src/BUILTIN_COMPONENTs/input/spinner_button.js
import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../spinner/arc_spinner";

export default function SpinnerButton({
  pending: pendingProp,
  disabled,
  onClick,
  children,
  spinnerSize = 14,
  style,
  ...rest
}) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [autoPending, setAutoPending] = useState(false);
  const [minWidth, setMinWidth] = useState(null);
  const btnRef = useRef(null);

  const pending = pendingProp || autoPending;
  const blocked = pending || disabled;

  useEffect(() => {
    if (btnRef.current && minWidth == null) {
      setMinWidth(btnRef.current.offsetWidth);
    }
  }, [minWidth, children]);

  const handleClick = (e) => {
    if (blocked) { e.preventDefault(); return; }
    const result = onClick?.(e);
    if (result && typeof result.then === "function") {
      setAutoPending(true);
      result.finally(() => setAutoPending(false));
    }
  };

  return (
    <button ref={btnRef} onClick={handleClick} disabled={blocked} style={{
      minWidth: minWidth ?? undefined,
      opacity: disabled ? 0.4 : 1,
      cursor: pending ? "wait" : (disabled ? "not-allowed" : "pointer"),
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      ...style,
    }} {...rest}>
      {pending
        ? <ArcSpinner size={spinnerSize} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
        : children}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/BUILTIN_COMPONENTs/input/spinner_button.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/input/spinner_button.js src/BUILTIN_COMPONENTs/input/spinner_button.test.js
git commit -m "feat(button): add SpinnerButton with auto pending from Promise"
```

---

## Task 8: useAsyncAction hook

封装 async action：`pendingDelayMs` 防闪烁、`progressThresholdMs` 激活顶部 bar、防重复点击、默认 toast 错误、unmount abort。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_async_action.js`
- Test: `src/BUILTIN_COMPONENTs/mini_react/use_async_action.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/BUILTIN_COMPONENTs/mini_react/use_async_action.test.js
import { renderHook, act } from "@testing-library/react";
import useAsyncAction from "./use_async_action";
import { subscribe as subToast, _resetForTest as resetToast } from "../../SERVICEs/toast_bus";
import { subscribe as subProgress, _resetForTest as resetProgress, getActive } from "../../SERVICEs/progress_bus";

describe("useAsyncAction", () => {
  beforeEach(() => { resetToast(); resetProgress(); });

  test("成功路径：pending → false → result", async () => {
    const { result } = renderHook(() => useAsyncAction(async () => "ok", { label: "test", pendingDelayMs: 0 }));
    await act(async () => {
      const r = await result.current.run();
      expect(r).toBe("ok");
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test("pendingDelayMs 内完成不切 pending=true", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAsyncAction(async () => "fast", { label: "test", pendingDelayMs: 200 }));
    let runPromise;
    act(() => { runPromise = result.current.run(); });
    expect(result.current.pending).toBe(false);
    await act(async () => { await runPromise; });
    expect(result.current.pending).toBe(false);
    jest.useRealTimers();
  });

  test("超过 pendingDelayMs 切 pending=true", async () => {
    jest.useFakeTimers();
    let resolveFn;
    const action = () => new Promise((r) => { resolveFn = r; });
    const { result } = renderHook(() => useAsyncAction(action, { label: "test", pendingDelayMs: 100 }));
    act(() => { result.current.run(); });
    act(() => { jest.advanceTimersByTime(150); });
    expect(result.current.pending).toBe(true);
    await act(async () => { resolveFn("done"); });
    expect(result.current.pending).toBe(false);
    jest.useRealTimers();
  });

  test("超过 progressThresholdMs 激活顶部 bar", async () => {
    jest.useFakeTimers();
    let resolveFn;
    const action = () => new Promise((r) => { resolveFn = r; });
    const { result } = renderHook(() =>
      useAsyncAction(action, { label: "test", pendingDelayMs: 0, progressThresholdMs: 300 }));
    act(() => { result.current.run(); });
    expect(getActive().count).toBe(0);
    act(() => { jest.advanceTimersByTime(400); });
    expect(getActive().count).toBe(1);
    await act(async () => { resolveFn(); });
    expect(getActive().count).toBe(0);
    jest.useRealTimers();
  });

  test("错误默认 emit toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("boom"); }, { label: "验证", pendingDelayMs: 0 }));
    await act(async () => { await result.current.run(); });
    expect(events.some((e) => e.type === "error" && e.message.includes("boom"))).toBe(true);
    expect(result.current.error.message).toBe("boom");
  });

  test("running 期间 run() 被忽略", async () => {
    const fn = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useAsyncAction(fn, { label: "x", pendingDelayMs: 0 }));
    act(() => { result.current.run(); });
    act(() => { result.current.run(); });
    act(() => { result.current.run(); });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("onError 覆盖默认 toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("b"); }, { label: "x", pendingDelayMs: 0, onError }));
    await act(async () => { await result.current.run(); });
    expect(onError).toHaveBeenCalled();
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  test("AbortError 不 toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const { result, unmount } = renderHook(() =>
      useAsyncAction(async (_, { signal }) => {
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }, { label: "x", pendingDelayMs: 0 }));
    act(() => { result.current.run(); });
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);
  });

  test("reset 清 error", async () => {
    const { result } = renderHook(() =>
      useAsyncAction(async () => { throw new Error("b"); }, { label: "x", pendingDelayMs: 0 }));
    await act(async () => { await result.current.run(); });
    expect(result.current.error).not.toBe(null);
    act(() => { result.current.reset(); });
    expect(result.current.error).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/BUILTIN_COMPONENTs/mini_react/use_async_action.test.js`
Expected: FAIL — "Cannot find module './use_async_action'"

- [ ] **Step 3: Implement useAsyncAction**

```js
// src/BUILTIN_COMPONENTs/mini_react/use_async_action.js
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../SERVICEs/toast";
import { start as progressStart, stop as progressStop } from "../../SERVICEs/progress_bus";

let nextInstanceId = 1;

function isAbort(err) {
  return err && (err.name === "AbortError" || err.code === "ABORT_ERR");
}

export default function useAsyncAction(action, options = {}) {
  const {
    label = "action",
    pendingDelayMs = 200,
    progressThresholdMs = 300,
    onError,
    onSuccess,
  } = options;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const runningRef = useRef(false);
  const abortRef = useRef(null);
  const pendingTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const progressIdRef = useRef(null);
  const idRef = useRef(`async-${nextInstanceId++}`);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (abortRef.current) abortRef.current.abort();
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    if (progressIdRef.current) progressStop(progressIdRef.current);
  }, []);

  const cleanup = useCallback(() => {
    if (pendingTimerRef.current) { clearTimeout(pendingTimerRef.current); pendingTimerRef.current = null; }
    if (progressTimerRef.current) { clearTimeout(progressTimerRef.current); progressTimerRef.current = null; }
    if (progressIdRef.current) { progressStop(progressIdRef.current); progressIdRef.current = null; }
  }, []);

  const run = useCallback(async (...args) => {
    if (runningRef.current) return undefined;
    runningRef.current = true;
    setError(null);

    const ac = new AbortController();
    abortRef.current = ac;

    pendingTimerRef.current = setTimeout(() => {
      if (mountedRef.current && runningRef.current) setPending(true);
    }, pendingDelayMs);

    progressTimerRef.current = setTimeout(() => {
      if (runningRef.current) {
        const pid = `${idRef.current}-${Date.now()}`;
        progressIdRef.current = pid;
        progressStart(pid, label);
      }
    }, progressThresholdMs);

    try {
      const result = await action(...args, { signal: ac.signal });
      cleanup();
      runningRef.current = false;
      if (mountedRef.current) setPending(false);
      if (onSuccess) onSuccess(result);
      return result;
    } catch (err) {
      cleanup();
      runningRef.current = false;
      if (mountedRef.current) { setPending(false); setError(err); }
      if (isAbort(err)) return undefined;
      if (onError) onError(err);
      else toast.error(`${label}: ${err?.message || "失败"}`);
      return undefined;
    }
  }, [action, label, pendingDelayMs, progressThresholdMs, onError, onSuccess, cleanup]);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/BUILTIN_COMPONENTs/mini_react/use_async_action.test.js`
Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/mini_react/use_async_action.js src/BUILTIN_COMPONENTs/mini_react/use_async_action.test.js
git commit -m "feat(hooks): add useAsyncAction with pending delay and progress"
```

---

## Task 9: useOptimisticUpdate hook

乐观更新 hook：`optimistic()` 同步跑、`commit()` microtask 排队、失败走 rollback + toast；可选 `guard()` 保护 race。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js`
- Test: `src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.test.js
import { renderHook, act } from "@testing-library/react";
import useOptimisticUpdate from "./use_optimistic_update";
import { subscribe as subToast, _resetForTest as resetToast } from "../../SERVICEs/toast_bus";

describe("useOptimisticUpdate", () => {
  beforeEach(() => resetToast());

  test("optimistic 立即跑、commit 成功不 rollback", async () => {
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.resolve());
    const rollback = jest.fn();
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, label: "test" });
    });
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  test("commit 失败触发 rollback + toast", async () => {
    const events = [];
    subToast((e) => events.push(e));
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.reject(new Error("net")));
    const rollback = jest.fn();
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, label: "重命名" });
    });
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "error" && e.message.includes("重命名"))).toBe(true);
  });

  test("guard 返回 false 跳过 rollback", async () => {
    const optimistic = jest.fn();
    const commit = jest.fn(() => Promise.reject(new Error("x")));
    const rollback = jest.fn();
    const guard = jest.fn(() => false);
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await result.current.apply({ optimistic, commit, rollback, guard, label: "test" });
    });
    expect(rollback).not.toHaveBeenCalled();
  });

  test("optimistic 是同步的（先于 commit）", async () => {
    const order = [];
    const optimistic = () => order.push("optimistic");
    const commit = () => { order.push("commit"); return Promise.resolve(); };
    const { result } = renderHook(() => useOptimisticUpdate());
    act(() => { result.current.apply({ optimistic, commit, rollback: () => {}, label: "x" }); });
    expect(order).toEqual(["optimistic"]);
    await act(async () => { await Promise.resolve(); });
    expect(order).toEqual(["optimistic", "commit"]);
  });

  test("rollback 抛错被 swallow", async () => {
    const optimistic = jest.fn();
    const commit = () => Promise.reject(new Error("a"));
    const rollback = () => { throw new Error("rollback boom"); };
    const { result } = renderHook(() => useOptimisticUpdate());
    await act(async () => {
      await expect(result.current.apply({ optimistic, commit, rollback, label: "x" })).resolves.not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.test.js`
Expected: FAIL — "Cannot find module './use_optimistic_update'"

- [ ] **Step 3: Implement useOptimisticUpdate**

```js
// src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js
import { useCallback } from "react";
import { toast } from "../../SERVICEs/toast";

export default function useOptimisticUpdate() {
  const apply = useCallback(async ({ optimistic, commit, rollback, guard, label = "操作" }) => {
    try { optimistic(); } catch (e) { console.error("[optimistic] threw:", e); return; }
    await new Promise((r) => queueMicrotask(r));
    try {
      await commit();
    } catch (err) {
      const shouldRollback = guard ? !!guard() : true;
      if (shouldRollback) {
        try { rollback(err); } catch (e) { console.error("[rollback] threw:", e); }
      }
      toast.error(`${label}: ${err?.message || "失败"}`);
    }
  }, []);

  return { apply };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.js src/BUILTIN_COMPONENTs/mini_react/use_optimistic_update.test.js
git commit -m "feat(hooks): add useOptimisticUpdate with rollback + guard"
```

---

## Task 10: Mount ToastHost + TopProgressBar in App

把两个全局组件挂到 `App.js`。放在 `<ConfigContainer>` 内、`<Router>` 同级，这样 ConfigContext 已就绪。

**Files:**
- Modify: `src/App.js:18-36`

- [ ] **Step 1: Read current App.js**

```bash
cat src/App.js
```

记住当前的 JSX 根结构（`<ConfigContainer>` → `<Router>`）。

- [ ] **Step 2: Run gitnexus impact**

Run: `gitnexus_impact({target: "App", direction: "upstream"})`
Expected: LOW risk（App 是根，没有 upstream caller 影响这次修改）。记录输出。

- [ ] **Step 3: Modify App.js 挂载 host**

在 `<ConfigContainer>` 内、紧邻 `<Router>` 旁边挂两个组件：

```js
// src/App.js
// ... 现有 imports ...
import ToastHost from "./BUILTIN_COMPONENTs/toast/toast_host";
import TopProgressBar from "./BUILTIN_COMPONENTs/top_progress_bar/top_progress_bar";

// 在 ConfigContainer 内、Router 同级：
<ConfigContainer>
  <TopProgressBar />
  <ToastHost />
  <Router>
    {/* existing */}
  </Router>
</ConfigContainer>
```

（具体现有 JSX 以实际 `src/App.js:18-36` 为准；保留现有结构，仅在 ConfigContainer 内插入两行。）

- [ ] **Step 4: 手动验证 import 生效**

Run: `npm start`
Expected:
- App 启动、无 console error
- Chrome DevTools Elements 里能看到 `#root > div > ...`，其中 `ConfigContainer` 内有空的 TopProgressBar（因 count=0 所以不渲染）和 ToastHost

快速 smoke：打开 DevTools Console 运行
```js
require("./SERVICEs/toast").toast.success("hello world");
```
应该看到右下角出现 "hello world" toast，4s 消失。

（如果 require 不行，临时改个 onClick 测一次，验证完回退。）

- [ ] **Step 5: Commit**

```bash
git add src/App.js
git commit -m "feat(app): mount ToastHost and TopProgressBar globally"
```

---

## Task 11: Smoke integration test

一条 end-to-end 测试：`useAsyncAction` 调用失败 → toast.error 出现 → ToastHost 渲染。

**Files:**
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_async_action.integration.test.js`

- [ ] **Step 1: Write the integration test**

```js
// src/BUILTIN_COMPONENTs/mini_react/use_async_action.integration.test.js
import { render, screen, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ToastHost from "../toast/toast_host";
import useAsyncAction from "./use_async_action";
import { _resetForTest as resetToast } from "../../SERVICEs/toast_bus";
import { _resetForTest as resetProgress } from "../../SERVICEs/progress_bus";

function Harness({ fn }) {
  const { run, pending } = useAsyncAction(fn, { label: "任务", pendingDelayMs: 0 });
  return (
    <div>
      <button onClick={() => run()}>go</button>
      <span>pending:{pending ? "yes" : "no"}</span>
    </div>
  );
}

describe("useAsyncAction + ToastHost integration", () => {
  beforeEach(() => { resetToast(); resetProgress(); });

  test("失败时 toast 出现、pending 恢复 false", async () => {
    const fn = async () => { throw new Error("boom"); };
    render(
      <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
        <ToastHost />
        <Harness fn={fn} />
      </ConfigContext.Provider>
    );
    await act(async () => { screen.getByText("go").click(); });
    expect(screen.getByText(/任务.*boom/)).toBeInTheDocument();
    expect(screen.getByText("pending:no")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest src/BUILTIN_COMPONENTs/mini_react/use_async_action.integration.test.js`
Expected: PASS

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npm test -- --watchAll=false`
Expected: All tests pass (no previously-green test broken by new code)

- [ ] **Step 4: Run gitnexus_detect_changes**

Run: `gitnexus_detect_changes({scope: "all"})`
Expected: 仅新增文件列表，无意外 symbol 被改。

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/mini_react/use_async_action.integration.test.js
git commit -m "test(hooks): integration test for useAsyncAction + ToastHost"
```

---

## Phase Completion Checklist

所有 Task 完成后，在真实 Electron app 手动验证：

- [ ] `npm start` 启动无 console error
- [ ] DevTools Console 跑 `window.__pupuToast = (await import("./SERVICEs/toast")).toast; __pupuToast.success("test")`，右下角出现 toast
- [ ] 重复发同一条 `error` toast，第二条 2s 内被去重
- [ ] DevTools Console 跑 `(await import("./SERVICEs/progress_bus")).start("x","test")` → 顶部 2px 条出现；`.stop("x")` → 消失
- [ ] 整个应用视觉无回归（ConfigContainer / Router / 现有 UI 不变）

Phase 1+2 完成后可 merge。后续 Phase（P3 B 类迁移）使用这套基础设施。
