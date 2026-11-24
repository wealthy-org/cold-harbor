"use client";

import { useEffect } from "react";

export default function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("r-ready");

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-r]"));

    // 1. Immediately reveal elements that are already within or above the viewport on load
    const checkViewport = () => {
      const vh = window.innerHeight;
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < vh * 0.95) {
          el.classList.add("in");
        }
      });
    };

    checkViewport();

    // 2. IntersectionObserver with generous rootMargin for smooth entrance before hitting viewport bottom
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "0px 0px -40px 0px",
        threshold: 0.05,
      }
    );

    els.forEach((el) => {
      if (!el.classList.contains("in")) {
        io.observe(el);
      }
    });

    // 3. Passive scroll listener to catch rapid scrolling
    const onScroll = () => {
      checkViewport();
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 4. Safety net: reveal all elements after 3.5s so nothing ever stays hidden permanently
    const timer = setTimeout(() => {
      els.forEach((el) => el.classList.add("in"));
    }, 3500);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
