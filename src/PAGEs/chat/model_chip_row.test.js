import { layoutChipRows } from "./model_chip_row";

test("wraps and centers rows like flex-wrap + justify-content: center", () => {
  const sizes = [{ w: 100, h: 30 }, { w: 120, h: 30 }, { w: 90, h: 30 }, { w: 60, h: 30 }];
  const { positions, height } = layoutChipRows(sizes, 340, 8);
  /* row 1: 100 + 8 + 120 + 8 + 90 = 326 → starts at (340 - 326) / 2 = 7 */
  expect(positions.slice(0, 3)).toEqual([
    { x: 7, y: 0 },
    { x: 115, y: 0 },
    { x: 243, y: 0 },
  ]);
  /* row 2: the 60px chip alone, centered, one row-gap below */
  expect(positions[3]).toEqual({ x: 140, y: 38 });
  expect(height).toBe(68);
});

test("waits until every slot and the container are measured", () => {
  expect(layoutChipRows([{ w: 10, h: 10 }, undefined], 300)).toBeNull();
  expect(layoutChipRows([{ w: 10, h: 10 }], 0)).toBeNull();
});
