import { describe, expect, it } from "vitest";
import { fuzzyFieldFor, norm } from "../../supabase/functions/parse-excel/headerMatch";

const field = (header: string) => fuzzyFieldFor(norm(header));

// The real header row from Lamar's SLC airport sheet (WaterCo_SLCAirport.xlsx),
// the file that originally parsed to zero units. None of these had a dictionary
// entry at the time — the fuzzy matcher alone has to carry them.
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

  it("does not mistake marketing prose for the location column", () => {
    expect(field("Rationale / Marketing Description")).toBeNull();
    expect(field("Location Description")).toBe("location_description");
  });
});
