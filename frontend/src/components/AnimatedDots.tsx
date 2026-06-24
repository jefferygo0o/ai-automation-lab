import { cn } from "../lib/utils";

interface Props {
  /** Use black background with white dots (for dark/primary buttons) */
  invert?: boolean;
  className?: string;
  size?: number;
}

export default function AnimatedDots({ invert, className, size = 20 }: Props) {
  const bg = invert ? "#111" : "#f5f5f0";
  const fg = invert ? "#fff" : "#111";
  const viewBox = 50;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{`
          .box { fill: ${fg}; }
          @keyframes blink1 {
            0%, 100% { opacity: 1; }
            30% { opacity: 0; }
            70% { opacity: 1; }
          }
          @keyframes blink2 {
            0%, 100% { opacity: 1; }
            45% { opacity: 0; }
            60% { opacity: 1; }
          }
          @keyframes blink3 {
            0%, 100% { opacity: 1; }
            10% { opacity: 0; }
            25% { opacity: 1; }
            50% { opacity: 0; }
            65% { opacity: 1; }
          }
          @keyframes blink4 {
            0%, 100% { opacity: 1; }
            20% { opacity: 0; }
            40% { opacity: 1; }
            80% { opacity: 0; }
            90% { opacity: 1; }
          }
          @keyframes blink5 {
            0%, 100% { opacity: 1; }
            15% { opacity: 0; }
            35% { opacity: 1; }
            55% { opacity: 0; }
            75% { opacity: 1; }
          }
          @keyframes blink6 {
            0%, 100% { opacity: 1; }
            5% { opacity: 0; }
            20% { opacity: 1; }
            40% { opacity: 0; }
            60% { opacity: 1; }
            85% { opacity: 0; }
            95% { opacity: 1; }
          }
          @keyframes blink7 {
            0%, 100% { opacity: 1; }
            25% { opacity: 0; }
            50% { opacity: 1; }
            75% { opacity: 0; }
            87% { opacity: 1; }
          }
          @keyframes blink8 {
            0%, 100% { opacity: 1; }
            8% { opacity: 0; }
            18% { opacity: 1; }
            35% { opacity: 0; }
            48% { opacity: 1; }
            62% { opacity: 0; }
            78% { opacity: 1; }
            92% { opacity: 0; }
          }
          .b1 { animation: blink1 1.8s ease-in-out infinite; }
          .b2 { animation: blink2 2.4s ease-in-out infinite; }
          .b3 { animation: blink3 1.2s ease-in-out infinite; }
          .b4 { animation: blink4 3.0s ease-in-out infinite; }
          .b5 { animation: blink5 2.0s ease-in-out infinite; }
          .b6 { animation: blink6 1.5s ease-in-out infinite; }
          .b7 { animation: blink7 2.8s ease-in-out infinite; }
          .b8 { animation: blink8 1.1s ease-in-out infinite; }
        `}</style>
      </defs>
      <rect width="25" height="25" fill={bg} rx="12" ry="12" />
      <rect className="box b1" x="2" y="5" width="6" height="6" rx="6" ry="6" />
      <rect className="box b2" x="15" y="5" width="6" height="6" rx="6" ry="6" />
      <rect className="box b3" x="2" y="15" width="6" height="6" rx="6" ry="6" />
      <rect className="box b4" x="15" y="15" width="6" height="6" rx="6" ry="6" />
      <rect className="box b5" x="2" y="25" width="6" height="6" rx="6" ry="6" />
      <rect className="box b6" x="15" y="25" width="6" height="6" rx="6" ry="6" />
      <rect className="box b7" x="2" y="35" width="6" height="6" rx="6" ry="6" />
      <rect className="box b8" x="15" y="35" width="6" height="6" rx="6" ry="6" />
    </svg>
  );
}
