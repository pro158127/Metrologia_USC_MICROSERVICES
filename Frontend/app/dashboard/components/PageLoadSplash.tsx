"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const READY_EVENT = "metrologia:module-ready";

/** Reports that a module's first screen data has settled (success or failure). */
export function useModuleSplashReady(moduleKey: string, ready: boolean) {
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (!ready) return;
    // Let sibling effects start their initial requests before releasing the cover.
    const frame = window.requestAnimationFrame(() => {
      if (!readyRef.current) return;
      window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { moduleKey } }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [moduleKey, ready]);
}

export function PageLoadSplash({ visible, moduleTitle }: { visible: boolean; moduleTitle: string }) {
  return (
    <div
      className={`page-load-splash ${visible ? "page-load-splash--visible" : "page-load-splash--hidden"}`}
      aria-hidden={!visible}
      aria-busy={visible}
      aria-live="polite"
    >
      <div className="page-load-splash__glow" aria-hidden="true" />
      <div className="page-load-splash__content">
        <div className="page-load-splash__logo-wrap">
          <Image
            src="/logo.png"
            alt="Laboratorio de Metrología USC"
            width={300}
            height={171}
            priority
            className="page-load-splash__logo"
          />
          <span className="page-load-splash__contour-light" aria-hidden="true" />
        </div>
        <p className="page-load-splash__title">{moduleTitle}</p>
        <p className="page-load-splash__caption">Preparando el módulo…</p>
      </div>
    </div>
  );
}

export const MODULE_READY_EVENT = READY_EVENT;
