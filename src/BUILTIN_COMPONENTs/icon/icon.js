import React, { useState, useEffect, useRef, useContext, use } from "react";
import { iconManifest } from "./icon_manifest";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";

const Icon = ({ src, ...props }) => {
  const { theme } = useContext(ConfigContexts);

  const [iconSrc, setIconSrc] = useState(null);
  const [isIconLoaded, setIsIconLoaded] = useState(false);
  const iconRef = useRef(null);

  useEffect(() => {
    const fetchSVG = async () => {
      try {
        let svg = null;
        if (theme === "dark_theme") {
          svg = await iconManifest[src]();
        } else {
          svg = await iconManifest[src + "_"]();
        }
        setIconSrc(svg.default);
        setIsIconLoaded(true);
      } catch (error) {
        console.error(error);
      }
    };
    if (!src) return;
    try {
      if (src.indexOf("png") == -1) {
        fetchSVG();
      } else {
        setIconSrc(src);
        setIsIconLoaded(true);
      }
    } catch (error) {
      console.error(error);
    }
  }, [src, theme]);

  if (!isIconLoaded) return null;
  return (
    <img
      ref={iconRef}
      src={iconSrc}
      alt={src}
      draggable={false}
      {...props}
    />
  );
};

export default Icon;
