import logoSrc from "@/assets/coastal-maverick-logo.png";
import { cn } from "@/lib/utils";

type Variant = "default" | "onDark";

export function Logo({
  className,
  variant = "default",
  size = 40,
  alt = "Coastal Maverick — Outdoor Advertising",
}: {
  className?: string;
  variant?: Variant;
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src={logoSrc}
      alt={alt}
      style={{ height: size, width: "auto" }}
      className={cn(
        "object-contain select-none",
        variant === "onDark" &&
          "rounded-md bg-card/95 p-1.5 shadow-elev-sm backdrop-blur",
        className,
      )}
      draggable={false}
    />
  );
}
