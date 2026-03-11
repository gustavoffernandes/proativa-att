import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { sections, questions } from "@/data/mockData";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)", "hsl(200, 80%, 50%)"];

export default function Demographics() {
  const { isCompanyUser } = useAuth();
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const { isLoading, hasData, companies, respondents, getAvailableSections } = useSurveyData();
  const availableSections = getAvailableSections();

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  const effectiveCompanyFilter = isCompanyUser && companies.length === 1 ? companies[0].id : companyFilter;
  const effectiveSections = selectedSections.length > 0 ? availableSections.filter(s => selectedSections.includes(s.id)) : availableSections;

  const toggleSection = (id: string) => {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const dateFiltered = respondents.filter(r => {
    if (!startDate && !endDate) return true;
    if (!r.responseTimestamp) return false;
    const ts = new Date(r.responseTimestamp);
    if (startDate && ts < startDate) return false;
    if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); if (ts > end) return false; }
    return true;
  });
  const companyPool = effectiveCompanyFilter ? dateFiltered.filter(r => r.companyId === effectiveCompanyFilter) : dateFiltered;
  const availableSectors = [...new Set(companyPool.map(r => r.sector))].sort();
  const pool = sectorFilter ? companyPool.filter(r => r.sector === sectorFilter) : companyPool;

  function groupAverage(group: typeof pool, sectionId: string): number {
    const qs = questions.filter(q => q.section === sectionId);
    if (group.length === 0 || qs.length === 0) return 0;
    const qsWithData = qs.filter(q => group.some(r => r.answers[q.id] !== undefined));
    if (qsWithData.length === 0) return 0;
    const sum = group.reduce((acc, r) => acc + qsWithData.reduce((a, q) => a + (r.answers[q.id] || 0), 0), 0);
    return Math.round((sum / (group.length * qsWithData.length)) * 100) / 100;
  }

  const sexGroups = [...new Set(pool.map(r => r.sex))];
  const sexData = sexGroups.map(s => ({ name: s, count: pool.filter(r => r.sex === s).length }));
  const sexPerception = sexGroups.map(s => ({
    name: s.substring(0, 8),
    ...Object.fromEntries(effectiveSections.map(sec => [sec.shortName, groupAverage(pool.filter(r => r.sex === s), sec.id)])),
  }));

  const ageRanges = [{ label: "18-25", min: 18, max: 25 }, { label: "26-35", min: 26, max: 35 }, { label: "36-45", min: 36, max: 45 }, { label: "46-55", min: 46, max: 55 }, { label: "56+", min: 56, max: 100 }];
  const ageData = ageRanges.map(r => ({
    name: r.label,
    ...Object.fromEntries(effectiveSections.map(s => [s.shortName, groupAverage(pool.filter(resp => resp.age >= r.min && resp.age <= r.max), s.id)])),
  }));

  const sectorList = [...new Set(pool.map(r => r.sector))];
  // Use first effective section for sector bar chart
  const sectorSectionId = effectiveSections[0]?.id || "contexto";
  const sectorData = sectorList.map(s => ({
    name: s.substring(0, 10),
    média: groupAverage(pool.filter(r => r.sector === s), sectorSectionId),
    count: pool.filter(r => r.sector === s).length,
  }));

  const radarData = effectiveSections.map(s => ({
    subject: s.shortName,
    "Geral": groupAverage(pool, s.id),
    ...Object.fromEntries(sexGroups.map(sg => [sg.substring(0, 4), groupAverage(pool.filter(r => r.sex === sg), s.id)])),
  }));

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perfil Demográfico</h1>
          <p className="text-sm text-muted-foreground mt-1">Cruzamento entre dados demográficos e percepção</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          {!isCompanyUser && (
            <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSectorFilter(""); }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
              <option value="">Todas as empresas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
            <option value="">Todos os setores</option>
            {availableSectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </div>

        {/* Section checkboxes */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-medium text-muted-foreground self-center mr-1">Pilares:</span>
          {availableSections.map(s => {
            const isSelected = selectedSections.length === 0 || selectedSections.includes(s.id);
            return (
              <button key={s.id} onClick={() => toggleSection(s.id)}
                className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                  isSelected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                <span className={cn("h-3 w-3 rounded-sm border flex items-center justify-center",
                  isSelected ? "bg-primary border-primary" : "border-border")}>
                  {isSelected && <svg className="h-2 w-2 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                {s.shortName}
              </button>
            );
          })}
          {selectedSections.length > 0 && (
            <button onClick={() => setSelectedSections([])} className="text-xs text-muted-foreground hover:text-foreground underline">Limpar</button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Distribuição por Gênero</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={sexData} cx="50%" cy="50%" outerRadius={90} dataKey="count" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {sexData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Radar Demográfico por Gênero</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 8 }} />
                  <Radar dataKey="Geral" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.1} strokeWidth={2} />
                  {sexGroups.map((sg, i) => (
                    <Radar key={sg} dataKey={sg.substring(0, 4)} stroke={COLORS[(i + 1) % COLORS.length]} fill={COLORS[(i + 1) % COLORS.length]} fillOpacity={0.05} strokeWidth={1.5} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Gênero × Percepção por Pilar</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sexPerception} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {effectiveSections.map((s, i) => <Bar key={s.id} dataKey={s.shortName} fill={COLORS[i]} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Faixa Etária × Percepção</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {effectiveSections.map((s, i) => <Bar key={s.id} dataKey={s.shortName} fill={COLORS[i]} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Setor × Média ({effectiveSections.find(s => s.id === sectorSectionId)?.shortName || sectorSectionId})</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="média" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
