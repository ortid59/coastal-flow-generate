import { motion } from "framer-motion";
import { useProposalSettings, DEFAULT_TEAM_MEMBERS, TeamMember } from "@/hooks/useProposalSettings";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function MeetTheTeam() {
  const settings = useProposalSettings();
  const team: TeamMember[] =
    settings.team_members && settings.team_members.length > 0
      ? settings.team_members
      : DEFAULT_TEAM_MEMBERS;
  return (
    <section className="relative overflow-hidden bg-card">
      <div className="container-app relative py-24 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <div className="eyebrow">The Team</div>
          <h2 className="mt-3 font-heading text-4xl md:text-5xl font-bold uppercase tracking-tight text-foreground">
            {settings.meet_the_team_heading || "Meet The Team"}
          </h2>
          <span className="mx-auto mt-5 gold-rule" />

          <p className="mx-auto mt-6 max-w-xl text-base md:text-lg text-muted-foreground">
            The people behind the placements — hands-on, collaborative, and committed to
            standout campaigns from start to finish.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-10 sm:grid-cols-2 md:grid-cols-3 max-w-5xl mx-auto">
          {team.map((m, i) => (
            <motion.article
              key={`${m.name}-${i}`}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -6 }}
              className="group rounded-2xl bg-[hsl(var(--off-white))] border border-border border-t-[3px] border-t-[hsl(var(--accent-gold))] p-6 shadow-elev-sm transition-shadow hover:shadow-elev-md text-center"
            >
              <div className="relative mx-auto h-44 w-44 overflow-hidden rounded-full ring-4 ring-card shadow-elev-md bg-[hsl(var(--ocean)/0.1)] flex items-center justify-center">
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={`${m.name} — ${m.role}`}
                    crossOrigin="anonymous"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <span
                    className="font-heading font-bold uppercase text-[hsl(var(--ocean))] select-none"
                    style={{ fontSize: "56px", letterSpacing: "0.02em" }}
                  >
                    {initialsOf(m.name)}
                  </span>
                )}
              </div>
              <span className="mx-auto mt-6 gold-rule" />
              <h3 className="mt-4 font-heading text-xl font-bold uppercase tracking-wide text-foreground">
                {m.name}
              </h3>
              <div className="mt-1 text-[11px] font-semibold tracking-[0.2em] uppercase text-[hsl(var(--ocean))]">
                {m.role}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
