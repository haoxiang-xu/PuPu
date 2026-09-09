import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandMenu from "./command_menu";

const makeItems = () => [
  { name: "/btw", description: "立即回答,不打断当前任务", insertText: "/btw " },
  { name: "/fyi", description: "补充给当前任务", insertText: "/fyi " },
  { name: "/queue", description: "排队，当前任务完成后执行", insertText: "/queue " },
];

describe("CommandMenu", () => {
  test("renders nothing when items is empty", () => {
    const { container } = render(
      <CommandMenu items={[]} activeIndex={0} onPick={() => {}} isDark={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders each item's name and description", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    expect(screen.getByText("/btw")).toBeInTheDocument();
    expect(screen.getByText("立即回答,不打断当前任务")).toBeInTheDocument();
    expect(screen.getByText("/fyi")).toBeInTheDocument();
    expect(screen.getByText("补充给当前任务")).toBeInTheDocument();
    expect(screen.getByText("/queue")).toBeInTheDocument();
    expect(screen.getByText("排队，当前任务完成后执行")).toBeInTheDocument();
  });

  test("highlights the row at activeIndex", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={1} onPick={() => {}} isDark={false} />,
    );

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  test("uses a compact translucent blurred surface", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    const menu = screen.getByRole("listbox", { name: "斜杠命令" });
    const options = screen.getAllByRole("option");

    // jsdom CSSOM drops var()-based colors entirely (property AND attribute) —
    // the surface binding is locked by source scan instead
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "command_menu.js"),
      "utf8",
    );
    expect(src).toContain('rgba(var(--pupu-surface-rgb),0.72)');
    expect(menu.style.backdropFilter).toBe("blur(18px) saturate(1.4)");
    /* Height follows the rows actually rendered and caps at ten — not the
       pre-#232 fixed six. The surface is a tree now: folder rows spend height
       that carries no command, so six commands inside three categories is
       nine rows before anything scrolls. Three flat rows at stride 33 plus
       8px of padding is 107. */
    expect(menu.style.maxHeight).toBe("107px");
    expect(menu.style.padding).toBe("3px");
    expect(options[0].style.height).toBe("32px");
    /* Asserted per-side rather than as a shorthand: a row now carries a
       depth-derived left padding, so the shorthand has four parts even at
       depth 0. */
    expect(options[0].style.paddingLeft).toBe("8px");
    expect(options[0].style.paddingRight).toBe("8px");
  });

  test("onPick fires with the picked item when a row is clicked", () => {
    const onPick = jest.fn();
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={onPick} isDark={false} />,
    );

    fireEvent.mouseDown(screen.getByText("/fyi"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(makeItems()[1]);
  });

  test("renders a trailing source tag when item.sourceLabel is set", () => {
    const items = [
      {
        name: "/plan",
        description: "app",
        insertText: "/plan ",
        sourceLabel: "Plankit",
      },
    ];
    render(
      <CommandMenu items={items} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    expect(screen.getByText("Plankit")).toBeInTheDocument();
  });

  test("renders no source tag node when item.sourceLabel is absent", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    // none of the builtin items (no icon, no sourceLabel) carry a third
    // trailing span — just the name span + description span per row
    const rows = screen.getAllByRole("option");
    rows.forEach((row) => {
      expect(row.children.length).toBe(2);
    });
  });
});

describe("CommandMenu tree", () => {
  const FOLDER = "f1";
  const treeState = {
    folders: {
      [FOLDER]: {
        id: FOLDER,
        name: "Daily writing",
        parentId: null,
        childFolderIds: [],
        expanded: true,
      },
    },
    commandFolder: { "/polish": FOLDER },
    folderOrder: [FOLDER],
    itemOrder: { __root__: [`folder:${FOLDER}`, "/review"], [FOLDER]: ["/polish"] },
  };
  const items = [
    { name: "/polish", description: "polish text" },
    { name: "/review", description: "review code" },
  ];

  test("renders the user's categories with their commands inside", () => {
    render(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={() => {}}
        folderState={treeState}
      />,
    );

    expect(screen.getByText("Daily writing")).toBeInTheDocument();
    expect(screen.getByText("/polish")).toBeInTheDocument();
    expect(screen.getByText("/review")).toBeInTheDocument();
  });

  test("a command inside a category is indented; one at root is not", () => {
    render(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={() => {}}
        folderState={treeState}
      />,
    );

    const rowFor = (name) =>
      screen.getByText(name).closest("[data-command-row]");
    expect(rowFor("/polish").style.paddingLeft).toBe("24px"); // 8 + 1 * 16
    expect(rowFor("/review").style.paddingLeft).toBe("8px");
  });

  test("the organize entry only exists when a handler is given", () => {
    const { rerender } = render(
      <CommandMenu items={items} activeIndex={0} onPick={() => {}} />,
    );
    expect(
      document.querySelector("[data-command-organize-entry]"),
    ).toBeNull();

    rerender(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={() => {}}
        onOrganize={() => {}}
        organizeLabel="Organize skills…"
      />,
    );
    expect(screen.getByText("Organize skills…")).toBeInTheDocument();
  });

  test("clicking the organize entry calls back without picking a command", () => {
    const onOrganize = jest.fn();
    const onPick = jest.fn();
    render(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={onPick}
        onOrganize={onOrganize}
        organizeLabel="Organize skills…"
      />,
    );

    fireEvent.mouseDown(screen.getByText("Organize skills…"));
    expect(onOrganize).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("CommandMenu list height", () => {
  const rows = (n) =>
    Array.from({ length: n }, (_, i) => ({
      name: `/c${i}`,
      description: `d${i}`,
    }));

  const heightOf = (props) => {
    const { unmount } = render(
      <CommandMenu activeIndex={0} onPick={() => {}} {...props} />,
    );
    const h = parseInt(
      screen.getByRole("listbox", { name: "斜杠命令" }).style.maxHeight,
      10,
    );
    unmount();
    return h;
  };

  test("caps at ten rows however many commands there are", () => {
    // 10 * (32 + 1) + 8
    expect(heightOf({ items: rows(10) })).toBe(338);
    expect(heightOf({ items: rows(40) })).toBe(338);
  });

  test("the organize entry is counted, not left to overflow", () => {
    /* The regression this locks: the panel reserved room for the entry while
       the list did not, so the list scrolled first and clipped its last row
       through the middle. */
    const without = heightOf({ items: rows(4) });
    const with_ = heightOf({
      items: rows(4),
      onOrganize: () => {},
      organizeLabel: "Organize skills…",
    });
    expect(with_ - without).toBe(28); // entry 26 + 2 margin
  });

  test("bare rows are shorter than carded ones", () => {
    expect(heightOf({ items: rows(4), bare: true })).toBeLessThan(
      heightOf({ items: rows(4) }),
    );
  });

  test("the reported visible row count wins over the command count", () => {
    // a collapsed category hides children: fewer ROWS than commands
    expect(heightOf({ items: rows(9), visibleRowCount: 3 })).toBe(
      heightOf({ items: rows(3) }),
    );
  });
});
