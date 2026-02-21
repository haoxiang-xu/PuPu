import { useState, useEffect, useContext, useCallback } from "react";

/* { Constants } ------------------------------------------------------------------------------------------------------------- */
import { fileTypeSVGs, LogoSVGs, UISVGs } from "./icon_manifest";
/* { Constants } ------------------------------------------------------------------------------------------------------------- */

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

const Icon = ({ src, color, ...props }) => {
  const { theme } = useContext(ConfigContext);

  const [component, setComponent] = useState(
    <div className="mini-ui-img-icon" {...props} />,
  );

  const fetch_icon = useCallback(async () => {
    try {
      let svg = null;
      if (src in UISVGs) {
        const SVG = await UISVGs[src];
        setComponent(
          <SVG
            className="mini-ui-svg-icon"
            fill={color ? color : theme?.icon?.color}
            style={{ width: "100%", height: "100%", display: "block" }}
          ></SVG>,
        );
      } else if (src in LogoSVGs) {
        const SVG = await LogoSVGs[src];
        setComponent(
          <SVG
            className="mini-ui-svg-icon"
            fill={color ? color : theme?.icon?.color}
            style={{ width: "100%", height: "100%", display: "block" }}
          ></SVG>,
        );
      } else if (src in fileTypeSVGs) {
        svg = await fileTypeSVGs[src]();
        setComponent(
          <img
            className="mini-ui-img-icon"
            src={svg.default}
            alt={src.replace(/_/g, " ")}
            draggable={false}
            style={{
              height: "100%",
              width: "100%",
            }}
          />,
        );
      } else {
        svg = await import(`./SVGs/${src}.svg`);
        setComponent(
          <img
            className="mini-ui-img-icon"
            src={svg.default}
            alt={src.replace(/_/g, " ")}
            draggable={false}
            style={{
              height: "100%",
              width: "100%",
            }}
          />,
        );
      }
    } catch (error) {
      console.error(
        "[Error occurred while fetching SVG file BUILTIN_COMPONENTs/icon/icon.js]:",
        error,
      );
    }
  }, [src, theme, color]);
  useEffect(() => {
    if (!src) return;
    try {
      if (
        src.toLowerCase() === "null" ||
        src.toLowerCase() === "undefined" ||
        src.toLowerCase() === "none" ||
        src === "" ||
        src.toLowerCase() === "placeholder" ||
        src.toLowerCase() === "nan"
      ) {
        setComponent(<div className="mini-ui-img-icon placeholder" />);
      } else if (
        src.indexOf("png") === 1 ||
        src.indexOf("jpg") === 1 ||
        src.indexOf("jpeg") === 1
      ) {
        setComponent(
          <img
            className="mini-ui-img-icon"
            src={src}
            alt={src.replace(/_/g, " ")}
            draggable={false}
            style={{
              height: "100%",
              width: "100%",
            }}
          />,
        );
      } else {
        fetch_icon();
      }
    } catch (error) {
      console.error(
        "[Error occurred while setting icon source BUILTIN_COMPONENTs/icon/icon.js]:",
        error,
      );
    }
  }, [src, theme, fetch_icon]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...props.style,
        color: color,
      }}
    >
      {component}
    </div>
  );
};

export default Icon;
