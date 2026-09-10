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
       nine rows before anything scrolls. Three contiguous 32px rows plus
       the 7px top inset is 103. */
    expect(menu.style.maxHeight).toBe("103px");
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

  /* The composer's blur is what closes the palette (chat_input clears the
     slash trigger on blur). A row that lets the browser move focus on
     mousedown therefore closes the palette before its own click can land —
     which is exactly what a category row did: click it and the palette
     vanished instead of the category collapsing. */
  test("in the palette a mousedown on a category row is default-prevented, so the composer keeps focus", () => {
    render(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={() => {}}
        folderState={treeState}
        bare
      />,
    );

    // fireEvent returns false when a handler called preventDefault
    expect(fireEvent.mouseDown(screen.getByText("Daily writing"))).toBe(false);
  });

  test("clicking a category row collapses it, and the rest of the list stays", () => {
    const onVisibleChange = jest.fn();
    render(
      <CommandMenu
        items={items}
        activeIndex={0}
        onPick={() => {}}
        folderState={treeState}
        onVisibleChange={onVisibleChange}
        bare
      />,
    );
    const lastVisible = () => onVisibleChange.mock.calls.at(-1)[0];
    expect(lastVisible()).toEqual([`folder:${FOLDER}`, "/polish", "/review"]);

    fireEvent.click(screen.getByText("Daily writing"));
    expect(lastVisible()).toEqual([`folder:${FOLDER}`, "/review"]);

    fireEvent.click(screen.getByText("Daily writing"));
    expect(lastVisible()).toEqual([`folder:${FOLDER}`, "/polish", "/review"]);
  });

  test("outside the palette a category mousedown is left alone (a rename field must be able to take focus)", () => {
    render(
      <CommandMenu
        items={items}
        activeIndex={-1}
        onPick={() => {}}
        folderState={treeState}
      />,
    );

    expect(fireEvent.mouseDown(screen.getByText("Daily writing"))).toBe(true);
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
    // 10 * 32 + 7 — rows inside the tree are contiguous, no per-row gap
    expect(heightOf({ items: rows(10) })).toBe(327);
    expect(heightOf({ items: rows(40) })).toBe(327);
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

describe("CommandMenu corners stay concentric with the palette", () => {
  /* The palette panel is radius 22 with a 1px border outside its width; the
     row pill is radius 14. Concentric arcs need the pill exactly 22 − 14 = 8
     from the visible corner on every side — 7 of inset here plus the border.
     What broke this once: Explorer's own container carries padding:4px 0, so
     swapping the flat list for the tree quietly pushed the top row to 13 while
     the sides stayed at 9. */
  const items = [
    { name: "/a", description: "a" },
    { name: "/b", description: "b" },
  ];

  test("the bare list insets 7 on top and sides, none below", () => {
    render(<CommandMenu items={items} activeIndex={0} onPick={() => {}} bare />);
    const menu = screen.getByRole("listbox", { name: "斜杠命令" });
    expect(menu.style.padding).toBe("7px 7px 0px");
  });

  test("the tree adds no inset of its own", () => {
    render(<CommandMenu items={items} activeIndex={0} onPick={() => {}} bare />);
    const menu = screen.getByRole("listbox", { name: "斜杠命令" });
    const explorerHost = menu.firstElementChild;
    /* numeric: React writes a zero as "0" (no unit) while jsdom re-serialises
       the padding shorthand as "0px" — the value is what matters */
    expect(parseFloat(explorerHost.style.padding) || 0).toBe(0);
    expect(parseFloat(explorerHost.style.minHeight) || 0).toBe(0);
  });
});

describe("CommandMenu source tags", () => {
  const packed = (name) => ({
    name,
    description: `${name} desc`,
    sourceToolkitId: "acme",
    sourceLabel: "Acme Tools",
  });

  test("a command inside its own plugin's folder drops the per-row source tag", () => {
    render(<CommandMenu items={[packed("/a"), packed("/b")]} activeIndex={0} onPick={() => {}} />);
    // the folder carries the name once; no row repeats it
    expect(screen.getAllByText("Acme Tools")).toHaveLength(1);
  });

  test("a command moved into the user's own category keeps its source tag", () => {
    const state = {
      folders: {
        f1: { id: "f1", name: "Mine", parentId: null, childFolderIds: [], expanded: true },
      },
      commandFolder: { "/a": "f1" },
      folderOrder: ["f1"],
      itemOrder: {},
    };
    render(
      <CommandMenu items={[packed("/a"), packed("/b")]} activeIndex={0} onPick={() => {}} folderState={state} />,
    );
    // folder "Acme Tools" (holding /b, tag dropped) + the tag on /a under "Mine"
    expect(screen.getAllByText("Acme Tools")).toHaveLength(2);
  });
});
