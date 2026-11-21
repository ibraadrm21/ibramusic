import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: ModalProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const origin = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}
      className={(wide ? "w-[min(96vw,56rem)]" : "w-[min(94vw,32rem)]") + " m-auto max-h-[90dvh] overflow-y-auto glass-panel rounded-[var(--app-radius-xl)] border border-white/10 bg-brand-darkBg p-4 text-white shadow-xl backdrop:bg-black/80 sm:p-6"}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold">{title}</h2>
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-white/10" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" className="size-5" /></button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
