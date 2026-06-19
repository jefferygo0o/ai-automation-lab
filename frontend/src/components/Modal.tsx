import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  open, onClose, title, children, footer, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    size === "sm" ? "max-w-sm" :
    size === "lg" ? "max-w-2xl" :
    size === "xl" ? "max-w-4xl" :
    "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-ink-900/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`card w-full ${widthClass} mx-4 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div className="flex items-center gap-3">
            <div className="eyebrow">Editor</div>
            <div className="text-sm font-medium">{title}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close">
            <X className="w-3.5 h-3.5 stroke-[1.75]" />
          </button>
        </div>
        <div className="card-body">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-line flex items-center justify-end gap-2 bg-paper-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
