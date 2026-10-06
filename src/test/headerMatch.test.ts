import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FN_DIR = path.resolve(process.cwd(), "supabase/functions/parse-excel");

// The matcher is inlined in the edge function entrypoint on purpose — Lovable
// deploys only index.ts, so a sibling module never reaches the edge runtime and
// the deploy quietly keeps serving the previous version. Rather than keep a
// second copy here to drift out of sync, read the two functions back out of the
// file that actually ships and evaluate them.
function loadMatcher() {
  const src = fs.readFileSync(path.join(FN_DIR, "index.ts"), "utf8");
  const start = src.indexOf("// Normalize:");
  const end = src.indexOf("\n}\n", src.indexOf("function fuzzyFieldFor"));
  if (start < 0 || end < 0) {
    throw new Error("Could not find the matcher block in parse-excel/index.ts");
  }
  const js = src
    .slice(start, end + 3)
    .replace("(s: string)", "(s)")
    .replace("(headerNorm: string): string | null", "(headerNorm)");
  return new Function(`${js}\nreturn { norm, fuzzyFieldFor };`)() as {
    norm: (s: string) => string;
    fuzzyFieldFor: (h: string) => string | null;
  };
}

const { norm, fuzzyFieldFor } = loadMatcher();
const field = (header: string) => fuzzyFieldFor(norm(header));

// The real header row from Lamar's SLC airport sheet (WaterCo_SLCAirport.xlsx),
// the file that originally parsed to zero units.
const LAMAR_AIRPORT_HEADERS = [
  "Water Co. Market",
  "Environment",
  "Digital (Y/N)",
  "Media Owner Unit #",
  "Location Description",
  "Rationale / Marketing Description",
  "Qty",
  "Availability",
  "Avg. Monthly Passenger Stats (Based on 2026 months reported)",
  "Spot Length",
  "# of ad spots in loop",
  "% SOV",
  "Size (H x W) ",
  "4-Week Net Media Cost",
  "INTERNAL 4-WEEK",
  "Production",
];

describe("parse-excel edge function", () => {
  // Regression guard for a real incident: splitting the matcher into
  // ./headerMatch.ts built and tested fine but never deployed, because only the
  // entrypoint is uploaded. Keep this function a single file.
  it("stays a single file so the deploy carries the whole thing", () => {
    expect(fs.readdirSync(FN_DIR)).toEqual(["index.ts"]);
  });
});

describe("fuzzyFieldFor", () => {
  it("clears the 8-header bar on a sheet with no dictionary entries", () => {
    const mapped = new Set(
      LAMAR_AIRPORT_HEADERS.map(field).filter((f): f is string => f !== null),
    );
    expect(mapped.size).toBeGreaterThanOrEqual(8);
  });

  it("maps the columns the proposal actually prices off", () => {
    expect(field("Media Owner Unit #")).toBe("unit_number");
    expect(field("4-Week Net Media Cost")).toBe("negotiated_rate_4wk");
    expect(field("Size (H x W) ")).toBe("size");
    expect(field("Environment")).toBe("format");
    expect(field("Qty")).toBe("unit_count");
    expect(field("% SOV")).toBe("sov_pct");
    expect(field("# of ad spots in loop")).toBe("loop_length");
    expect(field("INTERNAL 4-WEEK")).toBe("rate_4week");
    expect(field("Production")).toBe("production_cost");
  });

  it("handles the renamed headers in the dialect-check fixture", () => {
    expect(field("Panel Number")).toBe("unit_number");
    expect(field("Media Type")).toBe("format");
    expect(field("Quantity")).toBe("unit_count");
    expect(field("Share of Voice")).toBe("sov_pct");
    expect(field("Display Dimensions")).toBe("size");
  });

  it("never reads an audience or traffic count as impressions", () => {
    expect(field("Avg. Monthly Passenger Stats (Based on 2026 months reported)")).toBeNull();
    expect(field("Daily Traffic Count")).toBeNull();
    expect(field("Weekly Ridership")).toBeNull();
  });

  it("keeps totals out of the rate fields", () => {
    expect(field("4 Week Total Cost")).toBe("total_cost");
    expect(field("Total Investment")).toBe("total_cost");
    expect(field("Negotiated Rate")).toBe("negotiated_rate_4wk");
  });

  it("does not mistake marketing prose for a market or location column", () => {
    expect(field("Rationale / Marketing Description")).toBeNull();
    expect(field("Location Description")).toBe("location_description");
  });
});
