import React from "react";

const guideHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Coastal Maverick — Proposal Generator User Guide</title>
<style>
  :root {
    --navy: #0A1628;
    --navy-light: #152238;
    --gold: #C9A84C;
    --blue: #1E4A8C;
    --text: #1a1a2e;
    --muted: #5a6a7a;
    --border: #dde2ea;
    --bg: #f5f7fa;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: var(--text); line-height: 1.6; }

  .cover {
    background: var(--navy);
    color: #fff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 40px;
    page-break-after: always;
  }
  .cover-eyebrow { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: var(--gold); margin-bottom: 16px; }
  .cover h1 { font-size: 42px; font-weight: 800; line-height: 1.15; margin-bottom: 12px; }
  .cover h2 { font-size: 22px; font-weight: 400; color: #a8b8cc; margin-bottom: 32px; }
  .cover-divider { width: 60px; height: 3px; background: var(--gold); margin: 0 auto 32px; }
  .cover-meta { font-size: 14px; color: #7a90a8; }
  .cover-meta strong { color: #c8d8e8; }

  .toc-section { max-width: 800px; margin: 60px auto; padding: 0 40px; }
  .toc-section h2 { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: var(--muted); margin-bottom: 24px; }
  .toc-list { list-style: none; }
  .toc-list li { border-bottom: 1px solid var(--border); }
  .toc-list a { display: flex; align-items: center; gap: 14px; padding: 14px 0; text-decoration: none; color: var(--text); font-size: 15px; }
  .toc-list a:hover { color: var(--blue); }
  .toc-num { background: var(--navy); color: #fff; font-size: 11px; font-weight: 700; width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .toc-desc { font-size: 13px; color: var(--muted); margin-left: auto; }

  .section { max-width: 900px; margin: 0 auto 80px; padding: 0 40px; }
  .section-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 32px; padding-top: 60px; border-top: 3px solid var(--navy); }
  .section-num { background: var(--navy); color: #fff; font-size: 13px; font-weight: 700; min-width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-top: 4px; }
  .section-header h2 { font-size: 26px; font-weight: 800; color: var(--navy); }
  .section-header p { font-size: 15px; color: var(--muted); margin-top: 4px; }

  .steps { margin: 24px 0; }
  .step { display: flex; gap: 16px; margin-bottom: 18px; align-items: flex-start; }
  .step-num { background: var(--gold); color: var(--navy); font-weight: 800; font-size: 12px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .step-body { flex: 1; }
  .step-body strong { display: block; font-size: 15px; margin-bottom: 3px; }
  .step-body p { font-size: 14px; color: var(--muted); }

  .callout { background: #f0f4ff; border-left: 4px solid var(--blue); border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 20px 0; font-size: 14px; }
  .callout.tip { border-color: var(--gold); background: #fdf8ee; }
  .callout strong { display: block; margin-bottom: 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--blue); }
  .callout.tip strong { color: #a07820; }

  .field-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
  .field-table th { background: var(--navy); color: #fff; padding: 10px 14px; text-align: left; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .field-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .field-table tr:nth-child(even) td { background: var(--bg); }
  .required { color: #c33; font-weight: 700; }
  .optional { color: var(--muted); font-style: italic; }

  .support-footer { background: var(--navy); color: #fff; text-align: center; padding: 60px 40px; margin-top: 80px; }
  .support-footer h2 { font-size: 22px; margin-bottom: 8px; }
  .support-footer a { color: var(--gold); text-decoration: none; }
</style>
</head>
<body>

<section class="cover">
  <div class="cover-eyebrow">Internal Training Guide</div>
  <h1>Coastal Maverick<br>Proposal Generator</h1>
  <h2>Screen-by-Screen User Guide</h2>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <strong>App URL:</strong> coastal-flow-generate.lovable.app<br>
    <strong>Access:</strong> Restricted to the Coastal Maverick team<br>
    <strong>Support:</strong> david@advisoraipartners.com
  </div>
</section>

<section class="toc-section">
  <h2>Contents</h2>
  <ul class="toc-list">
    <li><a href="#s1"><span class="toc-num">1</span> Logging In <span class="toc-desc">Sign in with your Coastal Maverick email</span></a></li>
    <li><a href="#s2"><span class="toc-num">2</span> Campaigns Dashboard <span class="toc-desc">Your home screen — all proposals in one place</span></a></li>
    <li><a href="#s3"><span class="toc-num">3</span> Creating a New Campaign <span class="toc-desc">Fill out details and upload vendor files</span></a></li>
    <li><a href="#s4"><span class="toc-num">4</span> Campaign Review Page <span class="toc-desc">Stats, action buttons, unit management</span></a></li>
    <li><a href="#s5"><span class="toc-num">5</span> Managing Units — Include & Recommend <span class="toc-desc">Toggle units and assign pricing tiers</span></a></li>
    <li><a href="#s6"><span class="toc-num">6</span> Bulk Controls <span class="toc-desc">Reset All, Include All, Option A/B/C buttons</span></a></li>
    <li><a href="#s7"><span class="toc-num">7</span> Preview Presentation <span class="toc-desc">See exactly what the client sees</span></a></li>
    <li><a href="#s8"><span class="toc-num">8</span> Download Full Proposal PDF <span class="toc-desc">Generate a print-ready PDF</span></a></li>
    <li><a href="#s9"><span class="toc-num">9</span> Share with Client <span class="toc-desc">Send the live portal link</span></a></li>
  </ul>
</section>

<section class="section" id="s1">
  <div class="section-header">
    <div class="section-num">1</div>
    <div><h2>Logging In</h2><p>Access is restricted to the Coastal Maverick team.</p></div>
  </div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Open the app URL</strong><p>Navigate to coastal-flow-generate.lovable.app. You'll be redirected to sign-in automatically.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Enter your email and password</strong><p>Use your Coastal Maverick team email. The Password tab is selected by default.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Click Sign In</strong><p>You'll land on the Campaigns dashboard.</p></div></div>
  </div>
  <div class="callout tip"><strong>Tip</strong>You can also use the Magic Link tab for passwordless email login.</div>
</section>

<section class="section" id="s2">
  <div class="section-header"><div class="section-num">2</div><div><h2>Campaigns Dashboard</h2><p>Your home screen. Every proposal you've created lives here as a card.</p></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Status badges</strong><p><em>ready</em> = fully processed and shareable. <em>draft</em> = still being built.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>"Shared with client" indicator</strong><p>Appears once the portal link has been sent.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Open a campaign</strong><p>Click a card to open Campaign Review. Use the ⋯ menu to rename or delete.</p></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><strong>Team & Settings</strong><p>Use Team in the top-right nav to manage team members.</p></div></div>
  </div>
</section>

<section class="section" id="s3">
  <div class="section-header"><div class="section-num">3</div><div><h2>Creating a New Campaign</h2><p>Upload the vendor Excel and billboard photo PDF — the system parses everything automatically.</p></div></div>
  <table class="field-table">
    <thead><tr><th>Field</th><th>What to enter</th><th>Required?</th></tr></thead>
    <tbody>
      <tr><td>Client name</td><td>Advertiser's company name</td><td class="required">Required</td></tr>
      <tr><td>Campaign name</td><td>Internal reference name</td><td class="required">Required</td></tr>
      <tr><td>Proposal name</td><td>Client-facing headline on the cover</td><td class="optional">Optional</td></tr>
      <tr><td>Markets</td><td>Comma-separated market names</td><td class="optional">Optional</td></tr>
      <tr><td>Campaign dates</td><td>Flight start and end dates</td><td class="optional">Optional</td></tr>
      <tr><td>Margin %</td><td>Default 20%. Applied on top of vendor rate.</td><td class="optional">Optional</td></tr>
      <tr><td>Client logo</td><td>PNG / JPG / SVG header logo</td><td class="optional">Optional</td></tr>
      <tr><td>Cover image</td><td>Hero background for the cover page</td><td class="optional">Optional</td></tr>
    </tbody>
  </table>
  <div class="callout"><strong>Three file upload fields</strong>
    <p><strong>Vendor Excels</strong> — the RFP rate sheet (.xlsx), up to 50 files.</p>
    <p><strong>Vendor Billboard Photos</strong> — .pdf, .jpg, .png, .webp, up to 50 files.</p>
    <p><strong>Vendor Photo Sheets PDF</strong> — required; used to extract location highlights.</p>
    <p>Click <em>Create & Upload</em> when ready.</p>
  </div>
</section>

<section class="section" id="s4">
  <div class="section-header"><div class="section-num">4</div><div><h2>Campaign Review Page</h2><p>The admin workspace — stats, action buttons, and the full unit table.</p></div></div>
  <table class="field-table">
    <thead><tr><th>Button</th><th>What it does</th></tr></thead>
    <tbody>
      <tr><td>Extract photos</td><td>Re-run photo extraction from the vendor PDF</td></tr>
      <tr><td>Extract highlights</td><td>Re-run AI highlights for every unit</td></tr>
      <tr><td>Re-parse</td><td>Re-process the vendor Excel</td></tr>
      <tr><td>Re-upload files</td><td>Replace the uploaded Excel or photo PDF</td></tr>
      <tr><td>Preview presentation</td><td>Open the client portal view in a new tab</td></tr>
      <tr><td>Download Full Proposal PDF</td><td>Generate a print-ready PDF</td></tr>
      <tr><td>Share with client</td><td>Copy or send the live portal link</td></tr>
    </tbody>
  </table>
  <p style="font-size:14px;color:var(--muted);margin-top:16px;">The five stat tiles show: Units in Proposal, Recommended, Photos Matched, 4-Week Impressions, Total Cost.</p>
</section>

<section class="section" id="s5">
  <div class="section-header"><div class="section-num">5</div><div><h2>Managing Units — Include & Recommend</h2><p>Every vendor unit appears as a row. Use the toggles to curate the proposal.</p></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Include toggle</strong><p>Blue = included. Grey = excluded (hidden from client without deleting).</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Recommend toggle</strong><p>Featured as a hero card on the client page.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>A / B / C tier toggles</strong><p>Assign units to pricing option tiers. Clients can toggle between them.</p></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><strong>Highlights</strong><p>Expand to read AI-generated text. The ✨ icon marks AI-generated.</p></div></div>
    <div class="step"><div class="step-num">5</div><div class="step-body"><strong>Replace photo / Replace map</strong><p>Swap in a different image under each unit's thumbnails.</p></div></div>
  </div>
  <div class="callout tip"><strong>Tip — Rec badge</strong>Recommended units show a Rec badge in the unit number column.</div>
</section>

<section class="section" id="s6">
  <div class="section-header"><div class="section-num">6</div><div><h2>Bulk Controls</h2><p>Quickly reset or batch-apply toggles across all units.</p></div></div>
  <table class="field-table">
    <thead><tr><th>Button</th><th>What it does</th></tr></thead>
    <tbody>
      <tr><td>Include All</td><td>Turn on Include for every unit</td></tr>
      <tr><td>Exclude All</td><td>Turn off Include for every unit</td></tr>
      <tr><td>Clear Recommended</td><td>Remove Recommend from all units</td></tr>
      <tr><td>Reset A / B / C</td><td>Clear that tier's assignments</td></tr>
    </tbody>
  </table>
  <div class="callout"><strong>Show in Presentation</strong>Toggle Option A / B / C master switches to hide a tier from the portal without losing assignments.</div>
</section>

<section class="section" id="s7">
  <div class="section-header"><div class="section-num">7</div><div><h2>Preview Presentation</h2><p>See the proposal exactly as the client will see it.</p></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Click "Preview presentation"</strong><p>Opens in a new tab at the portal URL.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Review the proposal</strong><p>Cover → Who We Are → coverage map → recommended placements → Option A/B/C → Next Steps → Meet the Team.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Admin Preview bar is yours only</strong><p>Clients see the clean branded proposal — not this bar.</p></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><strong>Adjust and refresh</strong><p>Change toggles on the review page, then refresh the portal tab.</p></div></div>
  </div>
</section>

<section class="section" id="s8">
  <div class="section-header"><div class="section-num">8</div><div><h2>Download Full Proposal PDF</h2><p>Print-ready PDF — one quote per page, plus all cover sections.</p></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Click "Download Full Proposal PDF"</strong><p>Opens a new tab with the print-formatted version.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Wait for images to load</strong><p>5–15 seconds depending on unit count.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Set Destination to "Save as PDF"</strong><p>Turn off "Headers and footers" for a clean output.</p></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><strong>Click Save</strong><p>PDF saves to your Downloads folder.</p></div></div>
  </div>
  <div class="callout tip"><strong>Tip</strong>PDF layout matches the portal order: Cover → Who We Are → Map → one page per unit → Next Steps → Meet the Team.</div>
</section>

<section class="section" id="s9">
  <div class="section-header"><div class="section-num">9</div><div><h2>Share with Client</h2><p>Send a live link to browse the interactive proposal.</p></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Click "Share with client"</strong><p>Opens a modal with the client portal URL.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Copy the link</strong><p>Unique to this campaign — no login required.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Paste into your email</strong><p>The dashboard card will show "Shared with client".</p></div></div>
  </div>
  <div class="callout"><strong>Note</strong>The portal link is public — anyone with the URL can view. Don't share until reviewed internally. Updates appear live; no need to resend.</div>
</section>

<div class="support-footer">
  <h2>Questions or issues?</h2>
  <p>Contact your Advisor AI support rep:</p>
  <p style="margin-top:8px;"><a href="mailto:david@advisoraipartners.com">david@advisoraipartners.com</a></p>
  <p style="margin-top:24px;font-size:12px;color:#7a90a8;">Coastal Maverick Proposal Generator · Powered by Advisor AI Partners</p>
</div>

</body>
</html>`;

export default function GuidePage() {
  return (
    <iframe
      title="Coastal Maverick User Guide"
      srcDoc={guideHtml}
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
