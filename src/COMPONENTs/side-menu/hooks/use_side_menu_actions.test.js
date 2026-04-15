import { act, renderHook } from "@testing-library/react";

import { useSideMenuActions } from "./use_side_menu_actions";

const renderActions = (overrides = {}) => {
  const props = {
    chatStore: {},
    setChatStore: jest.fn(),
    closeContextMenu: jest.fn(),
    renaming: { nodeId: null, value: "" },
    setRenaming: jest.fn(),
    setConfirmDelete: jest.fn(),
    ...overrides,
  };

  const rendered = renderHook(() => useSideMenuActions(props));

  return { ...rendered, props };
};

describe("useSideMenuActions", () => {
  test("handleDelete closes stale confirmation state when the node is missing", () => {
    const { result, props } = renderActions();

    act(() => {
      result.current.handleDelete(null);
    });

    expect(props.setChatStore).not.toHaveBeenCalled();
    expect(props.setConfirmDelete).toHaveBeenCalledWith({
      open: false,
      node: null,
    });
  });
});
