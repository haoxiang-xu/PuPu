import React, { useState, useEffect, useRef, useContext } from "react";
/* { import external render libraries } ------------------------------------------------- */
import Latex from "react-latex-next";
import "katex/dist/katex.min.css";
import Tag from "../tag/tag";
import {
  CodeBlock,
  dracula,
  nord,
  a11yDark,
  tomorrowNight,
  vs2015,
  github,
  codepen,
} from "react-code-blocks";
import ReactShowdown from "react-showdown";
import Icon from "../icon/icon";
import PulseLoader from "react-spinners/PulseLoader";
import { LOADING_TAG } from "./const";
/* { style } --------------------------------------------------------------------- */
import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

const R = 30;
const G = 30;
const B = 30;

const default_font_size = 12;
const default_border_radius = 10;
const default_tag_max_Width = 128;

const CodeSection = ({ language, children }) => {
  const { theme, RGB, colorOffset, markdown } = useContext(ConfigContexts);
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(225, 225, 225, 0)`,
  });

  useEffect(() => {
    if (onClicked) {
      setStyle({
        backgroundColor: markdown.copy_button.backgroundColor_onActive,
        border: markdown.copy_button.border_onActive,
      });
    } else if (onHover) {
      setStyle({
        backgroundColor: markdown.copy_button.backgroundColor_onHover,
        border: markdown.copy_button.border_onHover,
      });
    } else {
      setStyle({
        backgroundColor: markdown.copy_button.backgroundColor,
        border: markdown.copy_button.border,
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
          boxShadow: markdown.code_section.tag_boxShadow,
          backgroundColor: markdown.code_section.tag_backgroundColor,
        }}
      >
        <span
          style={{
            userSelect: "none",
            position: "absolute",
            top: "50%",

            transform: "translateY(-50%)",
            left: 12,

            fontSize: `${default_font_size + 4}px`,
            fontWeight: "bold",
            color: `rgb(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 0.64)`,
          }}
        >
          {language}
        </span>
        <div
          style={{
            transition: "border 0.32s cubic-bezier(0.32, 1, 0.32, 1)",
            position: "absolute",
            top: 5,
            right: 5,

            width: 36,
            padding: `${default_font_size}px ${default_font_size}px ${default_font_size}px ${default_font_size}px`,
            border: style.border,
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
              color: `rgb(${RGB.R + colorOffset.font}, ${
                RGB.G + colorOffset.font
              }, ${RGB.B + colorOffset.font})`,
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
        theme={theme === "dark_theme" ? dracula : github}
        wrapLines={false}
        codeBlock
        customStyle={{
          fontSize: `${default_font_size + 2}px`,
          fontFamily:
            "'Fira Code', 'JetBrains Mono', 'Source Code Pro', monospace",
          backgroundColor: markdown.code_section.backgroundColor,
          paddingTop: 36,
          paddingLeft: 6,
          borderRadius: default_border_radius,
          overflowX: "auto",
          overflowY: "hidden",
          maxWidth: "100%",
          boxShadow: markdown.code_section.boxShadow,
          border: markdown.code_section.border,
        }}
      />
    </div>
  );
};
const SingleLineCodeSection = ({ language, children }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
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
        color: `rgb(${RGB.R + colorOffset.font}, ${RGB.G + colorOffset.font}, ${
          RGB.B + colorOffset.font
        })`,
        backgroundColor: `rgb(${RGB.R - 8}, ${RGB.G - 8}, ${RGB.B - 8})`,
        borderRadius: default_border_radius,
        overflowY: "hidden",
      }}
    />
  );
};
const MarkDownSection = ({ children }) => {
  const { markdown } = useContext(ConfigContexts);
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
    .markdown-section code {
      background-color: ${markdown.a_backgroundColor_onHover};
      color: ${markdown.a_color};
      padding: 1px 3px;
      margin: 3px;
      border-radius: 4px;
    }
    .markdown-section a {
      color:  ${markdown.a_color};
      padding: 1px 3px;
      margin: 3px; 
      border-radius: 4px;
      background-color: ${markdown.a_backgroundColor};
    }
    .markdown-section a:hover {
      transition: all 0.16s cubic-bezier(0.32, 1, 0.32, 1);
      color: ${markdown.a_color};
      padding: 1px 3px;
      margin: 3px; 
      border-radius: 4px;
      background-color: ${markdown.a_backgroundColor_onHover};
    }  
    `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [markdown]);
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
    .code-section ::-webkit-scrollbar {
      height: 18px;
    }
    .code-section::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .code-section ::-webkit-scrollbar-thumb {
      transition: background-color 0.64s cubic-bezier(0.32, 1, 0.32, 1);
      background-color: ${markdown.code_section.scrolling_bar_backgroundColor};
      border-radius: 10px;
      border: 6px solid ${markdown.code_section.backgroundColor};
    }
    .code-section ::-webkit-scrollbar-thumb:hover {
      transition: background-color 0.64s cubic-bezier(0.32, 1, 0.32, 1);
      background-color: ${markdown.code_section.scrolling_bar_backgroundColor_onHover};
    }
  `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [markdown]);

  return (
    <div className="markdown-section" style={{ display: "inline-block" }}>
      <ReactShowdown
        markdown={children}
        options={{
          simplifiedAutoLink: true,
          tables: true,
          strikethrough: true,
          tasklists: true,
        }}
        components={{
          a: (props) => {
            if (props.href?.startsWith("#")) {
              return (
                <a
                  href={props.href}
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.hash = props.href;
                  }}
                >
                  {props.children}
                </a>
              );
            }
            return <a {...props}>{props.children}</a>;
          },
        }}
      />
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
const ThinkingSection = ({ index, children }) => {
  const { RGB, colorOffset, markdown, span } = useContext(ConfigContexts);
  const { set_expand_section_message, sectionData } = useContext(DataContexts);
  const [isExpanded, setIsExpanded] = useState(
    sectionData.messages[index].expanded
  );
  const [onClick, setOnClick] = useState(false);
  const [onHover, setOnHover] = useState(false);

  const [style, setStyle] = useState({
    backgroundColor: "none",
  });
  useEffect(() => {
    if (onClick) {
      setStyle({
        backgroundColor: `rgba(${RGB.R + colorOffset.middle_ground * 2}, ${
          RGB.G + colorOffset.middle_ground * 2
        }, ${RGB.B + colorOffset.middle_ground * 2}, 0.72)`,
        border: markdown.think_section.border_onActive,
      });
    } else if (onHover) {
      setStyle({
        backgroundColor: `rgba(${RGB.R + colorOffset.middle_ground}, ${
          RGB.G + colorOffset.middle_ground
        }, ${RGB.B + colorOffset.middle_ground}, 0.64)`,
        border: markdown.think_section.border_onHover,
      });
    } else {
      setStyle({
        backgroundColor: `rgba(${RGB.R + colorOffset.middle_ground}, ${
          RGB.G + colorOffset.middle_ground
        }, ${RGB.B + colorOffset.middle_ground}, 0)`,
        border: markdown.think_section.border,
      });
    }
  }, [onClick, onHover]);

  return (
    <div
      style={{
        display: "inline-block",
        backgroundColor: isExpanded
          ? `rgba(${RGB.R + colorOffset.middle_ground / 2}, ${
              RGB.G + colorOffset.middle_ground / 2
            }, ${RGB.B + colorOffset.middle_ground / 2}, 0.64)`
          : `rgba(${RGB.R + colorOffset.middle_ground / 2}, ${
              RGB.G + colorOffset.middle_ground / 2
            }, ${RGB.B + colorOffset.middle_ground / 2}, 0)`,

        borderRadius: `${default_border_radius}px`,
        border: isExpanded
          ? markdown.think_section.border_onHover
          : markdown.think_section.border,
      }}
    >
      <div
        className="scrolling-space"
        style={{
          transition: "all 0.32s cubic-bezier(0.32, 1, 0.32, 1)",
          display: "inline-block",
          borderRadius: `${default_border_radius}px`,
          padding: `${default_font_size}px`,
          margin: isExpanded ? `32px 6px 0px 6px` : `0px 6px`,
          maxHeight: isExpanded ? "256px" : "8px",
          overflowY: "auto",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <ReactShowdown
          markdown={children}
          style={{
            color: span.ignore.color,
          }}
        />
      </div>
      <span
        style={{
          position: "absolute",
          top: "17px",
          left: "44px",

          color: span.ignore.color,
        }}
      >
        Thought process
      </span>
      <Icon
        src="arrow"
        style={{
          transition:
            "backgroundColor 0.32s cubic-bezier(0.32, 1, 0.32, 1), border 0.32s cubic-bezier(0.32, 1, 0.32, 1)",
          position: "absolute",
          top: "29px",
          left: "29px",
          transform: isExpanded
            ? "translate(-50%, -50%) rotate(-90deg)"
            : "translate(-50%, -50%) rotate(90deg)",
          padding: 4,
          borderRadius: default_border_radius - 3,
          backgroundColor: style.backgroundColor,
          border: style.border,
          userSelect: "none",
          cursor: "pointer",
        }}
        onMouseEnter={() => setOnHover(true)}
        onMouseLeave={() => {
          setOnHover(false);
          setOnClick(false);
        }}
        onMouseDown={() => setOnClick(true)}
        onMouseUp={() => setOnClick(false)}
        onClick={() => {
          set_expand_section_message(index, !isExpanded);
          setIsExpanded(!isExpanded);
        }}
      />
    </div>
  );
};
const CustomizedTagSection = ({ tag }) => {
  const { markdown } = useContext(ConfigContexts);
  const [component, setComponent] = useState(null);

  useEffect(() => {
    if (tag === LOADING_TAG) {
      setComponent(
        <PulseLoader
          color={markdown.loader.color}
          size={7}
          speedMultiplier={0.8}
        />
      );
    } else {
      setComponent(<TagSection>{tag}</TagSection>);
    }

    return () => {
      setComponent(null);
    };
  }, [tag]);

  return component;
};

const Markdown = ({ children, index, style }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
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

        let end_code_block_index =
          sliced_content.indexOf(end_code_block) + start_code_block_index + 3;
        if (start_code_block_index === -1) return null;
        if (end_code_block_index === -1 + start_code_block_index + 3)
          end_code_block_index = raw_content.length;
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
    const extract_customize_tag = (raw_content) => {
      const find_first_tag = (raw_content) => {
        const start_tag = "<<<";
        const end_tag = ">>>";
        const start_tag_index = raw_content.indexOf(start_tag);

        const sliced_content = raw_content.slice(start_tag_index + 1);

        const end_tag_index =
          sliced_content.indexOf(end_tag) + start_tag_index + 1;
        if (start_tag_index === -1) return null;
        if (end_tag_index === -1) return null;
        if (end_tag_index < start_tag_index) return null;

        return raw_content.slice(
          start_tag_index,
          end_tag_index + end_tag.length
        );
      };

      let unprocessed_content = raw_content;
      let processed_content = [];

      while (find_first_tag(unprocessed_content) !== null) {
        const tag = find_first_tag(unprocessed_content);
        const start_index = unprocessed_content.indexOf(tag);
        const end_index = start_index + tag.length;

        const pre_content = unprocessed_content.slice(0, start_index);
        const post_content = unprocessed_content.slice(end_index);
        const tag_content = unprocessed_content.slice(start_index, end_index);

        if (pre_content.length > 0) {
          processed_content.push({ type: "RAW", content: pre_content });
        }
        processed_content.push({
          type: "CUSTOMIZED_TAG",
          content: tag_content,
        });
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
          extract_customize_tag
        );
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
        // processed_content = apply_extract_function(
        //   processed_content,
        //   extract_LaTeX
        // );
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
              <ThinkingSection index={index}>
                {processed_content[i].content}
              </ThinkingSection>
            </div>
          );
        } else if (processed_content[i].type === "CUSTOMIZED_TAG") {
          processed_content[i].component = (
            <div key={i} style={{ display: "inline" }}>
              <CustomizedTagSection tag={processed_content[i].content} />
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
  }, [children, index, style]);

  return (
    <div
      style={{
        position: "relative",

        top: 0,
        left: 0,
        right: 0,

        /* { style } --------------------------------------------------------------------- */
        padding: `${default_font_size}px`,
        borderRadius: `${default_border_radius + 2}px`,
        backgroundColor:
          style && style.backgroundColor
            ? style.backgroundColor
            : `rgb(${RGB.R + colorOffset.middle_ground}, ${
                RGB.G + colorOffset.middle_ground
              }, ${RGB.B + colorOffset.middle_ground})`,
        color: `rgb(${RGB.R + colorOffset.font}, ${RGB.G + colorOffset.font}, ${
          RGB.B + colorOffset.font
        })`,

        overflow: "hidden",
      }}
    >
      {processedContent}
    </div>
  );
};

export default Markdown;
