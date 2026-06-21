"use client";

import type { PendingAction } from "@/lib/types";

interface ConfirmationModalProps {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}

const riskColors: Record<string, { border: string; bg: string; text: string; label: string }> = {
  low: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    label: "Low Risk",
  },
  medium: {
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    label: "Medium Risk",
  },
  high: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-400",
    label: "High Risk",
  },
};

export default function ConfirmationModal({
  action,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const riskStyle = riskColors[action.riskLevel] || riskColors.medium;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-aura-border/60 bg-aura-surface/95 backdrop-blur-xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full ${riskStyle.bg} border ${riskStyle.border} flex items-center justify-center`}>
              <svg className={`w-5 h-5 ${riskStyle.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {action.riskLevel === "high" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-aura-text">Confirmation Required</h3>
              <span className={`text-xs font-medium ${riskStyle.text}`}>
                {riskStyle.label}
              </span>
            </div>
          </div>

          <p className="text-sm text-aura-text/80 mb-2">
            {action.description || "This action requires your confirmation before proceeding."}
          </p>

          {/* Details */}
          {action.details && Object.keys(action.details).length > 0 && (
            <div className={`mt-3 p-3 rounded-lg ${riskStyle.bg} border ${riskStyle.border}`}>
              <p className="text-xs font-medium text-aura-muted mb-2 uppercase tracking-wider">Details:</p>
              <pre className="text-xs text-aura-text/70 whitespace-pre-wrap font-sans">
                {typeof action.details === "string"
                  ? action.details
                  : JSON.stringify(action.details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-aura-border text-aura-text/70 hover:text-aura-text hover:bg-aura-surface transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all ${
              action.riskLevel === "high"
                ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                : action.riskLevel === "medium"
                ? "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                : "bg-gradient-to-r from-aura-primary to-aura-secondary hover:opacity-90"
            }`}
          >
            Confirm & Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
