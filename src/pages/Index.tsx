import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useActionPlans } from "@/hooks/useActionPlans";
import { useAuth } from "@/contexts/AuthContext";
import { questions } from "@/data/mockData";
import {
  PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, getRiskColor, getRiskBgColor,
  calculatePxS, getPRLevelLabel, getPRLevelColor, getPRLevelBgColor,
} from "@/lib/proartMethodology";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from "recharts";
import { Building2, Users, ClipboardCheck, TrendingUp, Loader2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)"];

export default function Index() {
  const { isCompanyUser } = useAuth();
  const { isLoading, hasData, companies, respondents, getSectionAverage, getCompanyRespondents, getAvailableSections } = useSurveyData();
  const { plans, tasks, isLoading: loadingPlans } = useActionPlans();
  const availableSections = getAvailableSections();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const isFullLoading = isLoading || loadingPlans;

  if (isFullLoading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!hasData) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground">Nenhum dado sincronizado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isCompanyUser ? "Nenhum dado disponível para sua empresa." : "Vá para <strong>Integrações</strong> para configurar e sincronizar dados."}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  // Filter respondents by date range
  const dateFiltered = respondents.filter(r => {
    if (!startDate && !endDate) return true;
    if (!r.responseTimestamp) return false;
    const ts = new Date(r.responseTimestamp);
    if (startDate && ts < startDate) return false;
    if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); if (ts > end) return false; }
    return true;
  });

  const totalRespondents = dateFiltered.length;
  const totalCompanies = companies.length;
  const overallAvg = availableSections.length > 0 ? availableSections.reduce((acc, s) => acc + getSectionAverage(s.id), 0) / availableSections.length : 0;

  const companyRanking = companies.map((c) => {
    const avg = availableSections.length > 0 ? availableSections.reduce((acc, s) => acc + getSectionAverage(s.id, c.id), 0) / availableSections.length : 0;
    return { ...c, average: Math.round(avg * 100) / 100, respondentCount: getCompanyRespondents(c.id).length };
  }).sort((a, b) => b.average - a.average);

  const benchmarkData = companies.map((c) => {
    const row: Record<string, string | number> = { name: c.name.split(" ")[0] };
    availableSections.forEach((s) => { row[s.shortName] = getSectionAverage(s.id, c.id); });
    return row;
  });

  const radarData = availableSections.map((s) => ({
    subject: s.shortName,
    ...Object.fromEntries(companies.map((c) => [c.name.split(" ")[0], getSectionAverage(s.id, c.id)])),
  }));

  // Evolution timeline - group responses by month
  const timelineData: Record<string, { month: string; [key: string]: string | number }>  = {};
  respondents.forEach(r => {
    if (!r.responseTimestamp) return;
    const d = new Date(r.responseTimestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!timelineData[key]) {
      timelineData[key] = { month: key };
    }
  });

  const sortedMonths = Object.keys(timelineData).sort();
  const evolutionData = sortedMonths.map(month => {
    const row: Record<string, string | number> = { month };
    companies.forEach(c => {
      const monthRespondents = respondents.filter(r => {
        if (!r.responseTimestamp || r.companyId !== c.id) return false;
        const d = new Date(r.responseTimestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` <= month;
      });
      if (monthRespondents.length === 0) return;
      const avg = availableSections.reduce((acc, s) => {
        const qs = questions.filter(q => q.section === s.id);
        const qsWithData = qs.filter(q => monthRespondents.some(r => r.answers[q.id] !== undefined));
        if (qsWithData.length === 0) return acc;
        return acc + qsWithData.reduce((a, q) => {
          const withAns = monthRespondents.filter(r => r.answers[q.id] !== undefined);
          return a + (withAns.length > 0 ? withAns.reduce((x, r) => x + r.answers[q.id], 0) / withAns.length : 0);
        }, 0) / qsWithData.length;
      }, 0) / availableSections.length;
      row[c.name.split(" ")[0]] = Math.round(avg * 100) / 100;
    });
    return row;
  });

  const subtitle = isCompanyUser && companies.length === 1
    ? `Dados da empresa ${companies[0].name}`
    : "Benchmark consolidado de todas as empresas";

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Visão Geral</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!isCompanyUser && <KPICard title="Empresas Ativas" value={totalCompanies} subtitle="configuradas" sparkData={[totalCompanies]} color="hsl(217, 71%, 45%)" />}
          <KPICard title="Total Respostas" value={totalRespondents} subtitle="respondentes" sparkData={[totalRespondents]} color="hsl(170, 60%, 45%)" />
          <KPICard title="Média Geral" value={overallAvg.toFixed(2)} subtitle="escala 1-5" sparkData={[overallAvg]} color="hsl(38, 92%, 55%)" />
          <KPICard title="Escalas PROART" value={availableSections.length} subtitle={`de 4 escalas`} sparkData={[availableSections.length]} color="hsl(280, 60%, 55%)" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">{isCompanyUser ? "Resultado por Pilar" : "Benchmark por Pilar"}</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarkData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {availableSections.map((s, i) => <Bar key={s.id} dataKey={s.shortName} fill={COLORS[i]} radius={[4, 4, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Perfil Comparativo (Radar)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={100}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9 }} />
                  {companies.map((c, i) => <Radar key={c.id} name={c.name.split(" ")[0]} dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} strokeWidth={2} />)}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Evolution Timeline */}
        {evolutionData.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Evolução Temporal</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {companies.map((c, i) => <Line key={c.id} type="monotone" dataKey={c.name.split(" ")[0]} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Ranking - hide for company_user since they only see 1 company */}
        {!isCompanyUser && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground">Ranking de Empresas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Empresa</th>
                    <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Respostas</th>
                    {availableSections.map((s) => <th key={s.id} className="px-4 py-3 text-center font-semibold text-muted-foreground">{s.shortName}</th>)}
                    <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {companyRanking.map((c, i) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{c.respondentCount}</td>
                      {availableSections.map((s) => <td key={s.id} className="px-4 py-3 text-center"><span className="font-medium">{getSectionAverage(s.id, c.id).toFixed(1)}</span></td>)}
                      <td className="px-4 py-3 text-center"><span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{c.average.toFixed(2)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action Plan Progress */}
        {plans.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-card-foreground flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Execução dos Planos de Ação</h3>
            <div className="space-y-3">
              {companies.map(c => {
                const cPlans = plans.filter(p => p.company_config_id === c.id);
                if (cPlans.length === 0) return null;
                const cTasks = tasks.filter(t => cPlans.some(p => p.id === t.action_plan_id));
                const completedTasks = cTasks.filter(t => t.is_completed).length;
                const progress = cTasks.length > 0 ? Math.round((completedTasks / cTasks.length) * 100) : 0;
                const hasOverdue = cPlans.some(p => {
                  const created = new Date(p.created_at);
                  const deadline = new Date(created.getTime() + p.deadline_days * 24 * 60 * 60 * 1000);
                  return p.status !== "completed" && deadline < new Date();
                });
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        {hasOverdue && <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">ATRASADO</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{cPlans.length} plano(s) · {completedTasks}/{cTasks.length} tarefas</p>
                    </div>
                    <div className="w-32"><Progress value={progress} className="h-2" /></div>
                    <span className="text-sm font-bold text-foreground w-12 text-right">{progress}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
