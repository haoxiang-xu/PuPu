import React, { useRef } from "react";
import { render } from "@testing-library/react";
import SlidingHighlight from "./sliding_highlight";

/* jsdom has no layout: every offset* is 0 and offsetParent is null. These
   prototype getters stand in for CSS positioning so the walk under test has
   real geometry to walk — an element's offsetParent is its nearest ancestor
   marked data-positioned, and its offsets come straight off data attributes.
   Restored afterwards so no other suite inherits the fake. */
const OFFSET_PROPS = [
  "offsetParent",
  "offsetTop",
  "offsetLeft",
  "offsetWidth",
  "offsetHeight",
];
const saved = {};

const numberAttr = (el, name) => {
  const raw = el.getAttribute(name);
  return raw === null ? 0 : Number(raw);
};

beforeAll(() => {
  OFFSET_PROPS.forEach((prop) => {
    saved[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  });
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      let node = this.parentElement;
      while (node) {
        if (node.hasAttribute("data-positioned")) return node;
        node = node.parentElement;
      }
      return null;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() {
      return numberAttr(this, "data-offset-top");
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get() {
      return numberAttr(this, "data-offset-left");
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return numberAttr(this, "data-offset-width");
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return numberAttr(this, "data-offset-height");
    },
  });
});

afterAll(() => {
  OFFSET_PROPS.forEach((prop) => {
    if (saved[prop]) {
      Object.defineProperty(HTMLElement.prototype, prop, saved[prop]);
    } else {
      delete HTMLElement.prototype[prop];
    }
  });
});

const highlightIn = (container) =>
  container.querySelector('span[aria-hidden="true"]');

/* A list host with the highlight rendered FIRST (as every caller does) and
   the rows after it, exactly the commit order the passive effect relies on. */
const Fixture = ({ index, children, measureKey = "k" }) => {
  const refs = useRef([]);
  return (
    <div data-positioned data-testid="host">
      <SlidingHighlight
        refs={refs}
        index={index}
        color="rgba(0,0,0,0.1)"
        borderRadius={14}
        measureKey={measureKey}
      />
      {children(refs)}
    </div>
  );
};

describe("SlidingHighlight measures against its own host", () => {
  test("a row whose offsetParent IS the host: plain offsets (the Select case)", () => {
    const { container } = render(
      <Fixture index={0}>
        {(refs) => (
          <div
            ref={(el) => {
              refs.current[0] = el;
            }}
            data-offset-top="145"
            data-offset-left="0"
            data-offset-width="229"
            data-offset-height="28"
          />
        )}
      </Fixture>,
    );

    const hl = highlightIn(container);
    expect(hl.style.transform).toBe("translate(0px, 145px)");
    expect(hl.style.width).toBe("229px");
    expect(hl.style.height).toBe("28px");
    expect(hl.style.opacity).toBe("1");
  });

  test("a row inside a positioned branch: offsets accumulate up to the host (the Explorer case)", () => {
    /* The bug this locks: Explorer wraps a folder's children in a
       position:relative branch, so a nested row's offsetTop (28) is measured
       from that branch (itself at 100), not from the list. Reading offsetTop
       alone painted the pill at 28 — on the first row — while the pointer
       was on the row at 128. */
    const { container } = render(
      <Fixture index={0}>
        {(refs) => (
          <div data-positioned data-offset-top="100" data-offset-left="0">
            <div
              ref={(el) => {
                refs.current[0] = el;
              }}
              data-offset-top="28"
              data-offset-left="0"
              data-offset-width="264"
              data-offset-height="28"
            />
          </div>
        )}
      </Fixture>,
    );

    expect(highlightIn(container).style.transform).toBe(
      "translate(0px, 128px)",
    );
  });

  test("two nested branches accumulate both", () => {
    const { container } = render(
      <Fixture index={0}>
        {(refs) => (
          <div data-positioned data-offset-top="60">
            <div data-positioned data-offset-top="40" data-offset-left="16">
              <div
                ref={(el) => {
                  refs.current[0] = el;
                }}
                data-offset-top="28"
                data-offset-left="0"
                data-offset-width="200"
                data-offset-height="28"
              />
            </div>
          </div>
        )}
      </Fixture>,
    );

    expect(highlightIn(container).style.transform).toBe(
      "translate(16px, 128px)",
    );
  });

  test("a target outside the host falls back to its plain offsets", () => {
    /* Nothing to accumulate against — behave exactly as before the walk. */
    let outside = null;
    const Outside = () => {
      const refs = useRef([]);
      return (
        <>
          <div data-positioned>
            <div
              ref={(el) => {
                refs.current[0] = el;
                outside = el;
              }}
              data-offset-top="33"
              data-offset-width="100"
              data-offset-height="20"
            />
          </div>
          <div data-positioned data-testid="host">
            <SlidingHighlight
              refs={refs}
              index={0}
              color="red"
              borderRadius={4}
              measureKey="k"
            />
          </div>
        </>
      );
    };
    const { getByTestId } = render(<Outside />);

    expect(outside).not.toBeNull();
    expect(highlightIn(getByTestId("host")).style.transform).toBe(
      "translate(0px, 33px)",
    );
  });

  test("with no target the block is present but invisible", () => {
    /* It has to exist before it has anything to show: its own offsetParent
       is how the host is found on the very first measurement. */
    const { container } = render(
      <Fixture index={-1}>{() => <div data-offset-top="10" />}</Fixture>,
    );

    const hl = highlightIn(container);
    expect(hl).not.toBeNull();
    expect(hl.style.opacity).toBe("0");
    expect(hl.style.transform).toBe("none");
  });

  test("first appearance snaps; a later move slides", () => {
    const { container, rerender } = render(
      <Fixture index={0}>
        {(refs) => (
          <>
            <div
              ref={(el) => {
                refs.current[0] = el;
              }}
              data-offset-top="0"
              data-offset-width="100"
              data-offset-height="28"
            />
            <div
              ref={(el) => {
                refs.current[1] = el;
              }}
              data-offset-top="29"
              data-offset-width="100"
              data-offset-height="28"
            />
          </>
        )}
      </Fixture>,
    );

    expect(highlightIn(container).style.transition).toBe("none");

    rerender(
      <Fixture index={1}>
        {(refs) => (
          <>
            <div
              ref={(el) => {
                refs.current[0] = el;
              }}
              data-offset-top="0"
              data-offset-width="100"
              data-offset-height="28"
            />
            <div
              ref={(el) => {
                refs.current[1] = el;
              }}
              data-offset-top="29"
              data-offset-width="100"
              data-offset-height="28"
            />
          </>
        )}
      </Fixture>,
    );

    const hl = highlightIn(container);
    expect(hl.style.transform).toBe("translate(0px, 29px)");
    expect(hl.style.transition).toContain("transform 200ms");
  });
});
