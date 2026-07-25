"use client";

import { useEffect } from "react";
import { installBrowserTracing } from "@/lib/browser-tracing";

export function BrowserTracing() {
  useEffect(() => {
    installBrowserTracing();
  }, []);

  return null;
}
