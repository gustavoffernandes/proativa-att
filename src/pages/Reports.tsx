import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSurveyData } from "@/hooks/useSurveyData";
import { FormFilter } from "@/components/dashboard/FormFilter";

import { useAuth } from "@/contexts/AuthContext";
import { questions, sections } from "@/data/mockData";
import { exportCompanyReport, exportComparisonReport, exportRawData } from "@/lib/exportUtils";
import { exportCompanyPDF, exportComparisonPDF } from "@/lib/pdfExport";
import {
  PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, getRiskColor, getRiskBgColor,
  calculatePxS, getPRLevelLabel, getPRLevelColor, getPRLevelBgColor, PXS_MATRIX, getMatrixCellPR,
} from "@/lib/proartMethodology";
import { Download, FileText, Building2, GitCompareArrows, Database, FileDown, Loader2, AlertOctagon, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)"];

function RiskBadge({ value, type }: { value: number; type: "positive" | "negative" }) {
  const risk = classifyRisk(value, type);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", getRiskBgColor(risk), getRiskColor(risk))}>
      {getRiskLabel(risk)}
    </span>
  );
}

export default function Reports() {
  const { isCompanyUser } = useAuth();
  const surveyData = useSurveyData();
  const { isLoading, hasData, companies, respondents, getSectionAverage, getCompanyRespondents, getQuestionAverage, getAvailableSections, getAvailableQuestions, getAnswerDistribution, getFormConfigsForCompany } = surveyData;
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareSector, setCompareSector] = useState<string>("");
  const availableSections = getAvailableSections();

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  const effectiveCompany = selectedCompany || companies[0]?.id || "";
  const effectiveCompareIds = compareIds.length > 0 ? compareIds : companies.map(c => c.id);
  const companyForms = getFormConfigsForCompany(effectiveCompany);
  const selectedFormName = selectedFormId
    ? companyForms.find((form) => form.configId === selectedFormId)?.title || "Formulário selecionado"
    : "Todos os formulários";

  const getReportPoolByCompany = (companyId: string) => {
    const companyPool = getCompanyRespondents(companyId);
    if (!selectedFormId || companyId !== effectiveCompany) return companyPool;
    return companyPool.filter((r) => r.configId === selectedFormId);
  };

  const pool = getReportPoolByCompany(effectiveCompany);

  const getQuestionAverageFromPool = (questionId: string, targetPool: typeof pool): number => {
    const withAnswer = targetPool.filter(r => r.answers[questionId] !== undefined);
    if (withAnswer.length === 0) return 0;
    const sum = withAnswer.reduce((acc, r) => acc + (r.answers[questionId] || 0), 0);
    return Math.round((sum / withAnswer.length) * 100) / 100;
  };

  const getAnswerDistributionFromPool = (questionId: string, targetPool: typeof pool) => {
    const withAnswer = targetPool.filter(r => r.answers[questionId] !== undefined);
    return [1, 2, 3, 4, 5].map(value => {
      const count = withAnswer.filter(r => r.answers[questionId] === value).length;
      return {
        value,
        count,
        percentage: withAnswer.length > 0 ? Math.round((count / withAnswer.length) * 100) : 0,
      };
    });
  };

  const getAvailableQuestionsFromPool = (targetPool: typeof pool) => {
    const available = new Set<string>();
    targetPool.forEach(r => Object.keys(r.answers).forEach(k => available.add(k)));
    return questions.filter(q => available.has(q.id));
  };

  const availableQuestionsList = getAvailableQuestionsFromPool(pool);
  const availableSectionsForPool = sections.filter(s => availableQuestionsList.some(q => q.section === s.id));

  const getSectionAverageFromPool = (sectionId: string, targetPool: typeof pool): number => {
    const sectionQuestions = questions.filter(q => q.section === sectionId);
    if (sectionQuestions.length === 0 || targetPool.length === 0) return 0;

    const questionsWithData = sectionQuestions.filter(q => targetPool.some(r => r.answers[q.id] !== undefined));
    if (questionsWithData.length === 0) return 0;

    const avg = questionsWithData.reduce((acc, q) => acc + getQuestionAverageFromPool(q.id, targetPool), 0) / questionsWithData.length;
    return Math.round(avg * 100) / 100;
  };

  const toggleCompare = (id: string) => { const current = effectiveCompareIds; setCompareIds(current.includes(id) ? current.filter(x => x !== id) : [...current, id]); };

  const exportData = { companies, sections: availableSections.length > 0 ? availableSections : sections, questions, respondents, getCompanyRespondents, getSectionAverage, getQuestionAverage, getAnswerDistribution, getAvailableSections, getAvailableQuestions };
  const individualExportData = {
    ...exportData,
    sections: availableSectionsForPool.length > 0 ? availableSectionsForPool : sections,
    respondents: selectedFormId ? respondents.filter(r => r.companyId !== effectiveCompany || r.configId === selectedFormId) : respondents,
    getCompanyRespondents: (companyId: string) => getReportPoolByCompany(companyId),
    getQuestionAverage: (questionId: string, companyId?: string) => getQuestionAverageFromPool(questionId, companyId ? getReportPoolByCompany(companyId) : pool),
    getSectionAverage: (sectionId: string, companyId?: string) => getSectionAverageFromPool(sectionId, companyId ? getReportPoolByCompany(companyId) : pool),
    getAnswerDistribution: (questionId: string, companyId?: string) => getAnswerDistributionFromPool(questionId, companyId ? getReportPoolByCompany(companyId) : pool),
    getAvailableSections: () => availableSectionsForPool,
    getAvailableQuestions: () => availableQuestionsList,
  };

  const handleExport = (type: string, fn: () => void) => {
    try { fn(); toast({ title: "Relatório exportado!", description: `O arquivo ${type} foi baixado.` }); }
    catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); }
  };

  // Factor-level analysis
  const factorResults = ALL_FACTORS.map(f => {
    const qIds = f.questionIds;
    const answers = pool.flatMap(r => qIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
    const avg = answers.length > 0 ? answers.reduce((a, b) => a + b, 0) / answers.length : 0;
    const risk = classifyRisk(avg, f.type);
    return { ...f, avg: Math.round(avg * 100) / 100, risk };
  });

  // P×S Matrix
  const eotAvg = factorResults.filter(f => f.scaleId === "contexto").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "contexto").length);
  const eegColAvg = factorResults.find(f => f.id === "coletivista")?.avg || 0;
  const eistAvg = factorResults.filter(f => f.scaleId === "vivencias").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "vivencias").length);
  const edtAvg = factorResults.filter(f => f.scaleId === "saude").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "saude").length);
  const highRiskCount = pool.filter(r => {
    const negFactors = ALL_FACTORS.filter(f => f.type === "negative");
    return negFactors.some(f => {
      const vals = f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined);
      return vals.length > 0 && (vals.reduce((a, b) => a + b, 0) / vals.length) >= 3.70;
    });
  }).length;
  const pxs = calculatePxS(eotAvg, eegColAvg, eistAvg, edtAvg, pool.length, highRiskCount);

  // Radar data
  const radarData = ALL_FACTORS.map(f => {
    const result = factorResults.find(r => r.id === f.id);
    return { subject: f.shortName, valor: result?.avg || 0 };
  });

  // Sector breakdown (filtered by selected form)
  const sectorAvgs = [...new Set(pool.map(r => r.sector))].sort().map(sector => {
    const sectorPool = pool.filter(r => r.sector === sector);
    const sectionAvgs: Record<string, number> = {};
    availableSectionsForPool.forEach(s => {
      sectionAvgs[s.id] = getSectionAverageFromPool(s.id, sectorPool);
    });
    return { sector, count: sectorPool.length, sectionAvgs };
  });

  // Outliers (filtered by selected form)
  const outliers = (() => {
    const threshold = 1.5;
    const detected: { respondent: any; questionId: string; value: number; sectorAvg: number; deviation: number }[] = [];
    const sectorGroups: Record<string, typeof pool> = {};

    pool.forEach(r => {
      if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
      sectorGroups[r.sector].push(r);
    });

    Object.values(sectorGroups).forEach((sectorRespondents) => {
      if (sectorRespondents.length < 3) return;

      availableQuestionsList.forEach(q => {
        const answers = sectorRespondents.filter(r => r.answers[q.id] !== undefined).map(r => r.answers[q.id]);
        if (answers.length < 3) return;

        const mean = answers.reduce((a, b) => a + b, 0) / answers.length;
        const stdDev = Math.sqrt(answers.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / answers.length);
        if (stdDev === 0) return;

        sectorRespondents.forEach(r => {
          if (r.answers[q.id] === undefined) return;
          const deviation = Math.abs(r.answers[q.id] - mean) / stdDev;
          if (deviation >= threshold) {
            detected.push({
              respondent: r,
              questionId: q.id,
              value: r.answers[q.id],
              sectorAvg: Math.round(mean * 100) / 100,
              deviation: Math.round(deviation * 100) / 100,
            });
          }
        });
      });
    });

    return detected.sort((a, b) => b.deviation - a.deviation).slice(0, 15);
  })();

  // Critical companies (any factor with high risk)
  const criticalCompanies = companies.map(c => {
    const cPool = getCompanyRespondents(c.id);
    const cFactors = ALL_FACTORS.map(f => {
      const answers = cPool.flatMap(r => f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
      const avg = answers.length > 0 ? answers.reduce((a, b) => a + b, 0) / answers.length : 0;
      return { ...f, avg, risk: classifyRisk(avg, f.type) };
    });
    const highRiskFactors = cFactors.filter(f => f.risk === "high");
    const overallAvg = availableSections.length > 0 ? availableSections.reduce((acc, s) => acc + getSectionAverage(s.id, c.id), 0) / availableSections.length : 0;
    return { ...c, average: overallAvg, highRiskFactors, highRiskCount: highRiskFactors.length };
  }).filter(c => c.highRiskCount > 0).sort((a, b) => b.highRiskCount - a.highRiskCount);

  const allSectors = [...new Set(respondents.filter(r => effectiveCompareIds.includes(r.companyId)).map(r => r.sector))].sort();

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Relatórios & Exportação</h1><p className="text-sm text-muted-foreground mt-1">Relatórios baseados no Protocolo PROART (Facas/UnB)</p></div>

        {/* Empresas Críticas */}
        {criticalCompanies.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
            <h3 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2"><AlertOctagon className="h-4 w-4" /> Empresas em Situação Crítica (Fatores com Risco Alto)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {criticalCompanies.map(c => (
                <div key={c.id} className="rounded-lg border border-destructive/20 bg-card p-3">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground mb-2">{getCompanyRespondents(c.id).length} respostas</p>
                  <div className="flex flex-wrap gap-1">
                    {c.highRiskFactors.map(f => (
                      <span key={f.id} className="text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">{f.shortName}: {f.avg.toFixed(1)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relatório Individual */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Relatório Individual</h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
            {!isCompanyUser ? (
              <select value={effectiveCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedFormId(""); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <p className="text-sm font-medium text-foreground">{companies.find(c => c.id === effectiveCompany)?.name}</p>
            )}

            <FormFilter
              forms={companyForms}
              selectedFormId={selectedFormId}
              onChange={setSelectedFormId}
            />

            <div className="flex gap-2 sm:ml-auto">
              <button onClick={() => handleExport("PDF", () => exportCompanyPDF(effectiveCompany, individualExportData))} className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"><FileDown className="h-4 w-4" /> PDF</button>
              <button onClick={() => handleExport("CSV", () => exportCompanyReport(effectiveCompany, individualExportData))} className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"><Download className="h-4 w-4" /> CSV</button>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">Formulário selecionado</p>
            <p className="text-sm font-semibold text-foreground">{selectedFormName}</p>
          </div>

          {/* KPIs + P×S */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-5">
            <div className="rounded-lg bg-muted/50 p-3 text-center"><p className="text-2xl font-bold text-foreground">{pool.length}</p><p className="text-xs text-muted-foreground">Respostas</p></div>
            <div className="rounded-lg bg-muted/50 p-3 text-center"><p className="text-2xl font-bold text-foreground">{availableQuestionsList.length}</p><p className="text-xs text-muted-foreground">Questões</p></div>
            <div className={cn("rounded-lg p-3 text-center", getPRLevelBgColor(pxs.prLevel))}>
              <p className={cn("text-2xl font-bold", getPRLevelColor(pxs.prLevel))}>{pxs.risk}</p>
              <p className="text-xs text-muted-foreground">P×S ({pxs.P}×{pxs.S})</p>
            </div>
            <div className={cn("rounded-lg p-3 text-center", getPRLevelBgColor(pxs.prLevel))}>
              <p className={cn("text-sm font-bold", getPRLevelColor(pxs.prLevel))}>{getPRLevelLabel(pxs.prLevel)}</p>
              <p className="text-xs text-muted-foreground">Classificação</p>
            </div>
          </div>

          {/* Radar - Factors */}
          <div className="rounded-lg border border-border p-4 mb-5">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Target className="h-3 w-3" /> Perfil Radar - 10 Fatores PROART</h4>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={100}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 8 }} />
                  <Radar dataKey="valor" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Factor Table */}
          <div className="overflow-x-auto mb-5">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Resultados por Fator (Metodologia PROART)</h4>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Escala</th>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Fator</th>
                <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Tipo</th>
                <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Média</th>
                <th className="px-4 py-2 text-center font-semibold text-muted-foreground">Classificação</th>
              </tr></thead>
              <tbody>
                {PROART_SCALES.map(scale => scale.factors.map(f => {
                  const result = factorResults.find(r => r.id === f.id);
                  if (!result) return null;
                  return (
                    <tr key={f.id} className="border-b border-border/50">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{scale.shortName}</td>
                      <td className="px-4 py-2 font-medium text-foreground">{f.name}</td>
                      <td className="px-4 py-2 text-center"><span className={cn("text-[10px] px-2 py-0.5 rounded-full", f.type === "positive" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{f.type === "positive" ? "Positiva" : "Negativa"}</span></td>
                      <td className="px-4 py-2 text-center font-bold">{result.avg.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center"><RiskBadge value={result.avg} type={f.type} /></td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

          {/* P×S Matrix Mini */}
          <div className="rounded-lg border border-border p-4 mb-5">
            <h4 className="text-xs font-semibold text-muted-foreground mb-3">Matriz de Risco P×S (Metodologia SESI 2022)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs max-w-md mx-auto">
                <thead><tr><th className="p-1.5"></th>{[1,2,3,4,5].map(s => <th key={s} className="p-1.5 text-center text-muted-foreground font-bold">S={s}</th>)}</tr></thead>
                <tbody>{[5,4,3,2,1].map((p, pi) => (
                  <tr key={p}>
                    <td className="p-1.5 text-center text-muted-foreground font-bold">P={p}</td>
                    {[0,1,2,3,4].map(si => {
                      const val = PXS_MATRIX[pi][si];
                      const pr = getMatrixCellPR(val);
                      const isActive = pxs.P === p && pxs.S === (si + 1);
                      return <td key={si} className={cn("p-1.5 text-center rounded font-medium", isActive && "ring-2 ring-foreground", getPRLevelBgColor(pr))}><span className={getPRLevelColor(pr)}>{val}</span></td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
              <div className="flex flex-wrap justify-center gap-3 mt-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/15" /> NA (1-5) Manter</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/15" /> PR4 (6-9) 180 dias</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning/15" /> PR3 (10-14) 90 dias</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/15" /> PR2 (15-24) 30 dias</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/20" /> PR1 (25) Imediato</span>
              </div>
            </div>
          </div>

          {/* Setor breakdown */}
          {sectorAvgs.length > 0 && (
            <div className="overflow-x-auto mb-5">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Respostas por Setor</h4>
              <table className="w-full text-sm"><thead><tr className="border-b border-border"><th className="px-4 py-2 text-left font-semibold text-muted-foreground">Setor</th><th className="px-4 py-2 text-center font-semibold text-muted-foreground">Resp.</th>{availableSectionsForPool.map(s => <th key={s.id} className="px-4 py-2 text-center font-semibold text-muted-foreground">{s.shortName}</th>)}</tr></thead>
                <tbody>{sectorAvgs.map(sa => (
                  <tr key={sa.sector} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium text-foreground">{sa.sector}</td>
                    <td className="px-4 py-2 text-center text-muted-foreground">{sa.count}</td>
                    {availableSectionsForPool.map(s => {
                      const val = sa.sectionAvgs[s.id] || 0;
                      const scale = PROART_SCALES.find(sc => sc.id === s.id);
                      const scaleType = scale?.type === "positive" ? "positive" as const : "negative" as const;
                      const risk = classifyRisk(val, scaleType);
                      return <td key={s.id} className="px-4 py-2 text-center"><span className={cn("font-medium", getRiskColor(risk))}>{val.toFixed(2)}</span></td>;
                    })}
                  </tr>
                ))}</tbody></table>
            </div>
          )}

          {/* Outliers */}
          {outliers.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <h4 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2"><AlertOctagon className="h-4 w-4" /> Respostas Fora do Padrão</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs"><thead><tr className="border-b border-warning/20"><th className="px-3 py-1.5 text-left text-muted-foreground">Respondente</th><th className="px-3 py-1.5 text-left text-muted-foreground">Setor</th><th className="px-3 py-1.5 text-left text-muted-foreground">Pergunta</th><th className="px-3 py-1.5 text-center text-muted-foreground">Resposta</th><th className="px-3 py-1.5 text-center text-muted-foreground">Média Setor</th><th className="px-3 py-1.5 text-center text-muted-foreground">Desvio</th></tr></thead>
                  <tbody>{outliers.map((o, i) => {
                    const q = availableQuestionsList.find(q => q.id === o.questionId);
                    return (
                      <tr key={i} className="border-b border-warning/10">
                        <td className="px-3 py-1.5 font-medium text-foreground">{o.respondent.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{o.respondent.sector}</td>
                        <td className="px-3 py-1.5 text-foreground max-w-[200px] truncate">{q?.text || o.questionId}</td>
                        <td className="px-3 py-1.5 text-center font-bold text-warning">{o.value}</td>
                        <td className="px-3 py-1.5 text-center text-foreground">{o.sectorAvg}</td>
                        <td className="px-3 py-1.5 text-center"><span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning">{o.deviation}σ</span></td>
                      </tr>
                    );
                  })}</tbody></table>
              </div>
            </div>
          )}
        </div>

        {/* Relatório Comparativo - hide for company_user */}
        {!isCompanyUser && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-primary" /> Relatório Comparativo</h3>
            <div className="flex flex-wrap items-center gap-3 mb-3">{companies.map(c => <button key={c.id} onClick={() => toggleCompare(c.id)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all", effectiveCompareIds.includes(c.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>{c.name}</button>)}</div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select value={compareSector} onChange={e => setCompareSector(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm w-full sm:w-auto">
                <option value="">Todos os setores</option>
                {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {effectiveCompareIds.length >= 2 && <div className="flex flex-wrap gap-2">
              <button onClick={() => handleExport("PDF Comparativo", () => exportComparisonPDF(effectiveCompareIds, exportData, compareSector || undefined))} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"><FileDown className="h-4 w-4" /> PDF Comparativo</button>
              <button onClick={() => handleExport("CSV Comparativo", () => exportComparisonReport(effectiveCompareIds, exportData))} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"><Download className="h-4 w-4" /> CSV Comparativo</button>
            </div>}
          </div>
        )}

        {/* Dados Brutos */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Dados Brutos</h3>
          <button onClick={() => handleExport("Dados Brutos", () => exportRawData(exportData))} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"><Download className="h-4 w-4" /> Exportar CSV</button>
        </div>
      </div>
    </DashboardLayout>
  );
}
