import { CONTROL_HEIGHT, CONTROL_RADIUS, FIELD_RADIUS, REGION_RADIUS, fieldBackground, fieldFill, textFieldFill } from "./panel_style";

describe("the detail panel's one field look", () => {
  test.each([true, false])("a field is white (or the dark lift), keeps the panel's corners and does not change on hover (isDark=%s)", (isDark) => {
    const field = fieldFill(isDark);
    expect(field.backgroundColor).toBe(fieldBackground(isDark));
    expect(field.borderRadius).toBe(FIELD_RADIUS);
    /* No visible border; a control's corners, not a region's. */
    expect(field.border).toBe("1px solid transparent");
    expect(FIELD_RADIUS).toBe(CONTROL_RADIUS);
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

  test("the panel's corners come in named steps: controls at the canvas tags' 6, regions at 10, one 26px control height", () => {
    expect([CONTROL_RADIUS, REGION_RADIUS, CONTROL_HEIGHT]).toEqual([6, 10, 26]);
  });

  test("the multi-line field asks TextField for the same fill and outline, at a region's corners", () => {
    expect(textFieldFill(false)).toEqual({
      borderRadius: REGION_RADIUS,
      restFill: fieldBackground(false),
      restBorder: fieldFill(false).border,
    });
  });
});
