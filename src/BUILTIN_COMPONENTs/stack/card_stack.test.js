import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CardStack from "./card_stack";

const makeItems = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, label: `card ${i + 1}` }));

const renderCard = ({ item, expanded, overflow }) => (
  <div data-testid={`card-${item.id}`} data-expanded={expanded}>
    {item.label}
    {overflow > 0 ? ` +${overflow}` : ""}
  </div>
);

describe("CardStack", () => {
  test("renders nothing without items or render_card", () => {
    const a = render(<CardStack items={[]} render_card={renderCard} />);
    expect(a.container).toBeEmptyDOMElement();
    const b = render(<CardStack items={makeItems(2)} />);
    expect(b.container).toBeEmptyDOMElement();
  });

  test("items[0] is the front card; only max_visible render; overflow goes to the front card", () => {
    render(<CardStack items={makeItems(5)} render_card={renderCard} />);

    expect(screen.getByTestId("card-c1")).toHaveTextContent("card 1 +2");
    expect(screen.getByTestId("card-c2")).toBeInTheDocument();
    expect(screen.getByTestId("card-c3")).toBeInTheDocument();
    expect(screen.queryByTestId("card-c4")).toBeNull();
    expect(screen.queryByTestId("card-c5")).toBeNull();
  });

  test("hover expands, leave collapses, and on_expand_change reports both", () => {
    const onExpand = jest.fn();
    const { container } = render(
      <CardStack
        items={makeItems(3)}
        render_card={renderCard}
        on_expand_change={onExpand}
      />,
    );
    const root = container.querySelector("[data-card-stack]");
    expect(root.getAttribute("data-expanded")).toBe("false");

    fireEvent.mouseEnter(root);
    expect(root.getAttribute("data-expanded")).toBe("true");
    expect(onExpand).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId("card-c2").getAttribute("data-expanded")).toBe(
      "true",
    );

    fireEvent.mouseLeave(root);
    expect(root.getAttribute("data-expanded")).toBe("false");
    expect(onExpand).toHaveBeenLastCalledWith(false);
  });

  test("caller style lands on the root (anchoring stays with the caller)", () => {
    const { container } = render(
      <CardStack
        items={makeItems(1)}
        render_card={renderCard}
        style={{ position: "absolute", bottom: "13px" }}
      />,
    );
    const root = container.querySelector("[data-card-stack]");
    expect(root.style.position).toBe("absolute");
    expect(root.style.bottom).toBe("13px");
  });
});
