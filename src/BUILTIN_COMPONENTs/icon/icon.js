import React, { useState, useEffect, useRef } from "react";
import { iconManifest } from "./icon_manifest";

const Icon = ({ src, ...props }) => {
  const [iconSrc, setIconSrc] = useState(null);
  const [isIconLoaded, setIsIconLoaded] = useState(false);
  const iconRef = useRef(null);

  useEffect(() => {
    const fetchSVG = async () => {
      try {
        const svg = await iconManifest[src]();
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
  }, [src]);

  if (!isIconLoaded) return null;
  return (
    <img ref={iconRef} src={iconSrc} alt={src} draggable={false} {...props} />
  );
};

export default Icon;
