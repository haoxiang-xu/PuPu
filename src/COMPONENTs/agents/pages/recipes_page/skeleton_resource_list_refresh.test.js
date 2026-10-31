import React from "react";
import { act, render, screen } from "@testing-library/react";
import SkeletonResourceList from "./skeleton_resource_list";
import { emitSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const list = (id) => ({ resources: [{ id, name: id, kind: "agent" }] });
const deferred = () => {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { resolve, promise };
};

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

test("the latest library answer wins when save announcements overlap", async () => {
  const first = deferred();
  const second = deferred();
  api.unchain.listSkeletonResources = jest.fn()
    .mockResolvedValueOnce(list("initial"))
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  render(<SkeletonResourceList activeId="initial" onSelect={() => {}} isDark={false} />);
  expect(await screen.findByTestId("skeleton-resource-initial")).toBeInTheDocument();
  act(() => { emitSkeletonLibraryRefresh(); emitSkeletonLibraryRefresh(); });
  await act(async () => { second.resolve(list("latest")); });
  expect(screen.getByTestId("skeleton-resource-latest")).toBeInTheDocument();
  await act(async () => { first.resolve(list("obsolete")); });
  expect(screen.queryByTestId("skeleton-resource-obsolete")).toBeNull();
  expect(screen.getByTestId("skeleton-resource-latest")).toBeInTheDocument();
});

test("unmount unsubscribes from future library announcements", async () => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(list("initial"));
  const view = render(<SkeletonResourceList activeId={null} onSelect={() => {}} isDark={false} />);
  expect(await screen.findByTestId("skeleton-resource-initial")).toBeInTheDocument();
  view.unmount();
  act(() => { emitSkeletonLibraryRefresh(); });
  expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1);
});
