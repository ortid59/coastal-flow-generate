import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProposalSettings = {
  id: number;
  company_name: string;
  company_email: string;
  company_phone: string;
  who_we_are_heading: string;
  who_we_are_body_1: string;
  who_we_are_body_2: string;
  meet_the_team_heading: string;
  next_steps_heading: string;
  next_steps_body: string;
  footer_tagline: string;
  updated_at?: string;
};

export const DEFAULT_PROPOSAL_SETTINGS: ProposalSettings = {
  id: 1,
  company_name: "Coastal Maverick",
  company_email: "",
  company_phone: "",
  who_we_are_heading: "Who We Are",
  who_we_are_body_1:
    "Coastal Maverick is a woman-owned boutique out-of-home (OOH) media agency specializing in high-impact, highly customized OOH campaigns. From concept to completion, we serve as a strategic partner for brands looking to make a bold visual statement in the physical world.",
  who_we_are_body_2:
    "With 360-degree experience across media owner, client, and agency sides, we bring a unique perspective that fuels smarter strategy and greater impact.",
  meet_the_team_heading: "Meet the Team",
  next_steps_heading: "Next Steps",
  next_steps_body: "",
  footer_tagline: "",
};

let cached: ProposalSettings | null = null;
let inflight: Promise<ProposalSettings> | null = null;

export async function fetchProposalSettings(): Promise<ProposalSettings> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await (supabase as any)
      .from("proposal_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    cached = (data as ProposalSettings) ?? DEFAULT_PROPOSAL_SETTINGS;
    inflight = null;
    return cached;
  })();
  return inflight;
}

export function invalidateProposalSettings() {
  cached = null;
}

export function useProposalSettings(): ProposalSettings {
  const [s, setS] = useState<ProposalSettings>(cached ?? DEFAULT_PROPOSAL_SETTINGS);
  useEffect(() => {
    let alive = true;
    fetchProposalSettings().then((v) => {
      if (alive) setS(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
