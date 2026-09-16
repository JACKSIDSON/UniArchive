import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 档案正文渲染（GitHub 风格 Markdown） */
export function MarkdownView({ content }: { content: string }): React.ReactElement {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** 敏感内容：默认模糊，点击后显示（规格书 UI 硬性要求） */
export function SensitiveText({
  children,
  hidden = true,
  className
}: {
  children: React.ReactNode;
  hidden?: boolean;
  className?: string;
}): React.ReactElement {
  const [revealed, setRevealed] = React.useState(!hidden);
  const blurred = hidden && !revealed;
  return (
    <span
      className={`${className ?? ''} ${blurred ? 'blur-sensitive cursor-pointer' : ''}`}
      onClick={() => blurred && setRevealed(true)}
      title={blurred ? '点击显示敏感内容' : undefined}
    >
      {children}
    </span>
  );
}
