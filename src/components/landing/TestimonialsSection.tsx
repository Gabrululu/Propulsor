import { motion } from "framer-motion";

const testimonials = [
  {
    quote: "Antes todo se iba en el día. Ahora sé que el 30% de lo que gano está guardado, y nadie lo puede tocar.",
    highlight: "nadie lo puede tocar",
    name: "María",
    role: "Jefa de hogar, Lima",
    color: "pink" as const,
  },
  {
    quote: "Vendo comida en la calle. Con Propulsor puedo separar lo del negocio y lo de la casa sin pensarlo.",
    highlight: "separar lo del negocio",
    name: "Rosa",
    role: "Emprendedora informal, Arequipa",
    color: "mint" as const,
  },
  {
    quote: "Trabajo cuidando una casa. Mi patrona me paga semanal. Ahora una parte se va directo a mi fondo seguro.",
    highlight: "directo a mi fondo seguro",
    name: "Luz",
    role: "Trabajadora del hogar, Cusco",
    color: "pink" as const,
  },
];

const borderColor = {
  pink: "rgba(255,179,198,0.25)",
  mint: "rgba(184,240,200,0.25)",
};
const glowBg = {
  pink: "rgba(255,179,198,0.06)",
  mint: "rgba(184,240,200,0.06)",
};

const TestimonialsSection = () => {
  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <div className="mb-12">
        <span className="font-mono text-xs text-dimmed tracking-widest">// SECCIÓN 03</span>
        <h2 className="text-3xl md:text-5xl font-bold mt-2">
          <span className="text-foreground">SUS </span>
          <span className="text-pink">HISTORIAS</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="bg-card-dark p-6 rounded-sm"
          >
            <p className="text-foreground text-sm italic leading-relaxed mb-6">
              "{t.quote.split(t.highlight)[0]}
              <strong className="text-pink-soft not-italic">{t.highlight}</strong>
              {t.quote.split(t.highlight)[1]}"
            </p>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-sm flex items-center justify-center font-bold text-sm"
                style={{
                  border: `1px solid ${borderColor[t.color]}`,
                  background: glowBg[t.color],
                  color: t.color === "pink" ? "#ffb3c6" : "#b8f0c8",
                }}
              >
                {t.name[0]}
              </div>
              <div>
                <p className="text-foreground text-sm font-semibold">{t.name}</p>
                <p className="text-dimmed text-xs">{t.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default TestimonialsSection;
