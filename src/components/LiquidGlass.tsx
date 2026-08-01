import React from "react";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className = "",
  intensity = 0.4
}) => {
  const filterId = React.useId().replace(/:/g, "");

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* SVG Displacement Filter for genuine Liquid Glass effect */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.02"
              numOctaves="2"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={35 * intensity}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="0.5" result="smooth" />
            <feBlend in="SourceGraphic" in2="smooth" mode="overlay" />
          </filter>
        </defs>
      </svg>

      {/* Liquid glass layer container */}
      <div 
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-0"
        style={{
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(255, 255, 255, 0.06) 100%)",
          boxShadow: "inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1.5px 1px 0 rgba(0, 0, 0, 0.3), 0 20px 50px rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.18)"
        }}
      />

      {/* Specular glare & liquid sheen */}
      <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.15)_0%,transparent_60%)] pointer-events-none z-0" />
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/60 to-transparent pointer-events-none z-10" />

      {/* Content slot */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
};
