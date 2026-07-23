import { useState } from "react";
import { SITE } from "./config";

const features = [
  {
    title: "Explore mode",
    body: "Read-only agent that searches and explains your codebase before anything changes.",
  },
  {
    title: "Build mode",
    body: "Edit files and run commands with explicit permissions — you stay in control.",
  },
  {
    title: "Transparent traces",
    body: "Every tool call is visible in a timeline so you can audit what the agent did.",
  },
] as const;

const steps = [
  {
    label: "01",
    title: "Pick a local project",
    body: "Point Cohesive at a folder on your machine. Nothing is uploaded by default.",
  },
  {
    label: "02",
    title: "Ask in Explore or Build",
    body: "Explore to understand. Build when you are ready for edits and shell commands.",
  },
  {
    label: "03",
    title: "Inspect the trace",
    body: "Open the agent timeline to see reads, searches, writes, and command results.",
  },
] as const;

const XATTR_COMMAND = "xattr -cr /Applications/Cohesive.app";

function FirstLaunchGuide() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(XATTR_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside id="first-launch" className="first-launch">
      <div className="first-launch-head">
        <span className="first-launch-badge">Heads up · First launch</span>
        <p>
          {SITE.productName} is open source and not yet notarized by Apple, so
          macOS will show a warning the first time you open it. This is expected
          — here&apos;s how to get past it.
        </p>
      </div>

      <div className="macos-dialog" aria-hidden="true">
        <div className="macos-dialog-icon">!</div>
        <div className="macos-dialog-body">
          <strong>
            &ldquo;{SITE.productName}&rdquo; can&apos;t be opened because Apple
            cannot check it for malicious software.
          </strong>
          <p>
            This file was downloaded on an unknown date. macOS cannot verify that
            this app is free from malware.
          </p>
          <div className="macos-dialog-actions">
            <span>Done</span>
            <span>Move to Trash</span>
          </div>
        </div>
      </div>

      <div className="guide-columns">
        <article>
          <h3>macOS 15 Sequoia and later</h3>
          <ol>
            <li>
              Double-click {SITE.productName}, then click <strong>Done</strong> to
              dismiss the warning.
            </li>
            <li>
              Open <strong>System Settings → Privacy &amp; Security</strong> and
              scroll to the bottom.
            </li>
            <li>
              Click <strong>Open Anyway</strong>, then confirm once more when
              prompted.
            </li>
          </ol>
        </article>
        <article>
          <h3>macOS 14 Sonoma and earlier</h3>
          <ol>
            <li>
              In <strong>Applications</strong>, Control-click (right-click){" "}
              {SITE.productName}.
            </li>
            <li>
              Choose <strong>Open</strong> from the menu.
            </li>
            <li>
              In the dialog that appears, click <strong>Open</strong> again.
            </li>
          </ol>
        </article>
      </div>

      <details className="first-launch-advanced">
        <summary>
          Still blocked? If you see &ldquo;damaged and can&apos;t be opened&rdquo;
        </summary>
        <p>
          macOS sometimes quarantines unsigned downloads. Clear the quarantine
          flag in Terminal, then open the app again:
        </p>
        <div className="command-row">
          <code>{XATTR_COMMAND}</code>
          <button type="button" className="btn-copy" onClick={copyCommand}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </details>

      <p className="first-launch-footnote">
        Why the warning? We haven&apos;t paid for an Apple Developer certificate
        yet. The full source is on{" "}
        <a href={SITE.githubUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>{" "}
        — you can audit or build it yourself.
      </p>
    </aside>
  );
}

