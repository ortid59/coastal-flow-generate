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
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div
        className="absolute inset-0 opacity-40"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 30%, hsl(var(--secondary) / 0.35), transparent 45%), radial-gradient(circle at 85% 70%, hsl(var(--accent-gold) / 0.18), transparent 50%)",
        }}
      />
      <div className="container-app relative py-16 md:py-24 text-primary-foreground">
        <div className="text-center">
          <div className="text-xs font-bold tracking-[0.4em] text-accent-gold">
            04
          </div>
          <h2 className="mt-3 font-heading text-4xl md:text-5xl font-bold tracking-[0.15em] uppercase">
            Meet the Team
          </h2>
          <div className="mx-auto mt-5 max-w-xl">
            <p className="font-heading text-lg font-semibold text-primary-foreground">
              The people behind the placements.
            </p>
            <p className="mt-2 text-sm md:text-base text-primary-foreground/80">
              We&apos;re hands-on, collaborative, and committed to delivering
              standout campaigns from start to finish.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 md:grid-cols-3 max-w-4xl mx-auto">
          {team.map((m, i) => (
            <article
              key={m.name}
              className="group flex flex-col items-center text-center animate-fade-in"
              style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
            >
              <div className="relative">
                <div
                  className="absolute -inset-1 rounded-t-full bg-gradient-gold opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-60"
                  aria-hidden
                />
                <div className="relative h-44 w-36 md:h-52 md:w-44 overflow-hidden rounded-t-full rounded-b-[2rem] bg-card shadow-elev-lg ring-2 ring-primary-foreground/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.02]">
                  <img
                    src={m.photo}
                    alt={`${m.name} — ${m.role}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="mt-5 h-px w-16 bg-accent-gold" aria-hidden />
              <h3 className="mt-4 font-heading text-lg font-bold tracking-[0.2em] uppercase">
                {m.name}
              </h3>
              <div className="mt-1 text-[11px] font-medium tracking-[0.18em] uppercase text-primary-foreground/75">
                {m.role}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
