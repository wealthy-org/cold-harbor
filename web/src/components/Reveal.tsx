"use client";

import { useEffect } from "react";

export default function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("r-ready");
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-r]"));
    els.forEach((el) => el.classList.add("in"));
  }, []);
  return null;
}
