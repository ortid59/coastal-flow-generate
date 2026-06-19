import { motion } from "framer-motion";
import { Megaphone, Target, Lightbulb } from "lucide-react";
import { useProposalSettings } from "@/hooks/useProposalSettings";


export function WhoWeAre() {
  const settings = useProposalSettings();
  const heading = settings.who_we_are_heading || "Who We Are";
  // Split heading on whitespace for the two-line decorative layout.
  const parts = heading.trim().split(/\s+/);
  const headTop = parts.length > 1 ? parts.slice(0, Math.ceil(parts.length / 2)).join(" ") : parts[0];
  const headBottom = parts.length > 1 ? parts.slice(Math.ceil(parts.length / 2)).join(" ") : "";

  return (
    <section className="relative overflow-hidden bg-[hsl(var(--off-white))]">
      <div className="container-app relative py-24 md:py-32">
        <div className="grid gap-16 md:grid-cols-2 md:gap-20 items-start">
          {/* Left — watermark + bullets */}
          <div className="relative">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.04 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5 }}
              aria-hidden
              className="pointer-events-none select-none absolute -top-8 -left-2 font-heading font-bold leading-[0.85] uppercase text-foreground"
              style={{ fontSize: "clamp(80px, 12vw, 160px)" }}
            >
              {headTop}{headBottom && (<><br />{headBottom}</>)}
            </motion.span>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="eyebrow">About the Agency</div>
              <h2 className="mt-3 font-heading text-5xl md:text-6xl font-bold tracking-tight uppercase leading-[0.95] text-foreground">
                {headTop}{headBottom && (<><br /><span className="text-[hsl(var(--ocean))]">{headBottom}</span></>)}

              </h2>
              <span className="mt-5 gold-rule" />

              <ul className="mt-10 space-y-3 border-l-[3px] border-[hsl(var(--accent-gold))] pl-5">
                {["Woman-Owned.", "Boutique.", "Built for Impact."].map((t, i) => (
                  <motion.li
                    key={t}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="font-heading text-xl md:text-2xl font-semibold uppercase tracking-wide text-foreground"
                  >
                    {t}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Right — copy + credential cards */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            <p className="text-base md:text-lg leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Coastal Maverick</span> is a
              woman-owned boutique out-of-home (OOH) media agency specializing in
              high-impact, highly customized OOH campaigns. From concept to completion, we
              serve as a strategic partner for brands looking to make a bold visual
              statement in the physical world.
            </p>
            <p className="text-base md:text-lg leading-relaxed text-muted-foreground">
              With 360-degree experience across media owner, client, and agency sides, we
              bring a unique perspective that fuels smarter strategy and greater impact.
            </p>

            <div className="h-px w-full bg-border my-2" />

            <div className="grid gap-4 sm:grid-cols-3 pt-4">
              <CredentialCard icon={<Megaphone className="h-5 w-5" />} label="Bold OOH" delay={0.2} />
              <CredentialCard icon={<Target className="h-5 w-5" />} label="Strategy" delay={0.32} />
              <CredentialCard icon={<Lightbulb className="h-5 w-5" />} label="Creative" delay={0.44} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function CredentialCard({
  icon,
  label,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={{ y: -4 }}
      className="rounded-2xl bg-card border border-border border-t-[3px] border-t-[hsl(var(--accent-gold))] p-5 shadow-elev-sm transition-shadow hover:shadow-elev-md"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-[hsl(var(--ocean))]">
        {icon}
      </div>
      <div className="mt-4 font-heading text-base font-semibold uppercase tracking-wide text-foreground">
        {label}
      </div>
    </motion.div>
  );
}
