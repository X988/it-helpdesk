export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "true") return;
  const g = globalThis as unknown as { __hdTimer?: ReturnType<typeof setInterval> };
  if (g.__hdTimer) return;
  g.__hdTimer = setInterval(() => {
    void import("@/lib/jobs")
      .then((mod) => mod.runMaintenance())
      .catch((error) => console.error("scheduler", error instanceof Error ? error.message : error));
  }, 5 * 60 * 1000);
  g.__hdTimer.unref?.();
}
