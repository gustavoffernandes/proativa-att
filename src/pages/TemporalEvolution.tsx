import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useAuth } from "@/contexts/AuthContext";
import { questions } from "@/data/mockData";
import {
  PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, getRiskColor, getRiskBgColor,
} from "@/lib/proartMethodology";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, AlertTriangle } from "lucide-react";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)", "hsl(200, 80%, 50%)"];

export default function TemporalEvolution() {
  const { isCompanyUser } = useAuth();
  const { isLoading, hasData, companies, respondents, getAvailableSections } = useSurveyData();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const availableSections = getAvailableSections();

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  const effectiveCompany = isCompanyUser && companies.length === 1 ? companies[0].id : (selectedCompany || companies[0]?.id || "");
  const company = companies.find(c => c.id === effectiveCompany);
  const companyRespondents = respondents.filter(r => r.companyId === effectiveCompany);

  // Group by config_id (each config = a different survey/form application)
  // Since respondents have companyId (which is config_id), we need to check if there are multiple configs for this company
  // For now, group by month of response to show evolution
  const monthGroups: Record<string, typeof respondents> = {};
  companyRespondents.forEach(r => {
    if (!r.responseTimestamp) return;
    const d = new Date(r.responseTimestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(r);
  });

  const sortedMonths = Object.keys(monthGroups).sort();
  const hasMultiplePeriods = sortedMonths.length >= 2;

  // Calculate averages by section per month
  const evolutionBySection = sortedMonths.map(month => {
    const pool = monthGroups[month];
    const row: Record<string, string | number> = { period: month };
    availableSections.forEach(s => {
      const qs = questions.filter(q => q.section === s.id);
      const qsWithData = qs.filter(q => pool.some(r => r.answers[q.id] !== undefined));
      if (qsWithData.length === 0) { row[s.shortName] = 0; return; }
      const avg = qsWithData.reduce((acc, q) => {
        const withAns = pool.filter(r => r.answers[q.id] !== undefined);
        return acc + (withAns.length > 0 ? withAns.reduce((a, r) => a + r.answers[q.id], 0) / withAns.length : 0);
      }, 0) / qsWithData.length;
      row[s.shortName] = Math.round(avg * 100) / 100;
    });
    row.respondentes = pool.length;
    return row;
  });

  // Calculate averages by factor per month
  const evolutionByFactor = sortedMonths.map(month => {
    const pool = monthGroups[month];
    const row: Record<string, string | number> = { period: month };
    ALL_FACTORS.forEach(f => {
      const answers = pool.flatMap(r => f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
      row[f.shortName] = answers.length > 0 ? Math.round((answers.reduce((a, b) => a + b, 0) / answers.length) * 100) / 100 : 0;
    });
    return row;
  });

  // Delta between first and last period
  const firstPeriod = evolutionBySection[0];
  const lastPeriod = evolutionBySection[evolutionBySection.length - 1];
  const deltas = hasMultiplePeriods ? availableSections.map(s => ({
    name: s.shortName,
    primeiro: firstPeriod?.[s.shortName] as number || 0,
    último: lastPeriod?.[s.shortName] as number || 0,
    delta: ((lastPeriod?.[s.shortName] as number || 0) - (firstPeriod?.[s.shortName] as number || 0)),
  })) : [];

  // Radar comparing first vs last
  const radarComparison = hasMultiplePeriods ? availableSections.map(s => ({
    subject: s.shortName,
    [sortedMonths[0]]: firstPeriod?.[s.shortName] as number || 0,
    [sortedMonths[sortedMonths.length - 1]]: lastPeriod?.[s.shortName] as number || 0,
  })) : [];

  // All companies evolution (for admin view)
  const allCompaniesEvolution = !isCompanyUser ? sortedMonths.map(month => {
    const row: Record<string, string | number> = { period: month };
    companies.forEach(c => {
      const pool = respondents.filter(r => {
        if (r.companyId !== c.id || !r.responseTimestamp) return false;
        const d = new Date(r.responseTimestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === month;
      });
      if (pool.length === 0) return;
      const avg = availableSections.reduce((acc, s) => {
        const qs = questions.filter(q => q.section === s.id);
        const qsWithData = qs.filter(q => pool.some(r => r.answers[q.id] !== undefined));
        if (qsWithData.length === 0) return acc;
        return acc + qsWithData.reduce((a, q) => {
          const withAns = pool.filter(r => r.answers[q.id] !== undefined);
          return a + (withAns.length > 0 ? withAns.reduce((x, r) => x + r.answers[q.id], 0) / withAns.length : 0);
        }, 0) / qsWithData.length;
      }, 0) / Math.max(1, availableSections.length);
      row[c.name.split(" ")[0]] = Math.round(avg * 100) / 100;
    });
    return row;
  }) : [];

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingUp className="h-6 w-6 text-primary" /> Evolução Temporal</h1>
            <p className="text-sm text-muted-foreground mt-1">Compare pesquisas da mesma empresa ao longo do tempo</p>
          </div>
          {!isCompanyUser && (
            <select value={effectiveCompany} onChange={e => setSelectedCompany(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm w-full sm:w-auto">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {!hasMultiplePeriods && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Dados insuficientes para evolução temporal</h3>
            <p className="text-xs text-muted-foreground">É necessário ter respostas de pelo menos 2 períodos diferentes para visualizar a evolução. Aplique o formulário novamente após algum tempo para comparar os resultados.</p>
          </div>
        )}

        {hasMultiplePeriods && (
          <>
            {/* KPIs de evolução */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground">Períodos</p>
                <p className="text-2xl font-bold text-foreground">{sortedMonths.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground">Primeiro</p>
                <p className="text-sm font-bold text-foreground">{sortedMonths[0]}</p>
                <p className="text-[10px] text-muted-foreground">{firstPeriod?.respondentes} resp.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground">Último</p>
                <p className="text-sm font-bold text-foreground">{sortedMonths[sortedMonths.length - 1]}</p>
                <p className="text-[10px] text-muted-foreground">{lastPeriod?.respondentes} resp.</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Respostas</p>
                <p className="text-2xl font-bold text-foreground">{companyRespondents.length}</p>
              </div>
            </div>

            {/* Evolution by Section */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold text-card-foreground">Evolução por Escala</h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolutionBySection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {availableSections.map((s, i) => <Line key={s.id} type="monotone" dataKey={s.shortName} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Delta Chart */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Variação: {sortedMonths[0]} → {sortedMonths[sortedMonths.length - 1]}</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deltas} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="primeiro" fill={COLORS[0]} radius={[4, 4, 0, 0]} name="Primeiro período" />
                      <Bar dataKey="último" fill={COLORS[1]} radius={[4, 4, 0, 0]} name="Último período" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Radar comparison */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">Radar: Primeiro vs Último</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarComparison} cx="50%" cy="50%" outerRadius={100}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9 }} />
                      <Radar name={sortedMonths[0]} dataKey={sortedMonths[0]} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.1} strokeWidth={2} />
                      <Radar name={sortedMonths[sortedMonths.length - 1]} dataKey={sortedMonths[sortedMonths.length - 1]} stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.1} strokeWidth={2} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Tabela de variação */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold text-card-foreground">Detalhamento da Variação</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Escala</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">{sortedMonths[0]}</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">{sortedMonths[sortedMonths.length - 1]}</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Variação</th>
                    <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Tendência</th>
                  </tr></thead>
                  <tbody>{deltas.map(d => (
                    <tr key={d.name} className="border-b border-border/50">
                      <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-center text-muted-foreground">{d.primeiro.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center text-foreground font-medium">{d.último.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn("font-bold", d.delta > 0 ? "text-success" : d.delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                          {d.delta > 0 ? "+" : ""}{d.delta.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-lg">
                        {d.delta > 0.1 ? "📈" : d.delta < -0.1 ? "📉" : "➡️"}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* All companies evolution - admin only */}
        {!isCompanyUser && allCompaniesEvolution.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Evolução de Todas as Empresas</h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={allCompaniesEvolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {companies.map((c, i) => <Line key={c.id} type="monotone" dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
