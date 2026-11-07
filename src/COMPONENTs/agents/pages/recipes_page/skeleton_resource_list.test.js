import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SkeletonResourceList from "./skeleton_resource_list";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

const show = (props = {}) =>
  render(<SkeletonResourceList activeId={null} onSelect={() => {}} isDark={false} {...props} />);

describe("listing the Skeleton resources", () => {
  test("they are listed by id, with their name shown", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [{ id: "rev", name: "Reviewer", kind: "agent" }],
    });
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-resource-rev")).toBeInTheDocument());
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
  });

  test("selecting one hands back its id, never its name", () => {
    /* A legacy recipe is fetched by name and one of these by id; handing the
     * name on would open the wrong thing the first time the two collide. */
    const onSelect = jest.fn();
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [{ id: "rev", name: "Reviewer", kind: "agent" }],
    });
    show({ onSelect });
    return waitFor(() => screen.getByTestId("skeleton-resource-rev")).then(() => {
      fireEvent.click(screen.getByTestId("skeleton-resource-rev"));
      expect(onSelect).toHaveBeenCalledWith("rev");
    });
  });

  test("a build with no store shows nothing at all, not an empty library", async () => {
    /* Absent is not the same as empty. */
    const { container } = show();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test("an empty library says so", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
    show();
    await waitFor(() => expect(screen.getByText(/none yet/i)).toBeInTheDocument());
  });

  test("a refusal is reported rather than shown as empty", async () => {
    api.unchain.listSkeletonResources = jest
      .fn()
      .mockResolvedValue({ error: { code: "skeleton_store_failed", message: "store is down" } });
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-list-failed").textContent).toMatch(/store is down/i),
    );
  });

  test("a bare array is accepted as well as a wrapped one", async () => {
    api.unchain.listSkeletonResources = jest
      .fn()
      .mockResolvedValue([{ id: "a", name: "A", kind: "workflow" }]);
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-resource-a")).toBeInTheDocument());
  });
});
