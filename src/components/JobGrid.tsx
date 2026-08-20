import { JobCard } from "./JobCard";
import type { Job } from "@/lib/types";

export function JobGrid({ jobs, view }: { jobs: Job[]; view: "grid" | "list" }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
        Nenhuma vaga encontrada com esses filtros.
      </div>
    );
  }

  return (
    <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-4"}>
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} layout={view} />
      ))}
    </div>
  );
}
