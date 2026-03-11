import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useAuth } from "@/contexts/AuthContext";
import { questions, sections } from "@/data/mockData";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import {
  PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, getRiskColor, getRiskBgColor,
} from "@/lib/proartMethodology";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)", "hsl(200, 80%, 50%)"];

export default function CompanyComparison() {
  const { isCompanyUser } = useAuth();
  const { isLoading, hasData, companies, respondents, getSectionAverage, getCompanyRespondents, getAvailableSections, getSectorAverages, getQuestionAverage } = useSurveyData();
  const [selected, setSelected] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState<"company" | "sector" | "factor">("company");
  const [sectorCompanyId, setSectorCompanyId] = useState<string>("");
  const [crossSector, setCrossSector] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [sectorFilter, setSectorFilter] = useState<string>("");
  const availableSections = getAvailableSections();
  const effectiveSelected = selected.length > 0 ? selected : companies.map(c => c.id);
  const toggle = (id: string) => { const current = effectiveSelected; setSelected(current.includes(id) ? current.filter(x => x !== id) : [...current, id]); };

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  // Date filter
  const dateFiltered = respondents.filter(r => {
    if (!startDate && !endDate) return true;
    if (!r.responseTimestamp) return false;
    const ts = new Date(r.responseTimestamp);
    if (startDate && ts < startDate) return false;
    if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); if (ts > end) return false; }
    return true;
  });

  // Sector filter
  const allSectors = [...new Set(respondents.map(r => r.sector))].sort();
  const filteredByAll = sectorFilter ? dateFiltered.filter(r => r.sector === sectorFilter) : dateFiltered;

  const selectedCompanies = companies.filter(c => effectiveSelected.includes(c.id));

  // Custom averages that respect date/sector filters
  const getFilteredAverage = (sectionId: string, companyId: string) => {
    const pool = filteredByAll.filter(r => r.companyId === companyId);
    const qs = questions.filter(q => q.section === sectionId);
    const qsWithData = qs.filter(q => pool.some(r => r.answers[q.id] !== undefined));
    if (qsWithData.length === 0) return 0;
    const avg = qsWithData.reduce((acc, q) => {
      const withAns = pool.filter(r => r.answers[q.id] !== undefined);
      return acc + (withAns.length > 0 ? withAns.reduce((a, r) => a + r.answers[q.id], 0) / withAns.length : 0);
    }, 0) / qsWithData.length;
    return Math.round(avg * 100) / 100;
  };

  // Sections to display
  const displaySections = sectionFilter ? availableSections.filter(s => s.id === sectionFilter) : availableSections;

  // Company comparison data
  const data = displaySections.map((s) => {
    const row: Record<string, string | number> = { name: s.shortName };
    selectedCompanies.forEach(c => { row[c.name.split(" ")[0]] = getFilteredAverage(s.id, c.id); });
    return row;
  });

  const radarData = displaySections.map((s) => {
    const row: Record<string, string | number> = { subject: s.shortName };
    selectedCompanies.forEach(c => { row[c.name.split(" ")[0]] = getFilteredAverage(s.id, c.id); });
    return row;
  });

  // Sector comparison
  const effectiveSectorCompany = sectorCompanyId || companies[0]?.id || "";
  const sectorAvgs = getSectorAverages(effectiveSectorCompany);
  const sectorChartData = displaySections.map(s => {
    const row: Record<string, string | number> = { name: s.shortName };
    sectorAvgs.forEach(sa => { row[sa.sector.substring(0, 8)] = sa.sectionAvgs[s.id] || 0; });
    return row;
  });

  // Cross-company sector comparison
  const effectiveCrossSector = crossSector || allSectors[0] || "";
  const crossSectorData = effectiveCrossSector ? displaySections.map(s => {
    const row: Record<string, string | number> = { name: s.shortName };
    selectedCompanies.forEach(c => {
      const pool = filteredByAll.filter(r => r.companyId === c.id && r.sector === effectiveCrossSector);
      if (pool.length === 0) { row[c.name.split(" ")[0]] = 0; return; }
      const qs = questions.filter(q => q.section === s.id);
      const qsWithData = qs.filter(q => pool.some(r => r.answers[q.id] !== undefined));
      if (qsWithData.length === 0) { row[c.name.split(" ")[0]] = 0; return; }
      const avg = qsWithData.reduce((acc, q) => {
        const withAns = pool.filter(r => r.answers[q.id] !== undefined);
        return acc + (withAns.length > 0 ? withAns.reduce((a, r) => a + r.answers[q.id], 0) / withAns.length : 0);
      }, 0) / qsWithData.length;
      row[c.name.split(" ")[0]] = Math.round(avg * 100) / 100;
    });
    return row;
  }) : [];

  // Factor-level comparison
  const factorData = ALL_FACTORS.map(f => {
    const row: Record<string, string | number> = { name: f.shortName };
    selectedCompanies.forEach(c => {
      const pool = filteredByAll.filter(r => r.companyId === c.id);
      const answers = pool.flatMap(r => f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
      row[c.name.split(" ")[0]] = answers.length > 0 ? Math.round((answers.reduce((a, b) => a + b, 0) / answers.length) * 100) / 100 : 0;
    });
    return row;
  });

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comparação</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare desempenho entre empresas, setores e fatores</p>
        </div>

        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCompareMode("company")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-all", compareMode === "company" ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>Por Empresa</button>
          <button onClick={() => setCompareMode("factor")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-all", compareMode === "factor" ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>Por Fator</button>
          <button onClick={() => setCompareMode("sector")} className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-all", compareMode === "sector" ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>Por Setor</button>
        </div>

        {/* Global filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          {compareMode !== "sector" && (
            <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
              <option value="">Todos os pilares</option>
              {availableSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
            <option value="">Todos os setores</option>
            {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </div>

        {compareMode === "company" && (
          <>
            <div className="flex flex-wrap gap-2">
              {companies.map(c => {
                const pool = filteredByAll.filter(r => r.companyId === c.id);
                return (
                  <button key={c.id} onClick={() => toggle(c.id)}
                    className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      effectiveSelected.includes(c.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} /> {c.name} ({pool.length})
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Comparação por Pilar</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCompanies.map((c, i) => <Bar key={c.id} dataKey={c.name.split(" ")[0]} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Radar Comparativo</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={100}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9 }} />
                      {selectedCompanies.map((c, i) => <Radar key={c.id} name={c.name.split(" ")[0]} dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} strokeWidth={2} />)}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Tendência por Pilar</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCompanies.map((c, i) => <Line key={c.id} type="monotone" dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold text-card-foreground">Mesmo Setor entre Empresas</h3>
                <select value={effectiveCrossSector} onChange={e => setCrossSector(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm mb-3 w-full">
                  {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={crossSectorData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCompanies.map((c, i) => <Bar key={c.id} dataKey={c.name.split(" ")[0]} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Tabela comparativa detalhada */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold text-card-foreground">Tabela Comparativa Detalhada</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Empresa</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Resp.</th>
                    {displaySections.map(s => <th key={s.id} className="px-4 py-2 text-center font-semibold text-muted-foreground">{s.shortName}</th>)}
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Média</th>
                  </tr></thead>
                  <tbody>{selectedCompanies.map(c => {
                    const pool = filteredByAll.filter(r => r.companyId === c.id);
                    const avgs = displaySections.map(s => getFilteredAverage(s.id, c.id));
                    const overall = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
                    return (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-center text-muted-foreground">{pool.length}</td>
                        {avgs.map((v, i) => <td key={i} className="px-4 py-2 text-center"><span className={cn("font-medium", v < 2.3 ? "text-destructive" : v >= 3.7 ? "text-success" : "text-foreground")}>{v.toFixed(2)}</span></td>)}
                        <td className="px-4 py-2 text-center"><span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{overall.toFixed(2)}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {compareMode === "factor" && (
          <>
            <div className="flex flex-wrap gap-2">
              {companies.map(c => {
                const pool = filteredByAll.filter(r => r.companyId === c.id);
                return (
                  <button key={c.id} onClick={() => toggle(c.id)}
                    className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      effectiveSelected.includes(c.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} /> {c.name} ({pool.length})
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Comparação por Fator (10 Fatores PROART)</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={factorData} barCategoryGap="15%" layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selectedCompanies.map((c, i) => <Bar key={c.id} dataKey={c.name.split(" ")[0]} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Radar por Fator</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={factorData} cx="50%" cy="50%" outerRadius={120}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 8 }} />
                      {selectedCompanies.map((c, i) => <Radar key={c.id} name={c.name.split(" ")[0]} dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} strokeWidth={2} />)}
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Factor detail table */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold text-card-foreground">Detalhamento por Fator</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Escala</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Fator</th>
                    {selectedCompanies.map(c => <th key={c.id} className="px-3 py-2 text-center font-semibold text-muted-foreground">{c.name.split(" ")[0]}</th>)}
                  </tr></thead>
                  <tbody>{ALL_FACTORS.map(f => {
                    const scale = PROART_SCALES.find(s => s.id === f.scaleId);
                    return (
                      <tr key={f.id} className="border-b border-border/50">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{scale?.shortName}</td>
                        <td className="px-3 py-2 text-xs font-medium text-foreground">{f.name}</td>
                        {selectedCompanies.map(c => {
                          const pool = filteredByAll.filter(r => r.companyId === c.id);
                          const answers = pool.flatMap(r => f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
                          const avg = answers.length > 0 ? answers.reduce((a, b) => a + b, 0) / answers.length : 0;
                          const risk = classifyRisk(avg, f.type);
                          return <td key={c.id} className="px-3 py-2 text-center">
                            <span className={cn("font-medium text-xs", getRiskColor(risk))}>{avg.toFixed(2)}</span>
                          </td>;
                        })}
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {compareMode === "sector" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={effectiveSectorCompany} onChange={e => setSectorCompanyId(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
                <option value="">Todos os pilares</option>
                {availableSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Setores por Pilar</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sectorChartData} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {sectorAvgs.map((sa, i) => <Bar key={sa.sector} dataKey={sa.sector.substring(0, 8)} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Radar por Setor</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={sectorChartData.map(d => ({ ...d, subject: d.name }))} cx="50%" cy="50%" outerRadius={100}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9 }} />
                      {sectorAvgs.map((sa, i) => <Radar key={sa.sector} name={sa.sector} dataKey={sa.sector.substring(0, 8)} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} strokeWidth={2} />)}
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold text-card-foreground">Detalhamento por Setor</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border"><th className="px-4 py-2 text-left font-semibold text-muted-foreground">Setor</th><th className="px-4 py-2 text-center font-semibold text-muted-foreground">Resp.</th>{displaySections.map(s => <th key={s.id} className="px-4 py-2 text-center font-semibold text-muted-foreground">{s.shortName}</th>)}</tr></thead>
                  <tbody>{sectorAvgs.map(sa => (
                    <tr key={sa.sector} className="border-b border-border/50">
                      <td className="px-4 py-2 font-medium text-foreground">{sa.sector}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{sa.count}</td>
                      {displaySections.map(s => {
                        const val = sa.sectionAvgs[s.id] || 0;
                        return <td key={s.id} className="px-4 py-2 text-center"><span className={cn("font-medium", val < 2.3 ? "text-destructive" : val >= 3.7 ? "text-success" : "text-foreground")}>{val.toFixed(2)}</span></td>;
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
