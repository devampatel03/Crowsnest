// Shared prose wrapper classes (docs, blog, glossary). Inline code wraps
// (typography sets it nowrap, which pushed long commands past a 375px
// viewport); code inside <pre> keeps its own horizontal scroller (CodeBlock).
export const PROSE =
  'prose max-w-prose min-w-0 break-words [&_:not(pre)>code]:whitespace-normal [&_:not(pre)>code]:break-words [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20 [&_li]:min-w-0 [&_td_a]:max-md:inline-flex [&_td_a]:max-md:min-h-11 [&_td_a]:max-md:items-center';
