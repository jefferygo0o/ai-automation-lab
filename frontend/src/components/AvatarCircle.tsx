import { Bot, User } from "lucide-react";

interface AvatarCircleProps {
  role: "user" | "assistant" | "system";
  label?: string;
}

export default function AvatarCircle({ role, label }: AvatarCircleProps) {
  if (role === "user") {
    return (
      <div className="w-7 h-7 rounded-full bg-ink-900 text-paper border border-ink-900 grid place-items-center shrink-0">
        <User className="w-3.5 h-3.5 stroke-[1.75]" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-paper-50 text-ink-600 border border-line grid place-items-center shrink-0">
      <Bot className="w-3.5 h-3.5 stroke-[1.75]" />
    </div>
  );
}
