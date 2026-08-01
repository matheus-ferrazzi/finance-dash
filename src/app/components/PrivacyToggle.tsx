'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(document.documentElement.hasAttribute('data-hide-money'));
  }, []);

  function toggle() {
    const nv = !hidden;
    setHidden(nv);
    const el = document.documentElement;
    try {
      if (nv) {
        el.setAttribute('data-hide-money', '');
        localStorage.setItem('hideMoney', '1');
      } else {
        el.removeAttribute('data-hide-money');
        localStorage.removeItem('hideMoney');
      }
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted hover:text-text hover:bg-surface-2 transition-colors"
    >
      {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
