// A CSS rule moves the visible panel without mutating any ancestor's style
// attribute. Glass surfaces observe those attributes for live theme changes.
export function createLiveResizeWidth(property, initialWidth) {
  const sheet = document.createElement("style");
  document.head.appendChild(sheet);
  sheet.sheet.insertRule(":root {}", 0);
  const style = sheet.sheet.cssRules[0].style;
  let width = initialWidth;
  let paintedWidth = initialWidth;
  let frame = null;

  return {
    get width() {
      return width;
    },
    update(nextWidth) {
      width = nextWidth;
      if (frame !== null || width === paintedWidth) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (width === paintedWidth) return;
        style.setProperty(property, `${width}px`);
        paintedWidth = width;
      });
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      sheet.remove();
    },
  };
}
