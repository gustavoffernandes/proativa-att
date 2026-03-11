import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useActionPlans } from "@/hooks/useActionPlans";
import {
  PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, getRiskColor, getRiskBgColor,
  calculatePxS, getPRLevelLabel, getPRLevelColor, getPRLevelBgColor,
  getSuggestedActions, PXS_MATRIX, getMatrixCellPR,
  type PRLevel, type RiskLevel,
} from "@/lib/proartMethodology";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, CheckCircle2, Clock, AlertTriangle, Trash2, ChevronDown, ChevronUp, MessageSquare, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export default function ActionPlans() {
  const { user, isCompanyUser } = useAuth();
  const { isLoading: loadingSurvey, hasData, companies, respondents, getSectionAverage, getCompanyRespondents, getAvailableSections } = useSurveyData();
  const { plans, tasks, isLoading: loadingPlans, createPlan, updatePlanStatus, deletePlan, createTask, updateTask, deleteTask } = useActionPlans();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingObs, setEditingObs] = useState<string | null>(null);
  const [obsText, setObsText] = useState("");

  const isLoading = loadingSurvey || loadingPlans;
  const readOnly = isCompanyUser;

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  const effectiveCompany = isCompanyUser && companies.length === 1 ? companies[0].id : (selectedCompany || companies[0]?.id || "");
  const company = companies.find(c => c.id === effectiveCompany);
  const pool = getCompanyRespondents(effectiveCompany);
  const availableSections = getAvailableSections();
  const companyPlans = plans.filter(p => p.company_config_id === effectiveCompany);

  const factorResults = ALL_FACTORS.map(f => {
    const qIds = f.questionIds;
    const answers = pool.flatMap(r => qIds.map(qId => r.answers[qId]).filter(v => v !== undefined));
    const avg = answers.length > 0 ? answers.reduce((a, b) => a + b, 0) / answers.length : 0;
    const risk = classifyRisk(avg, f.type);
    return { ...f, avg: Math.round(avg * 100) / 100, risk };
  });

  const eotAvg = factorResults.filter(f => f.scaleId === "contexto").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "contexto").length);
  const eegColAvg = factorResults.find(f => f.id === "coletivista")?.avg || 0;
  const eistAvg = factorResults.filter(f => f.scaleId === "vivencias").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "vivencias").length);
  const edtAvg = factorResults.filter(f => f.scaleId === "saude").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorResults.filter(f => f.scaleId === "saude").length);
  const highRiskCount = pool.filter(r => {
    const negAvgs = factorResults.filter(f => f.type === "negative").map(f => {
      const vals = f.questionIds.map(qId => r.answers[qId]).filter(v => v !== undefined);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return negAvgs.some(v => v >= 3.70);
  }).length;

  const pxs = calculatePxS(eotAvg, eegColAvg, eistAvg, edtAvg, pool.length, highRiskCount);

  const handleGeneratePlans = async () => {
    if (!user || readOnly) return;
    const riskyFactors = factorResults.filter(f => f.risk === "high" || f.risk === "medium");
    for (const factor of riskyFactors) {
      const existing = companyPlans.find(p => p.factor_id === factor.id);
      if (existing) continue;
      const suggested = getSuggestedActions(factor.id, factor.risk);
      if (!suggested) continue;
      const plan = await createPlan({
        company_config_id: effectiveCompany,
        user_id: user.id,
        title: suggested.title,
        description: `Fator: ${factor.name} | Média: ${factor.avg} | ${getRiskLabel(factor.risk)}`,
        factor_id: factor.id,
        risk_level: pxs.prLevel,
        risk_score: pxs.risk,
        deadline_days: pxs.deadlineDays,
        status: "pending",
      });
      if (plan) {
        for (const taskTitle of suggested.tasks) {
          await createTask({ action_plan_id: plan.id, title: taskTitle });
        }
      }
    }
  };

  const getPlanProgress = (planId: string) => {
    const planTasks = tasks.filter(t => t.action_plan_id === planId);
    if (planTasks.length === 0) return 0;
    return Math.round((planTasks.filter(t => t.is_completed).length / planTasks.length) * 100);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "in_progress": return <Clock className="h-4 w-4 text-warning" />;
      default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Plano de Ação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {readOnly ? "Visualização dos planos de ação da sua empresa" : "Gestão de planos baseados no diagnóstico PROART"}
            </p>
          </div>
          {!isCompanyUser && (
            <select value={effectiveCompany} onChange={e => setSelectedCompany(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm w-full sm:w-auto">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {/* P×S Matrix Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Matriz de Risco P×S</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Probabilidade</p>
                <p className="text-2xl font-bold text-foreground">{pxs.P}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Severidade</p>
                <p className="text-2xl font-bold text-foreground">{pxs.S}</p>
              </div>
              <div className={cn("rounded-lg p-3 text-center", getPRLevelBgColor(pxs.prLevel))}>
                <p className="text-xs text-muted-foreground">Risco P×S</p>
                <p className={cn("text-2xl font-bold", getPRLevelColor(pxs.prLevel))}>{pxs.risk}</p>
              </div>
            </div>
            <div className={cn("rounded-lg p-3 text-center", getPRLevelBgColor(pxs.prLevel))}>
              <p className={cn("text-sm font-bold", getPRLevelColor(pxs.prLevel))}>{getPRLevelLabel(pxs.prLevel)}</p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="p-1"></th>{[1,2,3,4,5].map(s => <th key={s} className="p-1 text-center text-muted-foreground">S={s}</th>)}</tr></thead>
                <tbody>{[5,4,3,2,1].map((p, pi) => (
                  <tr key={p}>
                    <td className="p-1 text-center text-muted-foreground font-medium">P={p}</td>
                    {[0,1,2,3,4].map(si => {
                      const val = PXS_MATRIX[pi][si];
                      const pr = getMatrixCellPR(val);
                      const isActive = pxs.P === p && pxs.S === (si + 1);
                      return <td key={si} className={cn("p-1 text-center rounded", isActive ? "ring-2 ring-foreground font-bold" : "", getPRLevelBgColor(pr))}><span className={getPRLevelColor(pr)}>{val}</span></td>;
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-sm font-semibold text-card-foreground mb-4">Diagnóstico por Fator</h3>
            <div className="space-y-2">
              {factorResults.map(f => (
                <div key={f.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{PROART_SCALES.find(s => s.id === f.scaleId)?.shortName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">{f.avg.toFixed(2)}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getRiskBgColor(f.risk), getRiskColor(f.risk))}>
                      {getRiskLabel(f.risk)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Generate Plans Button - only for non-company users */}
        {!readOnly && (
          <div className="flex items-center gap-3">
            <button onClick={handleGeneratePlans} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> Gerar Plano de Ação Automático
            </button>
            <span className="text-xs text-muted-foreground">{companyPlans.length} plano(s) criado(s)</span>
          </div>
        )}

        {readOnly && companyPlans.length > 0 && (
          <p className="text-xs text-muted-foreground">{companyPlans.length} plano(s) de ação</p>
        )}

        {/* Action Plans List */}
        {companyPlans.length > 0 && (
          <div className="space-y-3">
            {companyPlans.map(plan => {
              const progress = getPlanProgress(plan.id);
              const planTasks = tasks.filter(t => t.action_plan_id === plan.id);
              const isExpanded = expandedPlan === plan.id;

              return (
                <div key={plan.id} className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
                  <div className="p-4 cursor-pointer" onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(plan.status)}
                          <h4 className="text-sm font-semibold text-foreground">{plan.title}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">{progress}%</p>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getPRLevelBgColor(plan.risk_level as PRLevel), getPRLevelColor(plan.risk_level as PRLevel))}>
                            {plan.risk_level}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <Progress value={progress} className="mt-3 h-2" />
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-3">
                      {/* Status controls - only for non-company users */}
                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          {(["pending", "in_progress", "completed"] as const).map(s => (
                            <button key={s} onClick={() => updatePlanStatus(plan.id, s)} className={cn("text-xs px-3 py-1 rounded-full border transition-colors", plan.status === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                              {s === "pending" ? "Pendente" : s === "in_progress" ? "Em andamento" : "Concluído"}
                            </button>
                          ))}
                          <button onClick={() => deletePlan(plan.id)} className="ml-auto text-xs text-destructive hover:text-destructive/80 flex items-center gap-1">
                            <Trash2 className="h-3 w-3" /> Excluir
                          </button>
                        </div>
                      )}

                      {readOnly && (
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs px-3 py-1 rounded-full border bg-primary text-primary-foreground border-primary")}>
                            {plan.status === "pending" ? "Pendente" : plan.status === "in_progress" ? "Em andamento" : "Concluído"}
                          </span>
                        </div>
                      )}

                      {/* Tasks */}
                      <div className="space-y-2">
                        {planTasks.map(task => (
                          <div key={task.id} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                            {readOnly ? (
                              <span className={cn("mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                task.is_completed ? "bg-primary border-primary" : "border-border")}>
                                {task.is_completed && <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </span>
                            ) : (
                              <input type="checkbox" checked={task.is_completed} onChange={() => updateTask(task.id, { is_completed: !task.is_completed })} className="mt-0.5 h-4 w-4 rounded border-border accent-primary" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs", task.is_completed ? "line-through text-muted-foreground" : "text-foreground")}>{task.title}</p>
                              {task.observation && <p className="text-[10px] text-muted-foreground mt-1 italic">📝 {task.observation}</p>}
                              {!readOnly && (
                                <div className="flex items-center gap-2 mt-1">
                                  <button onClick={() => { setEditingObs(editingObs === task.id ? null : task.id); setObsText(task.observation || ""); }} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" /> {task.observation ? "Editar obs." : "Adicionar obs."}
                                  </button>
                                  <button onClick={() => deleteTask(task.id)} className="text-[10px] text-destructive hover:underline">Excluir</button>
                                </div>
                              )}
                              {!readOnly && editingObs === task.id && (
                                <div className="mt-2 flex gap-2">
                                  <input value={obsText} onChange={e => setObsText(e.target.value)} placeholder="Observação..." className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs" />
                                  <button onClick={() => { updateTask(task.id, { observation: obsText }); setEditingObs(null); }} className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Salvar</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add task - only for non-company users */}
                      {!readOnly && (
                        <div className="flex gap-2">
                          <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Nova tarefa..." className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs" onKeyDown={e => { if (e.key === "Enter" && newTaskTitle.trim()) { createTask({ action_plan_id: plan.id, title: newTaskTitle.trim() }); setNewTaskTitle(""); } }} />
                          <button onClick={() => { if (newTaskTitle.trim()) { createTask({ action_plan_id: plan.id, title: newTaskTitle.trim() }); setNewTaskTitle(""); } }} className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground"><Plus className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Companies Progress Overview - only for non-company users */}
        {!isCompanyUser && companies.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-sm font-semibold text-card-foreground mb-4">Progresso por Empresa</h3>
            <div className="space-y-3">
              {companies.map(c => {
                const cPlans = plans.filter(p => p.company_config_id === c.id);
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
                        {!hasOverdue && progress === 100 && cPlans.length > 0 && <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">CONCLUÍDO</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{cPlans.length} plano(s) · {completedTasks}/{cTasks.length} tarefas</p>
                    </div>
                    <div className="w-32">
                      <Progress value={progress} className="h-2" />
                    </div>
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
