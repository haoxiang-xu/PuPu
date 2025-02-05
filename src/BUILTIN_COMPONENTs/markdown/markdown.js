import React, { useState, useEffect, useRef } from "react";
/* { import external render libraries } ------------------------------------------------- */
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import Tag from "../tag/tag";
import { CodeBlock, dracula } from "react-code-blocks";
import ReactShowdown from "react-showdown";
import Icon from "../icon/icon";
/* { style } --------------------------------------------------------------------- */
import "./markdown.css";

const R = 30;
const G = 30;
const B = 30;

const default_forground_color_offset = 12;
const default_front_object_color_offset = 50;
const default_font_color_offset = 128;
const default_font_size = 12;
const default_border_radius = 10;
const default_tag_max_Width = 128;

const CodeSection = ({ language, children }) => {
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(225, 225, 225, 0)`,
  });

  useEffect(() => {
    if (onClicked) {
      setStyle({
        backgroundColor: `rgba(225, 225, 225, 0.16)`,
      });
    } else if (onHover) {
      setStyle({
        backgroundColor: `rgba(225, 225, 225, 0.08)`,
      });
    } else {
      setStyle({
        backgroundColor: `rgba(225, 225, 225, 0)`,
      });
    }
  }, [onHover, onClicked]);

  return (
    <div
      className="code-section"
      style={{
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 7,
          right: 7,
          left: 7,

          height: default_font_size + 24,

          opacity: 1,
          borderRadius: `${default_border_radius - 4}px`,
          // backgroundColor: `rgb(${R + default_forground_color_offset / 6}, ${
          //   G + default_forground_color_offset / 6
          // }, ${B + default_forground_color_offset / 6})`,
          boxShadow: `0 2px 16px rgba(0, 0, 0, 0.64)`,
        }}
      >
        <span
          style={{
            userSelect: "none",
            position: "absolute",
            top: "45%",

            transform: "translateY(-50%)",
            left: 12,

            fontSize: `${default_font_size + 4}px`,
            fontWeight: "bold",
            color: `rgb(${R + default_font_color_offset}, ${
              G + default_font_color_offset
            }, ${B + default_font_color_offset}, 0.64)`,
          }}
        >
          {language}
        </span>
        <div
          style={{
            transition: "all 0.16s cubic-bezier(0.32, 1, 0.32, 1)",
            position: "absolute",
            top: 5,
            right: 5,

            width: 36,
            padding: `${default_font_size}px ${default_font_size}px ${default_font_size}px ${default_font_size}px`,
            border: `1px solid rgba(${R + default_forground_color_offset}, ${
              G + default_forground_color_offset
            }, ${B + default_forground_color_offset} , 0)`,
            borderRadius: `${default_border_radius - 5}px`,
            backgroundColor: style.backgroundColor,
          }}
          onMouseEnter={() => setOnHover(true)}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClicked(false);
          }}
          onMouseDown={() => {
            setOnClicked(true);
            navigator.clipboard.writeText(children);
          }}
          onMouseUp={() => setOnClicked(false)}
        >
          <Icon
            src="copy"
            style={{
              position: "absolute",
              top: "50%",
              left: 5,
              transform: "translateY(-50%)",
              PointerEvents: "none",
              userSelect: "none",
              opacity: onClicked ? 1 : 0.64,
            }}
          />
          <span
            style={{
              position: "absolute",
              top: "50%",
              right: 5,
              transform: "translateY(-55%)",

              fontSize: `${default_font_size + 3}px`,
              color: `rgb(${R + default_font_color_offset}, ${
                G + default_font_color_offset
              }, ${B + default_font_color_offset})`,
              PointerEvents: "none",
              userSelect: "none",
              opacity: onClicked ? 1 : 0.64,
            }}
          >
            copy
          </span>
        </div>
      </div>
      <CodeBlock
        text={children}
        language={language}
        showLineNumbers={false}
        theme={dracula}
        wrapLines={false}
        codeBlock
        customStyle={{
          fontSize: `${default_font_size + 2}px`,
          fontFamily: "'Courier New', Courier, monospace",
          backgroundColor: `rgb(${R - 8}, ${G - 8}, ${B - 8})`,
          paddingTop: 36,
          borderRadius: default_border_radius,
          overflowX: "auto",
          overflowY: "hidden",
          maxWidth: "100%",
          boxShadow: `0 2px 16px rgba(0, 0, 0, 0.32)`,
          border: `2px solid rgba(${225}, ${255}, ${225} , 0.16)`,
        }}
      />
    </div>
  );
};
const SingleLineCodeSection = ({ language, children }) => {
  return (
    <CodeBlock
      text={children}
      language={language}
      showLineNumbers={false}
      theme={dracula}
      wrapLines={false}
      codeBlock
      customStyle={{
        display: "inline-block",
        fontSize: `${default_font_size}px`,
        color: `rgb(${R + default_font_color_offset}, ${
          G + default_font_color_offset
        }, ${B + default_font_color_offset})`,
        backgroundColor: `rgb(${R - 8}, ${G - 8}, ${B - 8})`,
        borderRadius: default_border_radius,
        overflowY: "hidden",
      }}
    />
  );
};
const MarkDownSection = ({ children }) => {
  return (
    <div className="markdown-section" style={{ display: "inline-block" }}>
      <ReactShowdown markdown={children} />
    </div>
  );
};
const TagSection = ({ children }) => {
  const tagRef = useRef();

  return (
    <div
      style={{
        position: "relative",

        width: default_tag_max_Width,

        display: "inline-block",
        height: default_font_size,
        fontSize: `${default_font_size}px`,
        padding: `${default_font_size / 2}px ${default_font_size}px ${
          default_font_size / 2
        }px ${default_font_size}px`,
      }}
    >
      <Tag
        config={{
          reference: tagRef,
          type: "file",
          label: children,
          style: {
            maxWidth: default_tag_max_Width,
          },
        }}
      />
    </div>
  );
};
const LaTeXSection = ({ children }) => {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        height: default_font_size,
        fontSize: `${default_font_size}px`,
      }}
    >
      <Latex>{children}</Latex>
    </div>
  );
};
const TextSection = ({ children }) => {
  return (
    <span
      style={{
        fontSize: `${default_font_size + 4}px`,
      }}
    >
      {children}
    </span>
  );
};
const HTMLSection = ({ children }) => {
  return <div dangerouslySetInnerHTML={{ __html: children }} />;
};
const ThinkingSection = ({ children }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [onClick, setOnClick] = useState(false);
  const [onHover, setOnHover] = useState(false);

  const [style, setStyle] = useState({
    backgroundColor: "none",
  });
  useEffect(() => {
    if (onClick) {
      setStyle({
        backgroundColor: `rgba(${R + default_forground_color_offset * 2}, ${
          G + default_forground_color_offset * 2
        }, ${B + default_forground_color_offset * 2}, 1)`,
      });
    } else if (onHover) {
      setStyle({
        backgroundColor: `rgba(${R + default_forground_color_offset}, ${
          G + default_forground_color_offset
        }, ${B + default_forground_color_offset}, 0.32)`,
      });
    } else {
      setStyle({
        backgroundColor: `rgba(${R + default_forground_color_offset}, ${
          G + default_forground_color_offset
        }, ${B + default_forground_color_offset}, 0)`,
      });
    }
  }, [onClick, onHover]);

  return (
    <div style={{ display: "inline-block" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,

          width: "100%",
          height: "64px",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "17px",
            left: "44px",

            opacity: 0.64,
          }}
        >
          Thought process
        </span>
      </div>
      <div
        className="markdown-section"
        style={{
          transition: "all 0.32s cubic-bezier(0.32, 1, 0.32, 1)",

          display: "inline-block",
          backgroundColor: `rgba(${R + default_forground_color_offset}, ${
            G + default_forground_color_offset
          }, ${B + default_forground_color_offset}, 0.72)`,
          borderRadius: `${default_border_radius}px`,
          padding: `${default_font_size}px`,
          maxHeight: isExpanded ? "none" : "8px",
          overflowY: "hidden",
          opacity: isExpanded ? 0.32 : 0,
        }}
      >
        <ReactShowdown markdown={children} />
      </div>
      <Icon
        src="arrow"
        style={{
          transition: "all 0.32s cubic-bezier(0.32, 1, 0.32, 1)",
          position: "absolute",
          top: "28px",
          left: "28px",
          transform: isExpanded
            ? "translate(-50%, -50%) rotate(-90deg)"
            : "translate(-50%, -50%) rotate(90deg)",
          padding: 4,
          borderRadius: default_border_radius - 4,
          backgroundColor: style.backgroundColor,
        }}
        onMouseEnter={() => setOnHover(true)}
        onMouseLeave={() => {
          setOnHover(false);
          setOnClick(false);
        }}
        onMouseDown={() => setOnClick(true)}
        onMouseUp={() => setOnClick(false)}
        onClick={() => setIsExpanded(!isExpanded)}
      />
    </div>
  );
};

