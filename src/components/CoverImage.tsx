import { useState, type ImgHTMLAttributes } from "react";

export function CoverImage({ src, className, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [settled, setSettled] = useState<string>();
  return <img {...props} src={src} className={(className ?? "") + (src && settled !== src ? " cover-pending" : "")}
    onLoad={event => { setSettled(src); onLoad?.(event); }}
    onError={event => {
      const previous = event.currentTarget.src;
      onError?.(event);
      if (previous === event.currentTarget.src) setSettled(src);
    }} />;
}
