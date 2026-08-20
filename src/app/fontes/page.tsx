"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Pause, Pencil, Play, RefreshCw, Trash2, X } from "lucide-react";
import { ADMIN_KEY_STORAGE_KEY, useAdminKey } from "@/lib/useAdminKey";
import { Pagination } from "@/components/Pagination";
import type { JobSource } from "@/lib/types";

const PAGE_SIZE = 10;

function formatDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR");
}

const emptyForm = { name: "", city: "", source_url: "", site_url: "" };

type SourceType = "generic" | "remotive" | "adzuna" | "ats";
type AtsMatch = { connector: "greenhouse" | "lever"; slug: string; count: number; sampleTitles: string[] };

export default function FontesPage() {
  const adminKey = useAdminKey();
  const [sources, setSources] = useState<JobSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [activeCity, setActiveCity] = useState<string>("");
  const [page, setPage] = useState(1);

  const [sourceType, setSourceType] = useState<SourceType>("generic");
  const [adzunaWhat, setAdzunaWhat] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverMatches, setDiscoverMatches] = useState<AtsMatch[] | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<AtsMatch | null>(null);

  function resetSourceTypeFields() {
    setAdzunaWhat("");
    setCompanyQuery("");
    setDiscoverMatches(null);
    setSelectedMatch(null);
  }

  async function handleDiscover() {
    if (!companyQuery.trim()) return;
    setDiscovering(true);
    setDiscoverMatches(null);
    setSelectedMatch(null);
    try {
      const res = await fetch("/api/sources/discover", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ companyName: companyQuery.trim() }),
      });
      const data = await res.json();
      setDiscoverMatches(res.ok ? (data.matches ?? []) : []);
    } finally {
      setDiscovering(false);
    }
  }

  function authHeaders() {
    return { "Content-Type": "application/json", "x-admin-key": adminKey ?? "" };
  }

  function loadSources() {
    if (!adminKey) return;
    setLoading(true);
    setAuthError(false);
    fetch("/api/sources", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          setAuthError(true);
          return [];
        }
        return r.json();
      })
      .then(setSources)
      .finally(() => setLoading(false));
  }

  useEffect(loadSources, [adminKey]);

  const cityTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sources) counts.set(s.city, (counts.get(s.city) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [sources]);

  const filteredSources = activeCity ? sources.filter((s) => s.city === activeCity) : sources;
  const totalPages = Math.max(1, Math.ceil(filteredSources.length / PAGE_SIZE));
  const pageSources = filteredSources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function selectCity(city: string) {
    setActiveCity(city);
    setPage(1);
  }

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function startEdit(source: JobSource) {
    setEditingId(source.id);
    setSourceType("generic");
    resetSourceTypeFields();
    setForm({
      name: source.name,
      city: source.city,
      source_url: source.source_url,
      site_url: source.site_url ?? "",
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/sources/${editingId}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.error ?? "Erro ao salvar alterações.");
          return;
        }
        setMessage("Fonte atualizada.");
        setEditingId(null);
        setForm(emptyForm);
        loadSources();
        return;
      }

      let payload: Record<string, string>;
      if (sourceType === "remotive") {
        payload = { name: form.name || "Remotive", city: form.city || "Remoto", connector: "remotive" };
      } else if (sourceType === "adzuna") {
        payload = { name: form.name, city: form.city, connector: "adzuna", connector_config: adzunaWhat };
      } else if (sourceType === "ats") {
        if (!selectedMatch) {
          setMessage("Busque e escolha uma empresa detectada antes de cadastrar.");
          return;
        }
        payload = { name: form.name, city: form.city, connector: selectedMatch.connector, connector_config: selectedMatch.slug };
      } else {
        payload = form;
      }

      const res = await fetch("/api/sources", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Erro ao cadastrar fonte.");
        return;
      }
      if (data.sync?.success) {
        const via = data.sync.mode === "html" ? "varrendo a página de vagas" : `via ${data.sync.mode}`;
        setMessage(`Fonte cadastrada! ${data.sync.count} vaga(s) importada(s) ${via}.`);
      } else {
        setMessage(`Fonte cadastrada, mas a sincronização falhou: ${data.sync?.error ?? "erro desconhecido"}.`);
      }
      setForm(emptyForm);
      resetSourceTypeFields();
      loadSources();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      await fetch(`/api/sources/${id}/sync`, { method: "POST", headers: authHeaders() });
      loadSources();
    } finally {
      setSyncingId(null);
    }
  }

  async function handleToggleStatus(source: JobSource) {
    const nextStatus = source.status === "active" ? "paused" : "active";
    await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status: nextStatus }),
    });
    loadSources();
  }

  async function handleDelete(source: JobSource) {
    if (!confirm(`Remover "${source.name}" e todas as vagas dela?`)) return;
    await fetch(`/api/sources/${source.id}`, { method: "DELETE", headers: authHeaders() });
    loadSources();
  }

  if (adminKey === undefined) {
    return null;
  }

  if (adminKey === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Área restrita</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">O cadastro de fontes de vagas é reservado ao administrador do VagasHub.</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Chave de admin inválida</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          A chave salva neste navegador não é reconhecida pelo servidor. Acesse novamente pela URL com{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">?admin_key=SUA_CHAVE</code> pra corrigir.
        </p>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
            window.location.reload();
          }}
          className="mt-4 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          Limpar chave salva
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fontes de vagas</h1>
        <p className="text-sm text-slate-500">
          Cadastre de onde tirar as vagas: uma integração pronta (Remotive, Adzuna, ou detectando a empresa automaticamente
          na Greenhouse/Lever), ou uma URL genérica (feed estruturado ou página de listagem) quando você já souber o link.
          Sincronizamos automaticamente 1x por dia — ou clique em &quot;Sincronizar agora&quot; quando quiser.
        </p>
      </div>

      {!editingId && (
        <div className="flex flex-wrap gap-2">
          <SourceTypeTab active={sourceType === "generic"} onClick={() => setSourceType("generic")} label="URL genérica" />
          <SourceTypeTab active={sourceType === "remotive"} onClick={() => setSourceType("remotive")} label="Remotive" />
          <SourceTypeTab active={sourceType === "adzuna"} onClick={() => setSourceType("adzuna")} label="Adzuna" />
          <SourceTypeTab active={sourceType === "ats"} onClick={() => setSourceType("ats")} label="Empresa (detectar automaticamente)" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {sourceType === "generic" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Nome da fonte (empresa ou site de vagas)" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="Cidade base" required value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
            <Input
              label="URL do feed ou da página de vagas"
              required
              type="url"
              value={form.source_url}
              onChange={(v) => setForm((f) => ({ ...f, source_url: v }))}
              placeholder="https://empresa.com.br/carreiras..."
            />
            <Input label="Site (opcional)" type="url" value={form.site_url} onChange={(v) => setForm((f) => ({ ...f, site_url: v }))} placeholder="https://..." />
          </div>
        )}

        {sourceType === "remotive" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Importa vagas 100% remotas da API pública da Remotive, filtradas pra quem pode se candidatar do Brasil (Brasil,
              LATAM, Américas ou mundial). Sem salário — a maioria é cotada em dólar, e o resto do site assume R$.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Nome (opcional)" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Remotive" />
              <Input label="Cidade base (opcional)" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Remoto" />
            </div>
          </div>
        )}

        {sourceType === "adzuna" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Busca vagas no Brasil via API da Adzuna (inclui presencial/híbrido). Precisa de{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">ADZUNA_APP_ID</code>/
              <code className="rounded bg-slate-100 px-1 py-0.5">ADZUNA_APP_KEY</code> configurados no servidor.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Nome da fonte" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Adzuna - Campinas" />
              <Input label="Cidade (where)" required value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Campinas" />
              <Input
                label="O que buscar (what)"
                value={adzunaWhat}
                onChange={setAdzunaWhat}
                placeholder="desenvolvedor designer analista de dados"
              />
            </div>
            <p className="text-xs text-slate-400">
              Pra mais de uma opção, separe por espaço — a busca traz vaga de qualquer um dos termos (não precisa bater com
              todos). Deixe em branco pra trazer todas as vagas da cidade, sem filtrar por cargo.
            </p>
          </div>
        )}

        {sourceType === "ats" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Digite o nome da empresa — o sistema tenta achar sozinho a API pública de vagas dela na Greenhouse ou na Lever
              (as duas plataformas de recrutamento mais comuns que expõem isso).
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Input label="Nome da empresa" value={companyQuery} onChange={setCompanyQuery} placeholder="Ex.: Nubank" />
              </div>
              <button
                type="button"
                onClick={handleDiscover}
                disabled={discovering || !companyQuery.trim()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {discovering ? "Buscando..." : "Detectar"}
              </button>
            </div>

            {discoverMatches !== null &&
              (discoverMatches.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma API pública encontrada pra esse nome nessas plataformas. Tente outra variação do nome, ou cadastre pela URL genérica se você já tiver o link.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {discoverMatches.map((m) => (
                    <label
                      key={`${m.connector}:${m.slug}`}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
                        selectedMatch?.slug === m.slug && selectedMatch.connector === m.connector
                          ? "border-emerald-600 bg-emerald-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ats-match"
                        className="mt-1"
                        checked={selectedMatch?.slug === m.slug && selectedMatch.connector === m.connector}
                        onChange={() => {
                          setSelectedMatch(m);
                          setForm((f) => ({ ...f, name: f.name || companyQuery }));
                        }}
                      />
                      <span>
                        <span className="font-medium text-slate-800">
                          {m.connector === "greenhouse" ? "Greenhouse" : "Lever"} · {m.slug} · {m.count} vaga(s)
                        </span>
                        {m.sampleTitles.length > 0 && <span className="block text-slate-500">{m.sampleTitles.join(" · ")}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              ))}

            {selectedMatch && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Nome da fonte" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder={companyQuery} />
                <Input label="Cidade base" required value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Nacional" />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? (editingId ? "Salvando..." : "Cadastrando...") : editingId ? "Salvar alterações" : "Cadastrar e sincronizar"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              <X size={14} />
              Cancelar edição
            </button>
          )}
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
      </form>

      <ScopedLinkGenerator />

      {!loading && sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <CityTab active={activeCity === ""} onClick={() => selectCity("")} label={`Todas (${sources.length})`} />
          {cityTabs.map(([city, count]) => (
            <CityTab key={city} active={activeCity === city} onClick={() => selectCity(city)} label={`${city} (${count})`} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-center text-slate-400">Carregando...</p>
        ) : sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Nenhuma fonte cadastrada ainda.</div>
        ) : (
          pageSources.map((source) => (
            <div key={source.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{source.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      source.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {source.status === "active" ? "Ativa" : "Pausada"}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {source.city} · {source.jobs_count} vagas · última sync: {formatDate(source.last_synced_at)}
                </p>
                {source.last_sync_status === "error" && <p className="text-sm text-rose-600">Erro na última sincronização: {source.last_sync_error}</p>}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <ActionButton
                  onClick={() => handleSync(source.id)}
                  disabled={syncingId === source.id}
                  icon={<RefreshCw size={14} className={syncingId === source.id ? "animate-spin" : ""} />}
                  label={syncingId === source.id ? "Sincronizando..." : "Sincronizar agora"}
                />
                <ActionButton
                  onClick={() => handleToggleStatus(source)}
                  icon={source.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                  label={source.status === "active" ? "Pausar" : "Ativar"}
                />
                <ActionButton onClick={() => startEdit(source)} icon={<Pencil size={14} />} label="Editar" />
                <ActionButton onClick={() => handleDelete(source)} icon={<Trash2 size={14} />} label="Remover" variant="danger" />
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && filteredSources.length > 0 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
    </main>
  );
}

function SourceTypeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function CityTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
    >
      {label}
    </button>
  );
}

/**
 * Monta o link com `?cities=...` (ver src/lib/useCityScope.ts) marcando as
 * cidades numa lista, em vez de digitar o nome delas na mão (arriscado com
 * acento/maiúscula — precisa bater exatamente com o valor salvo).
 */
function ScopedLinkGenerator() {
  const [cities, setCities] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m) => setCities(m.cities ?? []))
      .catch(() => {});
  }, []);

  function toggleCity(city: string) {
    setCopied(false);
    setSelected((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  }

  const allSelected = cities.length > 0 && selected.length === cities.length;

  function toggleAll() {
    setCopied(false);
    setSelected(allSelected ? [] : [...cities]);
  }

  const link = selected.length > 0 && typeof window !== "undefined" ? `${window.location.origin}/?cities=${encodeURIComponent(selected.join(","))}` : "";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Gerar link para um visitante</h2>
      <p className="mt-1 text-sm text-slate-500">
        Marque as cidades que essa pessoa deve ver. O link gerado restringe o site àquelas cidades, sem nenhum aviso visível pra quem abre.
      </p>

      {cities.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nenhuma cidade com vagas ainda.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
              allSelected ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            Marcar todas
          </label>
          <div className="w-px self-stretch bg-slate-200" />
          {cities.map((city) => (
            <label
              key={city}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                selected.includes(city) ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
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

      {link && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{link}</code>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado!" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        variant === "danger" ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-slate-300 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
    </label>
  );
}
