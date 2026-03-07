import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HeatmapTable } from "@/components/dashboard/HeatmapTable";
import { MultiSelectCompanies } from "@/components/dashboard/MultiSelectCompanies";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export default function Heatmap() {
  const { isCompanyUser } = useAuth();
  const [activeSection, setActiveSection] = useState("contexto");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const { isLoading, hasData, companies, respondents, getAvailableSections, getAvailableQuestions, getQuestionAverage } = useSurveyData();
  const availableSections = getAvailableSections();

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  const filteredRespondents = respondents.filter(r => {
    if (!r.responseTimestamp) return !startDate && !endDate;
    const ts = new Date(r.responseTimestamp);
    if (startDate && ts < startDate) return false;
    if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); if (ts > end) return false; }
    return true;
  });

  const effectiveCompanies = selectedCompanies.length > 0 ? companies.filter(c => selectedCompanies.includes(c.id)) : companies;

  const customGetQuestionAverage = (questionId: string, companyId?: string): number => {
    let pool = filteredRespondents;
    if (companyId) pool = pool.filter(r => r.companyId === companyId);
    if (selectedCompanies.length > 0 && !companyId) pool = pool.filter(r => selectedCompanies.includes(r.companyId));
    const withAnswer = pool.filter(r => r.answers[questionId] !== undefined);
    if (withAnswer.length === 0) return 0;
    return Math.round((withAnswer.reduce((acc, r) => acc + (r.answers[questionId] || 0), 0) / withAnswer.length) * 100) / 100;
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Heatmap de Satisfação</h1>
          <p className="text-sm text-muted-foreground mt-1">Mapa de calor comparativo entre empresas</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {availableSections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-all", activeSection === s.id ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                {s.shortName}
              </button>
            ))}
          </div>
          {!isCompanyUser && <MultiSelectCompanies companies={companies} selected={selectedCompanies} onChange={setSelectedCompanies} />}
          <DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
        </div>
        <HeatmapTable sectionId={activeSection} companies={effectiveCompanies} getQuestionAverage={customGetQuestionAverage} getAvailableQuestions={getAvailableQuestions} />
      </div>
    </DashboardLayout>
  );
}
