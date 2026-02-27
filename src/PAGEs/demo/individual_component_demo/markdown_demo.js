import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } -------------------------------------------------------------------------------------------------------------- */
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
/* { Components } -------------------------------------------------------------------------------------------------------------- */

const MarkdownDemo = () => {
  const { theme } = useContext(ConfigContext);

  const demoMarkdown = `# Markdown Title

This is a paragraph with **bold**, *italic*, and \`inline code\`.

## Subtitle

- List item 1
- List item 2
- List item 3

> Blockquote example. Notion-ish look.

\`\`\`js
const hello = "world";
console.log(hello);
\`\`\`

| Column A | Column B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |

[Link example](https://example.com)
`;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color: theme?.color || "black",

          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        Markdown
      </span>
      <div
        style={{
          width: "calc(50% - 12px)",
          maxWidth: 720,
          display: "inline-block",
        }}
      >
        <Markdown>{demoMarkdown}</Markdown>
      </div>
      <div
        style={{
          width: "calc(50% - 12px)",
          maxWidth: 720,
          display: "inline-block",
        }}
      >
        <Markdown
          style={{
            pre: {
              height: 600,
            },
          }}
        >{`
\`\`\`js
const MarkdownDemo = () => {
  const { theme } = useContext(ConfigContext);

  const demoMarkdown = \`# Markdown Title

This is a paragraph with **bold**, *italic*, and \`inline code\`.

## Subtitle

- List item 1
- List item 2
- List item 3

> Blockquote example. Notion-ish look.

\\\`\\\`\\\`js
const hello = "world";
console.log(hello);
\\\`\\\`\\\`

| Column A | Column B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |

[Link example](https://example.com)
\`;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color: theme?.color || "black",

          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        Markdown
      </span>
      <div
        style={{
          width: "calc(50% - 12px)",
          maxWidth: 720,
          display: "inline-block",
        }}
      >
        <Markdown>{demoMarkdown}</Markdown>
      </div>    
    </div>
  );
};
\`\`\`
        `}</Markdown>
      </div>
    </div>
  );
};

export default MarkdownDemo;
