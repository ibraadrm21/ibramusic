import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  suggestions: string[];
  label: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function SearchField({ value, suggestions, label, autoFocus, onChange, onSubmit }: SearchFieldProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const query = normalize(value.trim());
  const matches = [...new Set(suggestions)].filter(item => {
    const candidate = normalize(item);
    return candidate !== query && candidate.includes(query);
  }).slice(0, 6);
  const open = focused && matches.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = open && active >= 0 ? matches[active] : value;
    if (!next?.trim()) return;
    setFocused(false);
    setActive(-1);
    onSubmit(next.trim());
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(false);
      setActive(-1);
    } else if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setFocused(true);
      const next = event.key === "ArrowDown" ? (active + 1) % matches.length : (active <= 0 ? matches.length - 1 : active - 1);
      setActive(next);
    }
  }

  return (
    <form role="search" className="relative w-full" onSubmit={submit}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        value={value}
        placeholder={label}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setActive(-1); }}
        onKeyDown={handleKey}
        onChange={event => {
          setActive(-1);
          setFocused(true);
          onChange(event.target.value);
        }}
        className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-11 text-base text-white placeholder:text-gray-400 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Limpiar búsqueda" className="absolute inset-y-0 right-0 grid w-11 place-items-center text-gray-300" onClick={() => onChange("")}>
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/15 bg-brand-darkBg p-1 shadow-xl">
          {matches.map((item, index) => (
            <li
              key={item}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10 aria-selected:bg-white/15"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                setFocused(false);
                setActive(-1);
                onSubmit(item);
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
