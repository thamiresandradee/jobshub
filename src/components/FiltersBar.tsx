"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { JobFilters } from "@/lib/types";
import { parseBRNumber } from "@/lib/brNumber";

type Meta = { cities: string[]; categories: string[] };

export function FiltersBar({
  filters,
  onChange,
  meta,
  view,
  onViewChange,
}: {
  filters: JobFilters;
  onChange: (patch: Partial<JobFilters>) => void;
  meta: Meta;
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Cidade fica sozinha, numa linha maior — é o filtro mais usado. O
          resto vai numa segunda linha, sempre (em todos os tamanhos de tela). */}
      <div className="w-full">
        <CityMultiSelect cities={meta.cities} selected={filters.city ?? []} onChange={(v) => onChange({ city: v.length ? v : undefined })} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label="Modalidade" value={filters.workType ?? ""} onChange={(v) => onChange({ workType: v || undefined })}>
          <option value="">Todas</option>
          <option value="remoto">Remoto</option>
          <option value="hibrido">Híbrido</option>
          <option value="presencial">Presencial</option>
        </Select>

        <Select label="Senioridade" value={filters.seniority ?? ""} onChange={(v) => onChange({ seniority: v || undefined })}>
          <option value="">Qualquer</option>
          <option value="estagio">Estágio</option>
          <option value="junior">Júnior</option>
          <option value="pleno">Pleno</option>
          <option value="senior">Sênior</option>
          <option value="especialista">Especialista</option>
        </Select>

        <Select label="Contrato" value={filters.contractType ?? ""} onChange={(v) => onChange({ contractType: v || undefined })}>
          <option value="">Qualquer</option>
          <option value="clt">CLT</option>
          <option value="pj">PJ</option>
          <option value="estagio">Estágio</option>
          <option value="freelancer">Freelancer</option>
          <option value="temporario">Temporário</option>
        </Select>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <Select label="Área" value={filters.category ?? ""} onChange={(v) => onChange({ category: v || undefined })}>
            <option value="">Todas</option>
            {meta.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-3">
          <PriceInput label="Salário mín." value={filters.minSalary} onChange={(v) => onChange({ minSalary: v })} />
        </div>
        <div className="sm:col-span-3">
          <PriceInput label="Salário máx." value={filters.maxSalary} onChange={(v) => onChange({ maxSalary: v })} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            onChange({
              city: undefined,
              workType: undefined,
              seniority: undefined,
              contractType: undefined,
              category: undefined,
              minSalary: undefined,
              maxSalary: undefined,
            })
          }
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Limpar filtros
        </button>

        {/* No mobile o card de lista já cai empilhado igual ao de cards (o
            layout lado-a-lado só existe a partir de sm), então a escolha
            não faz diferença visual lá — escondemos a opção. */}
        <div className="hidden items-center gap-1 rounded-lg border border-slate-300 p-1 sm:flex">
          <ViewButton active={view === "grid"} onClick={() => onViewChange("grid")} label="Cards" />
          <ViewButton active={view === "list"} onClick={() => onViewChange("list")} label="Lista" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, labelClassName }: { label: string; children: ReactNode; labelClassName?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${labelClassName ?? "text-xs font-medium text-slate-500"}`}>
      {label}
      {children}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      >
        {children}
      </select>
    </Field>
  );
}

/** Dropdown com checkboxes — permite escolher uma ou várias cidades. */
function CityMultiSelect({ cities, selected, onChange }: { cities: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = cities.length > 0 && selected.length === cities.length;
  const someSelected = selected.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleCity(city: string) {
    onChange(selected.includes(city) ? selected.filter((c) => c !== city) : [...selected, city]);
  }

  // Marca todas de uma vez (pra depois ir desmarcando só as que não quer),
  // ou desmarca tudo se já estiverem todas marcadas.
  function toggleAll() {
    onChange(allSelected ? [] : [...cities]);
  }

  const label = selected.length === 0 ? "Todas" : selected.length === 1 ? selected[0] : `${selected.length} cidades`;

  return (
    <Field label="Cidade" labelClassName="text-sm font-semibold text-slate-700">
      <div ref={containerRef} className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base focus:border-emerald-500 focus:outline-none"
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 max-h-96 w-full min-w-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {cities.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-slate-400">Nenhuma cidade ainda</p>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Marcar todas
                </label>
                <div className="my-1 border-t border-slate-100" />
              </>
            )}
            {cities.length > 0 &&
              cities.map((city) => (
                <label key={city} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(city)}
                    onChange={() => toggleCity(city)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {city}
                </label>
              ))}
          </div>
        )}
      </div>
    </Field>
  );
}

/**
 * Aceita o valor digitado livremente ("3000", "3.000", "3.000,00") mantendo
 * o texto local separado do número já convertido — assim o campo não "come"
 * o ponto/vírgula que o usuário acabou de digitar a cada tecla.
 */
function PriceInput({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value != null ? String(value) : "");

  useEffect(() => {
    if (value == null) setText("");
  }, [value]);

  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="decimal"
        placeholder="R$ 0,00"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseBRNumber(e.target.value) ?? undefined);
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
    </Field>
  );
}

function ViewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
}
