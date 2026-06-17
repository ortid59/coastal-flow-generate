import { useEffect, useState } from "react";

const GUIDE_URL =
  "https://gcxygjflxqqubrlwluid.supabase.co/storage/v1/object/public/guide-assets/guide.html";

export default function GuidePage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(GUIDE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load guide (${r.status})`);
        return r.text();
      })
      .then(setHtml)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Could not load the User Guide: {error}
      </div>
    );
  }

  if (!html) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading User Guide…</div>
    );
  }

  return (
    <iframe
      srcDoc={html}
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      title="User Guide"
      sandbox="allow-same-origin allow-scripts allow-popups"
    />
  );
}