const Markdown = ({ children, style }) => {
  const [processedContent, setProcessedContent] = useState(children);

  useEffect(() => {
    const extract_think = (raw_content) => {
      let unprocessed_content = raw_content;
      let processed_content = [];

      while (unprocessed_content.indexOf("<think>") !== -1) {
        const start_tag = "<think>";
        const end_tag = start_tag.replace("<", "</");

        const start_index = unprocessed_content.indexOf(start_tag);
        let end_index = unprocessed_content.indexOf(end_tag);
        if (end_index === -1) {
          end_index = unprocessed_content.length;
        }
        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(
          end_index + end_tag.length
        );
        const think_content = unprocessed_content.slice(
          start_index + start_tag.length,
          end_index
        );
        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        if (think_content.trim()) {
          processed_content.push({ type: "THINK", content: think_content });
        }
        unprocessed_content = post_content;
      }
      if (unprocessed_content.length > 0) {
        processed_content.push({ type: "RAW", content: unprocessed_content });
      }
      return processed_content;
    };
    const extract_code = (raw_content) => {
      const find_first_code_block = (raw_content) => {
        const start_code_block = "```";
        const end_code_block = "```";
        const start_code_block_index = raw_content.indexOf(start_code_block);

        const sliced_content = raw_content.slice(start_code_block_index + 3);

        const end_code_block_index =
          sliced_content.indexOf(end_code_block) + start_code_block_index + 3;
        if (start_code_block_index === -1) return null;
        if (end_code_block_index === -1) return null;
        if (end_code_block_index < start_code_block_index) return null;

        return raw_content.slice(
          start_code_block_index,
          end_code_block_index + end_code_block.length
        );
      };
      const process_code_block = (code_block) => {
        const language = code_block.slice(3, code_block.indexOf("\n")).trim();
        const first_line_index = code_block.indexOf("\n");
        const last_line_index = code_block.lastIndexOf("\n");

        const content = code_block.slice(first_line_index + 1, last_line_index);
        return { language, content };
      };

      let unprocessed_content = raw_content;
      let processed_content = [];

      while (find_first_code_block(unprocessed_content) !== null) {
        const code_block = find_first_code_block(unprocessed_content);

        const start_index = unprocessed_content.indexOf(code_block);
        const end_index = start_index + code_block.length;

        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(end_index);
        const code_content = unprocessed_content.slice(start_index, end_index);

        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        const processed_code_block = process_code_block(code_content);
        processed_content.push({
          type: "CODE",
          language: processed_code_block.language,
          content: processed_code_block.content,
        });

        unprocessed_content = post_content;
      }
      if (unprocessed_content.length > 0) {
        processed_content.push({ type: "RAW", content: unprocessed_content });
      }
      return processed_content;
    };
    const extract_single_line_code = (raw_content) => {
      const find_first_code_block = (raw_content) => {
        const start_code_block = "`";
        const end_code_block = "`";
        const start_code_block_index = raw_content.indexOf(start_code_block);

        const sliced_content = raw_content.slice(start_code_block_index + 1);

        const end_code_block_index =
          sliced_content.indexOf(end_code_block) + start_code_block_index + 1;
        if (start_code_block_index === -1) return null;
        if (end_code_block_index === -1) return null;
        if (end_code_block_index < start_code_block_index) return null;

        return raw_content.slice(
          start_code_block_index,
          end_code_block_index + end_code_block.length
        );
      };
      const process_code_block = (code_block) => {
        const language = code_block.slice(1, code_block.indexOf("\n")).trim();
        const content = code_block.slice(1, -1);
        return { language, content };
      };

      let unprocessed_content = raw_content;
      let processed_content = [];

      while (find_first_code_block(unprocessed_content) !== null) {
        const code_block = find_first_code_block(unprocessed_content);

        const start_index = unprocessed_content.indexOf(code_block);
        const end_index = start_index + code_block.length;

        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(end_index);
        const code_content = unprocessed_content.slice(start_index, end_index);

        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        const processed_code_block = process_code_block(code_content);
        processed_content.push({
          type: "SLCODE",
          language: processed_code_block.language,
          content: processed_code_block.content,
        });

        unprocessed_content = post_content;
      }
      if (unprocessed_content.length > 0) {
        processed_content.push({ type: "RAW", content: unprocessed_content });
      }
      return processed_content;
    };
    const extract_HTML = (raw_content) => {
      const find_first_HTML_tag = (raw_content) => {
        const start_tag_open_index = raw_content.indexOf("<");
        const start_tag_close_index = raw_content.indexOf(">");
        if (start_tag_open_index === -1) return null;
        if (start_tag_close_index < start_tag_open_index) return null;
        return raw_content.slice(
          start_tag_open_index,
          start_tag_close_index + 1
        );
      };

      let unprocessed_content = raw_content;
      let processed_content = [];

      while (find_first_HTML_tag(unprocessed_content) !== null) {
        const start_tag = find_first_HTML_tag(unprocessed_content);
        const end_tag = start_tag.replace("<", "</");

        const start_index = unprocessed_content.indexOf(start_tag);
        const end_index = unprocessed_content.indexOf(end_tag);

        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(
          end_index + end_tag.length
        );
        const html_content = unprocessed_content.slice(
          start_index,
          end_index + end_tag.length
        );
        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        processed_content.push({ type: "HTML", content: html_content });
        unprocessed_content = post_content;
      }
      if (unprocessed_content.length > 0) {
        processed_content.push({ type: "RAW", content: unprocessed_content });
      }
      return processed_content;
    };
    const extract_LaTeX = (raw_content) => {
      const find_first_LaTeX = (raw_content) => {
        const start_LaTeX = "$";
        const end_LaTeX = "$";
        const start_LaTeX_index = raw_content.indexOf(start_LaTeX);
        const sliced_content = raw_content.slice(start_LaTeX_index + 1);
        const end_LaTeX_index =
          sliced_content.indexOf(end_LaTeX) + start_LaTeX_index + 1;
        if (start_LaTeX_index === -1) return null;
        if (end_LaTeX_index === -1) return null;
        if (end_LaTeX_index < start_LaTeX_index) return null;
        return raw_content.slice(
          start_LaTeX_index,
          end_LaTeX_index + end_LaTeX.length
        );
      };

      let unprocessed_content = raw_content;
      let processed_content = [];

      while (find_first_LaTeX(unprocessed_content) !== null) {
        const LaTeX = find_first_LaTeX(unprocessed_content);
        const start_index = unprocessed_content.indexOf(LaTeX);
        const end_index = start_index + LaTeX.length;

        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(end_index);
        const LaTeX_content = unprocessed_content.slice(start_index, end_index);

        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        processed_content.push({ type: "LaTeX", content: LaTeX_content });
        unprocessed_content = post_content;
      }
      if (unprocessed_content.length > 0) {
        processed_content.push({ type: "RAW", content: unprocessed_content });
      }
      return processed_content;
    };

    const process_content = (raw_content) => {
      const extract_and_merge = (raw_content) => {
        if (style && style.plainText === true) {
          return [{ type: "TXT", content: raw_content }];
        }
        const apply_extract_function = (
          processing_content,
          extract_function
        ) => {
          for (let i = 0; i < processing_content.length; i++) {
            if (processing_content[i].type === "RAW") {
              const processed_sub_content = extract_function(
                processing_content[i].content
              );
              processing_content.splice(i, 1, ...processed_sub_content);
            }
          }
          return processing_content;
        };
        let processed_content = [];
        processed_content = extract_code(raw_content);
        processed_content = apply_extract_function(
          processed_content,
          extract_think
        );
        // processed_content = apply_extract_function(
        //   processed_content,
        //   extract_single_line_code
        // );
        // processed_content = apply_extract_function(
        //   processed_content,
        //   extract_HTML
        // );
        processed_content = apply_extract_function(
          processed_content,
          extract_LaTeX
        );
        return processed_content;
      };
      let processed_content = extract_and_merge(raw_content);
      for (let i = 0; i < processed_content.length; i++) {
        if (processed_content[i].type === "HTML") {
          processed_content[i].component = (
            <div key={i} style={{ display: "block" }}>
              <HTMLSection>{processed_content[i].content}</HTMLSection>
            </div>
          );
        } else if (processed_content[i].type === "CODE") {
          processed_content[i].component = (
            <div key={i} style={{ display: "block" }}>
              <CodeSection language={processed_content[i].language}>
                {processed_content[i].content}
              </CodeSection>
            </div>
          );
        } else if (processed_content[i].type === "SLCODE") {
          processed_content[i].component = (
            <div
              key={i}
              style={{
                display: "inline",
                position: "relative",
                top: default_font_size / 2,
              }}
            >
              <SingleLineCodeSection language={processed_content[i].language}>
                {processed_content[i].content}
              </SingleLineCodeSection>
            </div>
          );
        } else if (processed_content[i].type === "LaTeX") {
          processed_content[i].component = (
            <div key={i} style={{ display: "inline-block" }}>
              <LaTeXSection>{processed_content[i].content}</LaTeXSection>
            </div>
          );
        } else if (processed_content[i].type === "TXT") {
          processed_content[i].component = (
            <div key={i} style={{ display: "inline" }}>
              <TextSection>{processed_content[i].content}</TextSection>
            </div>
          );
        } else if (processed_content[i].type === "THINK") {
          processed_content[i].component = (
            <div key={i} style={{ display: "inline" }}>
              <ThinkingSection>{processed_content[i].content}</ThinkingSection>
            </div>
          );
        } else {
          processed_content[i].component = (
            <div key={i} style={{ display: "inline" }}>
              <MarkDownSection>{processed_content[i].content}</MarkDownSection>
            </div>
          );
        }
      }
      return processed_content.map((content) => content.component);
    };
    setProcessedContent(process_content(children));
  }, [children, style]);

  return (
    <div
      style={{
        position: "relative",

        top: 0,
        left: 0,
        right: 0,

        /* { style } --------------------------------------------------------------------- */
        padding: `${default_font_size}px`,
        borderRadius: `${default_border_radius + 4}px`,
        backgroundColor:
          style && style.backgroundColor
            ? style.backgroundColor
            : `rgb(${R + default_forground_color_offset}, ${
                G + default_forground_color_offset
              }, ${B + default_forground_color_offset})`,
        color: `rgb(${R + default_font_color_offset}, ${
          G + default_font_color_offset
        }, ${B + default_font_color_offset})`,

        overflow: "hidden",
      }}
    >
      {processedContent}
    </div>
  );
};

export default Markdown;
