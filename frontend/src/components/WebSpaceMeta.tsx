import { type SpaceRoute } from "../api";
import { Info, X, Copy, Check, Eye, EyeOff, Globe, Code2, Calendar, Hash } from "lucide-react";

interface Props {
  route: SpaceRoute;
  ownerId: string;
  routeUrl: string;
  onClose?: () => void;
  onCopy: (id: string) => void;
  copied: boolean;
  onTogglePublic: () => void;
}

function fmt(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

export function WebSpaceMeta({ route, ownerId, routeUrl, onClose, onCopy, copied, onTogglePublic }: Props) {
  const lineCount = route.code ? route.code.split("\n").length : 0;
  const byteSize = new Blob([route.code || ""]).size;
  return (
    <div className="h-full flex flex-col">
      <div className="h-9 border-b border-line flex items-center justify-between px-3 shrink-0 bg-paper-100">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-ink-400" />
          <span className="text-xs font-medium">Meta</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost btn-icon" title="Close meta">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        <Section title="Identity">
          <Row icon={Hash} label="ID" value={<code className="text-2xs">{route.id}</code>} />
          <Row icon={Globe} label="Path" value={<code className="text-2xs">{route.path || "/"}</code>} />
          <Row icon={Code2} label="Type" value={<span className="uppercase tracking-wider">{route.type}</span>} />
        </Section>

        <Section title="Visibility">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Status</span>
            <span className={`badge ${route.public ? "badge-ok" : "badge-mute"} text-2xs`}>
              {route.public ? "public" : "private"}
            </span>
          </div>
          <button onClick={onTogglePublic} className="btn btn-ghost btn-sm w-full justify-center">
            {route.public ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {route.public ? "Make private" : "Make public"}
          </button>
        </Section>

        <Section title="Share URL">
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={routeUrl}
              className="input h-7 flex-1 text-2xs font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button onClick={() => onCopy(route.id)} className="btn btn-ghost btn-icon" title="Copy URL">
              {copied ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <p className="text-2xs text-ink-400 mt-1.5 leading-relaxed">
            The <code>/ws/{ownerId}/…</code> endpoint requires your bearer token, so this URL only works
            while you're signed in on this device. Flip "public" to share externally.
          </p>
        </Section>

        <Section title="Source">
          <Row label="Lines" value={lineCount.toString()} />
          <Row label="Size" value={`${(byteSize / 1024).toFixed(1)} KB`} />
        </Section>

        <Section title="History">
          <Row icon={Calendar} label="Updated" value={fmt(route.updatedAt as any)} />
          <Row icon={Calendar} label="Created" value={fmt(route.createdAt as any)} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-400 mb-1.5">{title}</div>
      <div className="space-y-1.5 border border-line rounded-sm p-2.5 bg-paper-100">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon?: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-ink-500 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
      <span className="text-ink-900 truncate text-right">{value}</span>
    </div>
  );
}
