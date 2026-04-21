import { motion } from "framer-motion";
import { Megaphone, Target, Lightbulb, Waves } from "lucide-react";

export function WhoWeAre() {
  return (
    <section className="relative overflow-hidden text-primary-foreground">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div
        className="absolute inset-0 opacity-60"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, hsl(var(--secondary) / 0.35), transparent 55%), radial-gradient(circle at 10% 90%, hsl(var(--accent-gold) / 0.22), transparent 55%)",
        }}
      />

      {/* Decorative wave */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="absolute bottom-6 right-6 md:right-12"
        aria-hidden
      >
        <Waves className="h-32 w-32 text-primary-foreground/10 animate-float" />
      </motion.div>

      <div className="container-app relative py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16 items-start">
          {/* Left — title + icons */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="text-xs font-bold tracking-[0.4em] text-accent-gold">00</div>
            <h2 className="mt-3 font-heading text-5xl md:text-7xl font-bold tracking-tight uppercase leading-[0.9]">
              Who
              <br />
              <span className="text-accent-gold">We Are</span>
            </h2>

            <div className="mt-10 flex flex-wrap gap-6">
              <IconBubble icon={<Megaphone className="h-6 w-6" />} label="Bold OOH" delay={0.2} />
              <IconBubble icon={<Target className="h-6 w-6" />} label="Strategy" delay={0.35} />
              <IconBubble icon={<Lightbulb className="h-6 w-6" />} label="Creative" delay={0.5} />
            </div>
          </motion.div>

          {/* Right — copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 text-base md:text-lg leading-relaxed text-primary-foreground/90"
          >
            <p>
              <span className="font-semibold text-primary-foreground">Coastal Maverick</span>{" "}
              is a woman-owned boutique out-of-home (OOH) media agency specializing in
              high-impact, highly customized OOH campaigns.
            </p>
            <p>
              From concept to completion, we serve as a strategic partner for brands looking
              to make a bold visual statement in the physical world.
            </p>
            <p>
              With 360-degree experience across media owner, client, and agency sides, we
              bring a unique perspective that fuels smarter strategy and greater impact.
            </p>
          </motion.div>
        </div>

        {/* Bottom line */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-16 max-w-3xl text-lg md:text-xl leading-relaxed text-primary-foreground/90 border-l-2 border-accent-gold pl-6"
        >
          With deep media buying experience, top-tier vendor relationships, and creative
          insight,{" "}
          <span className="font-semibold text-accent-gold">we help brands</span> break
          through the noise and command attention.
        </motion.div>
      </div>
    </section>
  );
}

function IconBubble({ icon, label, delay = 0 }: { icon: React.ReactNode; label: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={{ y: -6, scale: 1.05 }}
      className="group flex flex-col items-center gap-2"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-elev-md ring-1 ring-accent-gold/30 transition-shadow duration-300 group-hover:shadow-elev-lg">
        {icon}
      </div>
      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary-foreground/80">
        {label}
      </span>
    </motion.div>
  );
}
