import { useEffect, type ReactElement, type ReactNode } from 'react';

/**
 * A bottom sheet: content rises from the bottom edge so its actions sit under
 * the thumb (primary actions in the bottom third, docs/ROADMAP.md).
 */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; label?: string }): ReactElement {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={props.label ?? props.title}>
        <div className="sheet-head">
          <h2 className="sheet-title">{props.title}</h2>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}
