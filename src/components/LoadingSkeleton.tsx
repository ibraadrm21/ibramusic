type SkeletonLayout = "tracks" | "grid" | "detail" | "settings" | "stats" | "player" | "text" | "hero";

function Block({ className }: { className: string }) {
  return <div className={"rounded-lg skeleton-block " + className} />;
}

export function LoadingSkeleton({ layout, label = "Cargando…", count = 6, className = "" }: {
  layout: SkeletonLayout;
  label?: string;
  count?: number;
  className?: string;
}) {
  const slots = Array.from({ length: count }, (_, index) => index);
  const rows = <div className="grid gap-2">{slots.map(index => (
    <div key={index} className="flex items-center gap-3 px-2 py-2">
      <Block className="size-10 shrink-0" />
      <div className="grid flex-1 gap-2"><Block className={index % 2 ? "h-3 w-2/5" : "h-3 w-3/5"} /><Block className="h-2 w-1/4" /></div>
      <Block className="hidden h-2 w-12 sm:block" />
    </div>
  ))}</div>;
  let content;
  switch (layout) {
    case "tracks":
      content = rows;
      break;
    case "grid":
      content = <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">{slots.map(index => <div key={index} className="grid min-w-0 gap-2">
        <Block className="aspect-square w-full rounded-2xl" /><Block className="h-3 w-3/4" /><Block className="h-2 w-1/2" />
      </div>)}</div>;
      break;
    case "detail":
    case "hero":
      content = <><div className={"flex flex-col items-center gap-5 rounded-3xl border border-white/10 p-5 sm:flex-row" + (layout === "hero" ? " min-h-[200px]" : "")}>
        {layout === "detail" && <Block className="aspect-square w-32 shrink-0 sm:w-40" />}
        <div className="grid w-full max-w-md gap-3"><Block className="h-7 w-3/4" /><Block className="h-3 w-1/2" /><Block className="h-8 w-24 rounded-full" /></div>
      </div>{layout === "detail" && rows}</>;
      break;
    case "settings":
    case "stats":
      content = <><Block className="h-7 w-40" /><div className="grid gap-4 sm:grid-cols-2">{slots.map(index => <div key={index} className="grid gap-4 rounded-3xl border border-white/10 p-5">
        <Block className="h-4 w-2/3" /><Block className={layout === "stats" ? "h-20 w-full" : "h-8 w-full"} /><Block className="h-3 w-3/4" />
      </div>)}</div></>;
      break;
    case "player":
      content = <><Block className="mx-auto h-8 w-32 rounded-full" /><Block className="mx-auto aspect-square w-full max-w-80 rounded-2xl" />
        <Block className="h-5 w-3/4" /><Block className="h-3 w-1/3" /><Block className="h-1 w-full" /><Block className="mx-auto size-12 rounded-full" /></>;
      break;
    case "text":
      content = <div className="grid gap-4">{slots.map(index => <Block key={index} className={index % 3 ? "h-4 w-4/5" : "h-4 w-3/5"} />)}</div>;
  }
  return <div role="status" className={className}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="pointer-events-none grid gap-4 motion-safe:animate-pulse">{content}</div>
  </div>;
}
