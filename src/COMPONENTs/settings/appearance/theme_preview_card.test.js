import { render, screen } from "@testing-library/react";
import ThemePreviewCard from "./theme_preview_card";

const PALETTE = {
  accent: "#65c466",
  background: "#121212",
  sidebar: "#151515",
  surface: "#1e1e1e",
  text: "#ffffff",
  textMuted: "#8a8a8a",
  border: "#2e2e2e",
  success: "#4ade80",
  danger: "#f87171",
};

describe("ThemePreviewCard", () => {
  test("paints shell tiers from the palette, inline (no CSS vars)", () => {
    render(<ThemePreviewCard palette={PALETTE} />);
    const card = screen.getByTestId("theme-preview-card");
    expect(card).toHaveStyle({ backgroundColor: "#121212" });
    expect(screen.getByTestId("theme-preview-sidebar")).toHaveStyle({
      backgroundColor: "#151515",
    });
    expect(screen.getByTestId("theme-preview-bubble")).toHaveStyle({
      backgroundColor: "#1e1e1e",
    });
    expect(screen.getByTestId("theme-preview-accent")).toHaveStyle({
      backgroundColor: "#65c466",
    });
  });

  test("renders nothing without a palette", () => {
    render(<ThemePreviewCard palette={null} />);
    expect(screen.queryByTestId("theme-preview-card")).toBeNull();
  });
});
