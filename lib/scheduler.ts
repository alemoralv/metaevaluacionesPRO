import cron from "node-cron";
import { getRegistryEntriesByDate } from "./registry";
import { sendDailyDigestEmail } from "./mailer";

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  if (process.env.DAILY_EMAIL_ENABLED !== "true") {
    console.log(
      "[scheduler] Correo diario desactivado. Agrega DAILY_EMAIL_ENABLED=true a .env.local para activarlo."
    );
    return;
  }

  // Every day at 18:00 Mexico City time
  cron.schedule(
    "0 18 * * *",
    async () => {
      const todayMx = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Mexico_City",
      });
      console.log(`[scheduler] Ejecutando resumen diario para ${todayMx}…`);

      try {
        const entries = await getRegistryEntriesByDate(todayMx);

        if (entries.length === 0 && process.env.DAILY_EMAIL_SKIP_EMPTY === "true") {
          console.log("[scheduler] Sin evaluaciones hoy. Correo omitido.");
          return;
        }

        await sendDailyDigestEmail(entries);
        console.log(
          `[scheduler] Correo diario enviado con ${entries.length} evaluacion(es).`
        );
      } catch (err) {
        console.error("[scheduler] Error al enviar correo diario:", err);
      }
    },
    { timezone: "America/Mexico_City" }
  );

  console.log(
    "[scheduler] Tarea programada: correo diario a las 18:00 hora Ciudad de México."
  );
}