export function App() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="nav">
        <a className="nav-brand" href="#top">
          <img src="/app-icon.png" alt="" width={28} height={28} />
          <span>{SITE.productName}</span>
        </a>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#demo">Demo</a>
          <a href="#download">Download</a>
          <a href={SITE.githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Desktop · Local-first · Open source</p>
            <h1>{SITE.productName}</h1>
            <p className="lede">{SITE.tagline}</p>
            <div className="cta-row">
              <a className="btn btn-primary" href="#download">
                Download for macOS
              </a>
              <a
                className="btn btn-secondary"
                href={SITE.githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                View source
              </a>
            </div>
            <p className="meta">
              v{SITE.version} · Apple Silicon & Intel · DeepSeek API key required
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="app-frame">
              <div className="app-chrome">
                <span />
                <span />
                <span />
                <strong>Cohesive</strong>
              </div>
              <div className="app-body">
                <aside>
                  <div className="pill">Projects</div>
                  <div className="sidebar-item active">todo-app</div>
                  <div className="sidebar-item">cohesive</div>
                  <div className="pill spaced">Sessions</div>
                  <div className="sidebar-item active">Explore auth flow</div>
                  <div className="sidebar-item">Fix filter bug</div>
                </aside>
                <section>
                  <div className="chat-bubble user">
                    Where is the default todo filter defined, and who imports it?
                  </div>
                  <div className="chat-bubble assistant">
                    Found it in <code>src/filters/default-filter.ts</code>. It is
                    imported by the todo service and the status badge UI.
                    <div className="trace-chip">3 tools · explore</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="section features">
          <div className="section-head">
            <h2>Built to show how the agent works</h2>
            <p>
              Not a chat wrapper — a desktop workspace with modes, permissions,
              and inspectable runs.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="section demo">
          <div className="section-head">
            <h2>How a session feels</h2>
            <p>
              Replace the placeholder frames with your own screenshots or a short
              screen recording when you have a polished run.
            </p>
          </div>
          <ol className="steps">
            {steps.map((step) => (
              <li key={step.label}>
                <span>{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="demo-strip" aria-hidden="true">
            <div className="demo-card">
              <strong>Composer</strong>
              <p>Explore / Build mode switch beside the prompt.</p>
            </div>
            <div className="demo-card">
              <strong>Agent loop</strong>
              <p>Streaming replies with tool messages in the thread.</p>
            </div>
            <div className="demo-card">
              <strong>Trace panel</strong>
              <p>Waterfall timeline of reads, searches, and edits.</p>
            </div>
          </div>
        </section>

        <section id="download" className="section download">
          <div className="section-head">
            <h2>Download</h2>
            <p>
              Grab a macOS <code>.dmg</code> from GitHub Releases, then follow
              the first-launch steps below — the build is unsigned until we ship
              with Apple notarization.
            </p>
          </div>
          <div className="download-grid">
            <a className="download-card" href={SITE.downloads.appleSilicon}>
              <strong>macOS Apple Silicon</strong>
              <span>arm64 · M1 / M2 / M3 / M4</span>
            </a>
            <a className="download-card" href={SITE.downloads.intel}>
              <strong>macOS Intel</strong>
              <span>x64 · Intel Macs</span>
            </a>
          </div>
          <FirstLaunchGuide />
          <p className="meta center">
            Windows builds are not published yet. Prefer building from source on
            GitHub if you need another platform.
          </p>
        </section>

        <section className="section about">
          <div className="section-head">
            <h2>Why this project exists</h2>
            <p>
              Cohesive is a portfolio-grade coding agent: Tauri 2 desktop shell,
              React UI, Rust-backed local storage, and an eval harness around the
              explore/build loop. The source is public so reviewers can inspect
              architecture and agent quality directly.
            </p>
          </div>
          <div className="tech-row">
            <span>Tauri 2</span>
            <span>React + TypeScript</span>
            <span>SQLite</span>
            <span>Agent evals</span>
            <span>DeepSeek</span>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>{SITE.productName}</strong>
          <span>Local-first coding agent</span>
        </div>
        <div className="footer-links">
          <a href={SITE.githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#download">Download</a>
        </div>
      </footer>
    </div>
  );
}
