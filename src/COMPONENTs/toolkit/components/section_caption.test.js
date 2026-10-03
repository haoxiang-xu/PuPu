import { render, screen } from "@testing-library/react";
import SectionCaption from "./section_caption";

test("renders its label", () => {
  render(<SectionCaption label="Latest" />);

  expect(screen.getByText("Latest")).toBeInTheDocument();
});

test("renders an action beside the label when given one", () => {
  render(<SectionCaption label="Essentials" action={<button>See all</button>} />);

  expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
});

test("carries its test id", () => {
  render(<SectionCaption label="Latest" testId="discover-section-latest" />);

  expect(screen.getByTestId("discover-section-latest")).toHaveTextContent("Latest");
});

test("the caption itself carries no fill", () => {
  render(<SectionCaption label="Latest" testId="caption" />);

  expect(screen.getByTestId("caption").style.background).toBe("");
});
