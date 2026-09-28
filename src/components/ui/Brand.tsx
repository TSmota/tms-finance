import { ChartNoAxesCombined } from "lucide-react";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark"><ChartNoAxesCombined size={22} strokeWidth={2.3} aria-hidden /></span>
      <span>TMS <span className="brand-secondary">Finance</span></span>
    </span>
  );
}
