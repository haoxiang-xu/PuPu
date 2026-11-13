import { FIELD_RADIUS, REGION_RADIUS, fieldBackground, fieldFill, textFieldFill } from "./panel_style";

describe("the detail panel's one field look", () => {
  test.each([true, false])("a field is white (or the dark lift), keeps the panel's corners and does not change on hover (isDark=%s)", (isDark) => {
    const field = fieldFill(isDark);
    expect(field.backgroundColor).toBe(fieldBackground(isDark));
    expect(field.borderRadius).toBe(FIELD_RADIUS);
    /* No visible border, and the same corners as the Input / Output regions. */
    expect(field.border).toBe("1px solid transparent");
    expect(FIELD_RADIUS).toBe(REGION_RADIUS);
    expect(field.boxShadow).toBe("none");
    /* Button, Select and the model picker read these; Input reads the variable. */
    expect(field.hoverBackgroundColor).toBe(field.backgroundColor);
    expect(field.activeBackgroundColor).toBe(field.backgroundColor);
    expect(field["--pupu-overlay-hover"]).toBe("transparent");
    /* focus looks like rest, too */
    expect(field["--pupu-overlay-active"]).toBe("transparent");
  });

  test("the dark field is a calm 4.5% lift, one step above a region's 3.5%", () => {
    expect(fieldBackground(true)).toBe("rgba(255,255,255,0.045)");
  });

  test("the light field is the theme's surface, not a bare colour", () => {
    expect(fieldBackground(false)).toMatch(/^var\(--pupu-surface/);
  });

  test("the multi-line field asks TextField for the same fill and outline", () => {
    expect(textFieldFill(false)).toEqual({
      borderRadius: FIELD_RADIUS,
      restFill: fieldBackground(false),
      restBorder: fieldFill(false).border,
    });
  });
});
