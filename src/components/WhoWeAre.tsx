import { Megaphone, Target, Lightbulb, Waves } from "lucide-react";

export function WhoWeAre() {
  return (
    <section className="relative overflow-hidden text-primary-foreground">
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <div
        className="absolute inset-0 opacity-50"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, hsl(var(--secondary) / 0.45), transparent 55%), radial-gradient(circle at 10% 90%, hsl(var(--accent-gold) / 0.18), transparent 55%)",
        }}
      />

      {/* Decorative wave */}
      <Waves
        className="absolute bottom-6 right-8 h-28 w-28 text-primary-foreground/10"
        aria-hidden
      />

      <div className="container-app relative py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16 items-start">
          {/* Left — title + icons */}
          <div className="animate-fade-in">
            <h2 className="font-heading text-4xl md:text-6xl font-bold tracking-[0.05em] uppercase leading-[0.95]">
              Who
              <br />
              We Are
            </h2>

            <div className="mt-10 flex flex-wrap gap-4">
              <IconBubble icon={<Megaphone className="h-7 w-7" />} label="Bold OOH" />
              <IconBubble icon={<Target className="h-7 w-7" />} label="Strategy" />
              <IconBubble icon={<Lightbulb className="h-7 w-7" />} label="Creative" />
            </div>
          </div>

          {/* Right — copy */}
          <div className="space-y-5 text-base md:text-lg leading-relaxed text-primary-foreground/90 animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
            <p>
              <span className="font-semibold text-primary-foreground">Coastal Maverick</span>{" "}
              is a woman-owned boutique out-of-home (OOH) media agency
              specializing in high-impact, highly customized OOH campaigns.
            </p>
            <p>
              From concept to completion, we serve as a strategic partner for
              brands looking to make a bold visual statement in the physical
              world.
            </p>
            <p>
              With 360-degree experience across media owner, client, and agency
              sides, we bring a unique perspective that fuels smarter strategy
              and greater impact for our clients.
            </p>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-14 max-w-3xl text-base md:text-lg leading-relaxed text-primary-foreground/90 animate-fade-in" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
          With deep media buying experience, top-tier vendor relationships, and
          creative insight,{" "}
          <span className="font-semibold text-accent-gold">
            we help brands
          </span>{" "}
          break through the noise and command attention.
        </div>
      </div>
    </section>
  );
}

function IconBubble({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="group flex flex-col items-center gap-2">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-elev-md transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105">
        {icon}
      </div>
      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary-foreground/70">
        {label}
      </span>
    </div>
  );
}
