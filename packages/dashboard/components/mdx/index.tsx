import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import { CodeBlock } from '@/components/system/CodeBlock';

// Components available inside content/**/*.mdx. Unknown capitalised tags fail
// the build (lib/content/mdx.ts). Keep this list in step with KNOWN_COMPONENTS.

type Lang = 'bash' | 'json' | 'diff' | 'ts' | 'text';
const LANGS: readonly string[] = ['bash', 'json', 'diff', 'ts', 'text'];

function langFrom(className?: string): Lang {
  const m = /language-([a-z0-9]+)/.exec(className ?? '');
  const raw = m?.[1] ?? 'text';
  if (raw === 'sh' || raw === 'shell' || raw === 'zsh' || raw === 'powershell' || raw === 'cmd' || raw === 'bat') return 'bash';
  if (raw === 'typescript' || raw === 'tsx') return 'ts';
  return (LANGS.includes(raw) ? raw : 'text') as Lang;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

function Pre({ children }: { children?: ReactNode }) {
  const child = children as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
  const lang = langFrom(child?.props?.className);
  return (
    <div className="not-prose my-s4">
      <CodeBlock code={textOf(child?.props?.children)} lang={lang} />
    </div>
  );
}

function Table({ children }: { children?: ReactNode }) {
  return (
    <div tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens" className="my-s4 overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

function A({ href = '', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a {...rest} href={href} rel="noopener">
        {children}
      </a>
    );
  }
  if (href.startsWith('#')) return <a {...rest} href={href}>{children}</a>;
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}

/** Answer-first lead paragraph. */
function Lead({ children }: { children?: ReactNode }) {
  return <div className="not-prose mb-s4 text-body-l text-fg">{children}</div>;
}

function Note({ children }: { children?: ReactNode }) {
  return <aside className="not-prose my-s4 border-l border-rule-strong pl-s3 text-body-s text-fg-soft">{children}</aside>;
}

export const mdxComponents = { pre: Pre, table: Table, a: A, Lead, Note };
