import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
}

const components: Components = {
  code: ({ className, children, ...rest }) => {
    const isInline = !className;
    if (isInline) {
      return <code className="bg-paper-100 border border-line-soft px-1.5 py-px rounded-sm text-xs text-ink-800" {...rest}>{children}</code>;
    }
    const lang = (className ?? "").replace("language-", "").replace("hljs ", "");
    return (
      <div className="my-2 group">
        {lang && (
          <div className="flex items-center h-6 px-3 border border-b-0 border-line rounded-t-sm bg-paper-100 text-2xs font-mono text-ink-400 uppercase tracking-wider">
            {lang}
          </div>
        )}
        <pre className={`overflow-x-auto ${lang ? "rounded-t-none" : ""} border border-line bg-paper-100 p-3 text-xs leading-relaxed text-ink-800`}>
          <code className={className} {...rest}>{children}</code>
        </pre>
      </div>
    );
  },
  pre: ({ children }) => <>{children}</>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 pl-5 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 pl-5 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="text-lg font-semibold mt-4 mb-2 text-ink-900">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5 text-ink-900">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1 text-ink-900">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-medium mt-2 mb-1 text-ink-800">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-line-strong text-ink-500 italic">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-ink-700 underline underline-offset-2 decoration-line-strong hover:text-ink-900" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-line-soft" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto border border-line rounded-sm">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-paper-100 border-b border-line">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-line-soft last:border-b-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-1.5 text-left text-2xs font-medium uppercase tracking-widest text-ink-500">{children}</th>,
  td: ({ children }) => <td className="px-3 py-1.5 text-sm text-ink-800">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold text-ink-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

export default function MarkdownContent({ content }: MarkdownContentProps) {
  // Render file mentions as chips even inside markdown
  const transformed = content.replace(
    /`file\s+'([^']+)'`/g,
    (_m, path) => `[\`file '${path}'\`](${path})`
  );

  return (
    <div className="prose-custom text-sm leading-relaxed text-ink-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {transformed}
      </ReactMarkdown>
    </div>
  );
}
