'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition() {
  const pathname = usePathname();
  const barRef   = useRef(null);
  const prev     = useRef(pathname);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;

    const bar = barRef.current;
    if (!bar) return;

    // Reset
    bar.style.transition = 'none';
    bar.style.width      = '10%';
    bar.style.opacity    = '1';

    // Animate to near-complete
    const t1 = setTimeout(() => {
      bar.style.transition = 'width 0.25s ease-out';
      bar.style.width      = '85%';
    }, 10);

    // Complete and fade out
    const t2 = setTimeout(() => {
      bar.style.transition = 'width 0.15s ease-out';
      bar.style.width      = '100%';
    }, 300);

    const t3 = setTimeout(() => {
      bar.style.transition = 'opacity 0.2s ease';
      bar.style.opacity    = '0';
    }, 480);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [pathname]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: 3, zIndex: 99999, pointerEvents: 'none',
    }}>
      <div
        ref={barRef}
        style={{
          height: '100%',
          width: '0%',
          opacity: 0,
          background: 'linear-gradient(90deg, #1565c0 0%, #00796b 100%)',
          boxShadow: '0 0 10px rgba(21,101,192,0.5)',
        }}
      />
    </div>
  );
}
