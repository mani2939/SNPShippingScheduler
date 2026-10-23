"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Choice = "accept" | "decline";
const storageKey = "snp_cookie_choice_v1";
const storageLifetime = 180 * 24 * 60 * 60 * 1000;
const fontsId = "snp-optional-fonts";
const fontsURL = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap";

function savedChoice(): Choice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      saved?.version === 1 &&
      (saved.choice === "accept" || saved.choice === "decline") &&
      typeof saved.at === "number" &&
      saved.at <= Date.now() &&
      Date.now() - saved.at < storageLifetime
    ) return saved.choice;
  } catch { /* Storage may be disabled. Ask again next visit. */ }
  return null;
}

export default function CookieConsent() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = savedChoice();
    setChoice(stored);
    setOpen(!stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let link = document.getElementById(fontsId) as HTMLLinkElement | null;
    if (choice === "accept") {
      if (!link) {
        link = document.createElement("link");
        link.id = fontsId;
        link.rel = "stylesheet";
        link.href = fontsURL;
        document.head.appendChild(link);
      }
    } else {
      link?.remove();
    }
  }, [choice, ready]);

  function choose(next: Choice) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, choice: next, at: Date.now() }));
    } catch { /* Choice still applies for this visit. */ }
    setChoice(next);
    setOpen(false);
  }

  if (!ready) return null;
  return (
    <>
      {open ? (
        <section className="cookie-banner" role="region" aria-label="Cookie choices">
          <div className="cookie-banner-copy">
            <strong>Cookies & privacy</strong>
            <p>We use essential cookies to keep your account secure. With your permission, we also load fonts from Google, which sends your IP address to Google. We do not use analytics or advertising cookies.</p>
            <Link href="/cookies">How cookies are used</Link>
          </div>
          <div className="cookie-banner-actions">
            <button type="button" onClick={() => choose("accept")}>Accept</button>
            <button type="button" onClick={() => choose("decline")}>Decline</button>
          </div>
        </section>
      ) : (
        <button type="button" className="cookie-settings" onClick={() => setOpen(true)}>Cookie settings</button>
      )}
    </>
  );
}
