import * as React from "react";

type P = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 14, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      {children}
    </svg>
  );
}

export const HeartIcon = (p: P) => (
  <Svg {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A4.5 4.5 0 0 0 12 5 4.5 4.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" /></Svg>
);
export const SwordIcon = (p: P) => (
  <Svg {...p}><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></Svg>
);
export const DpsIcon = (p: P) => (
  <Svg {...p}><path d="M3 17 9 11l4 4 8-8" /><path d="M14 7h7v7" /></Svg>
);
export const SpeedIcon = (p: P) => (
  <Svg {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></Svg>
);
export const ShieldIcon = (p: P) => (
  <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>
);
export const MagicIcon = (p: P) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>
);
export const TargetIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const ManaIcon = (p: P) => (
  <Svg {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></Svg>
);
export const StarIcon = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z" />
  </svg>
);
export const TierIcon = StarIcon;
export const CoinIcon = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
    <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M9.5 9.5h3a2 2 0 0 1 0 4h-2v3M10.5 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const InfoIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const SnowIcon = (p: P) => (
  <Svg {...p}><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19M12 6l-2 2m2-2 2 2m-2 10-2-2m2 2 2-2M6 12l2-2m-2 2 2 2m10-2-2-2m2 2-2 2" /></Svg>
);
export const RerollIcon = (p: P) => (
  <Svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></Svg>
);
export const PawIcon = (p: P) => (
  <Svg {...p}><circle cx="6.5" cy="11" r="1.7" /><circle cx="10.5" cy="7.5" r="1.7" /><circle cx="14.5" cy="7.5" r="1.7" /><circle cx="18" cy="11" r="1.7" /><path d="M8 16.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5c0 1.8-1.6 2.7-4 2.7s-4-.9-4-2.7Z" /></Svg>
);
export const GiftIcon = (p: P) => (
  <Svg {...p}><path d="M20 12v8H4v-8M2 8h20v4H2zM12 8v12M12 8s-1.5-4-4-4a2 2 0 0 0 0 4M12 8s1.5-4 4-4a2 2 0 0 1 0 4" /></Svg>
);
export const TrophyIcon = (p: P) => (
  <Svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></Svg>
);
export const MegaIcon = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
    <path d="M7 3h10l4 6-9 12L3 9z" fill="currentColor" opacity="0.25" />
    <path d="M7 3h10l4 6-9 12L3 9l4-6zM3 9h18M9 3l3 6 3-6M12 9v12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);
export const PokeballIcon = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M2.5 12h6M15.5 12h6" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
