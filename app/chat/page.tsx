import { SiteNav } from "@/app/components/SiteNav";
import { SITE_NAME, SITE_TAGLINE } from "@/app/lib/branding";

export default function ChatPage() {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box",
        gap: "16px",
      }}
    >
      <SiteNav />
      <div style={{ textAlign: "center", maxWidth: "560px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>
          Chat with footage
        </h1>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          This page is set up for the future chat experience. No functionality
          is wired yet.
        </p>
        <p style={{ margin: "12px 0 0", opacity: 0.7, fontSize: "14px" }}>
          {SITE_NAME}
        </p>
        <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: "14px" }}>
          {SITE_TAGLINE}
        </p>
      </div>
    </main>
  );
}
