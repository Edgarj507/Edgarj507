/** +/−/fit buttons shared by the MapLibre radar and the SVG fallback radar. */
export function ZoomControls({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  const b = 'grid h-8 w-8 place-items-center border-white/10 text-[15px] font-bold text-white/80 hover:bg-white/10';
  return (
    <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-white/15 bg-black/60 backdrop-blur" role="group" aria-label="Map zoom">
      <button aria-label="Zoom in" onClick={onIn} className={`${b} border-b`}>+</button>
      <button aria-label="Zoom out" onClick={onOut} className={`${b} border-b`}>−</button>
      <button aria-label="Fit course" onClick={onFit} className={`${b} text-[10px]`}>⤢</button>
    </div>
  );
}
