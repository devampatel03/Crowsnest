// Static SVG topographic-contour-line texture. Purely decorative — no animation,
// cheap to render, and must not intercept pointer events.
export function TopoBackground({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ''}`} aria-hidden>
      <svg
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/5">
          <path d="M-40,60 C60,20 140,100 240,60 C320,30 380,80 440,50" />
          <path d="M-40,120 C40,90 120,150 220,110 C300,80 380,130 440,100" />
          <path d="M-40,190 C70,150 150,220 250,180 C330,150 390,200 440,170" />
          <path d="M-40,260 C50,300 130,240 230,280 C310,310 390,260 440,290" />
          <path d="M-40,330 C60,370 140,310 240,350 C320,380 380,330 440,360" />
          <path d="M-40,420 C40,380 120,450 220,410 C300,380 380,440 440,400" />
          <path d="M-40,500 C70,540 150,480 250,520 C330,550 390,500 440,530" />
          <path d="M-40,580 C50,540 130,610 230,570 C310,540 390,600 440,570" />
          <path d="M-40,660 C60,700 140,640 240,680 C320,710 380,660 440,690" />
          <path d="M-40,740 C40,700 120,760 220,730 C300,700 380,750 440,720" />
        </g>
      </svg>
    </div>
  );
}
