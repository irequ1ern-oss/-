import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/Icon';
export function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const trigger = document.activeElement;
    el.showModal();
    return () => {
      el.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      class="rq-modal rq-sheet"
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Закрыть" onClick={close}>
          <Icon name="x" size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
