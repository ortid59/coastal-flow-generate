import { motion } from "framer-motion";
import heather from "@/assets/team-heather.jpg";
import via from "@/assets/team-via.webp";
import roxie from "@/assets/team-roxie.jpg";

type Member = { name: string; role: string; photo: string };

const team: Member[] = [
  { name: "Heather", role: "Founder & CEO", photo: heather },
  { name: "Via", role: "Creative Media Coordinator", photo: via },
  { name: "Roxie", role: "Chief Happiness Officer", photo: roxie },
];

export function MeetTheTeam() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Soft decorative wash — light surface, not dark */}
      <div
        className="absolute inset-0 opacity-70"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 0%, hsl(var(--secondary) / 0.6), transparent 55%), radial-gradient(circle at 90% 100%, hsl(var(--accent-gold) / 0.10), transparent 55%)",
        }}
      />

      <div className="container-app relative py-20 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <div className="text-xs font-bold tracking-[0.4em] text-accent-gold">04</div>
          <h2 className="mt-3 font-heading text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Meet the Team
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base md:text-lg text-muted-foreground">
            The people behind the placements — hands-on, collaborative, and committed to standout campaigns from start to finish.
          </p>
          <div className="mx-auto mt-6 h-px w-16 bg-accent-gold" aria-hidden />
        </motion.div>

        <div className="mt-14 grid gap-10 sm:grid-cols-2 md:grid-cols-3 max-w-5xl mx-auto">
          {team.map((m, i) => (
            <motion.article
              key={m.name}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              className="group flex flex-col items-center text-center"
            >
              <div className="relative">
                <div
                  className="absolute -inset-2 rounded-[2.5rem] bg-gradient-gold opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-40"
                  aria-hidden
                />
                <div className="relative h-56 w-44 md:h-64 md:w-52 overflow-hidden rounded-t-full rounded-b-[2rem] bg-card shadow-elev-lg ring-1 ring-border transition-transform duration-500 group-hover:scale-[1.02]">
                  <img
                    src={m.photo}
                    alt={`${m.name} — ${m.role}`}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="mt-6 h-px w-12 bg-accent-gold" aria-hidden />
              <h3 className="mt-4 font-heading text-xl font-bold tracking-wide text-foreground">
                {m.name}
              </h3>
              <div className="mt-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                {m.role}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
