"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { JobFilters } from "@/lib/types";
import { parseBRNumber } from "@/lib/brNumber";

type Meta = { cities: string[]; categories: string[] };

const WORK_TYPE_OPTIONS = [
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
];

const SENIORITY_OPTIONS = [
  { value: "estagio", label: "Estágio" },
  { value: "junior", label: "Júnior" },
  { value: "pleno", label: "Pleno" },
  { value: "senior", label: "Sênior" },
  { value: "especialista", label: "Especialista" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "estagio", label: "Estágio" },
  { value: "freelancer", label: "Freelancer" },
  { value: "temporario", label: "Temporário" },
];

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
      {/* Busca por texto fica em cima de tudo — é o primeiro filtro que
          qualquer pessoa tenta usar. Cidade vem logo depois, numa linha
          maior por ser o segundo filtro mais usado. O resto vai numa
          segunda linha, sempre (em todos os tamanhos de tela). */}
      <div className="w-full">
        <Field label="Buscar por cargo">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.q ?? ""}
              onChange={(e) => onChange({ q: e.target.value || undefined })}
              placeholder="Ex.: desenvolvedor, analista de dados, designer..."
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-base focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-9">
          <MultiSelect
            label="Cidade"
            emptyText="Todas"
            noOptionsText="Nenhuma cidade ainda"
            countNoun="cidades"
            options={meta.cities.map((c) => ({ value: c, label: c }))}
            selected={filters.city ?? []}
            onChange={(v) => onChange({ city: v.length ? v : undefined })}
          />
        </div>
        <div className="sm:col-span-3">
          <Field label="Vagas no exterior" labelClassName="text-sm font-semibold text-slate-700">
            <div className="flex h-11 items-center gap-1 rounded-lg border border-slate-300 p-1">
              <AbroadButton active={!filters.abroad} onClick={() => onChange({ abroad: undefined, city: undefined })} label="Brasil" />
              <AbroadButton active={!!filters.abroad} onClick={() => onChange({ abroad: true, city: undefined })} label="Exterior" />
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MultiSelect
          label="Modalidade"
          emptyText="Todas"
          noOptionsText="Nenhuma modalidade"
          countNoun="modalidades"
          options={WORK_TYPE_OPTIONS}
          selected={filters.workType ?? []}
          onChange={(v) => onChange({ workType: v.length ? v : undefined })}
        />

        <MultiSelect
          label="Senioridade"
          emptyText="Qualquer"
          noOptionsText="Nenhuma senioridade"
          countNoun="senioridades"
          options={SENIORITY_OPTIONS}
          selected={filters.seniority ?? []}
          onChange={(v) => onChange({ seniority: v.length ? v : undefined })}
        />

        <MultiSelect
          label="Contrato"
          emptyText="Qualquer"
          noOptionsText="Nenhum contrato"
          countNoun="contratos"
          options={CONTRACT_TYPE_OPTIONS}
          selected={filters.contractType ?? []}
          onChange={(v) => onChange({ contractType: v.length ? v : undefined })}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <MultiSelect
            label="Área"
            emptyText="Todas"
            noOptionsText="Nenhuma área ainda"
            countNoun="áreas"
            options={meta.categories.map((c) => ({ value: c, label: c }))}
            selected={filters.category ?? []}
            onChange={(v) => onChange({ category: v.length ? v : undefined })}
          />
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
              q: undefined,
              abroad: undefined,
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

type MultiSelectOption = { value: string; label: string };

/** Dropdown com checkboxes — permite escolher uma ou várias opções (cidade, área, modalidade...). */
function MultiSelect({
  label,
  emptyText,
  noOptionsText,
  countNoun,
  options,
  selected,
  onChange,
}: {
  label: string;
  emptyText: string;
  noOptionsText: string;
  countNoun: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
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

  const allSelected = options.length > 0 && selected.length === options.length;
  const someSelected = selected.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleOption(value: string) {
    onChange(selected.includes(value) ? selected.filter((c) => c !== value) : [...selected, value]);
  }

  // Marca todas de uma vez (pra depois ir desmarcando só as que não quer),
  // ou desmarca tudo se já estiverem todas marcadas.
  function toggleAll() {
    onChange(allSelected ? [] : options.map((o) => o.value));
  }

  const selectedLabel = selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : "";
  const buttonLabel = selected.length === 0 ? emptyText : selected.length === 1 ? selectedLabel : `${selected.length} ${countNoun}`;

  return (
    <Field label={label}>
      <div ref={containerRef} className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-11 w-full items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white px-4 text-base focus:border-emerald-500 focus:outline-none"
        >
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1 max-h-96 w-full min-w-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {options.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-slate-400">{noOptionsText}</p>
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
            {options.length > 0 &&
              options.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggleOption(option.value)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {option.label}
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
        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none"
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

function AbroadButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${active ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
}
