import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FormConfig {
  id: string;
  company_name: string;
  cnpj: string | null;
  spreadsheet_id: string;
  sheet_name: string;
  form_url: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export default function GoogleSheetsConfig() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ company_cnpj: "", spreadsheet_id: "", sheet_name: "Form Responses 1", form_url: "" });

  // Fetch all configs (including placeholders for company list)
  const { data: allConfigs = [], isLoading: loadingAll } = useQuery({
    queryKey: ["google-forms-config-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("google_forms_config").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FormConfig[];
    },
  });

  // Active form configs (exclude placeholders)
  const configs = allConfigs.filter(c => c.spreadsheet_id !== "__placeholder__");

  // Build list of registered companies (unique by CNPJ)
  const companiesMap = new Map<string, string>();
  allConfigs.forEach(c => {
    if (c.cnpj && !companiesMap.has(c.cnpj)) {
      companiesMap.set(c.cnpj, c.company_name);
    }
  });
  const registeredCompanies = Array.from(companiesMap.entries()).map(([cnpj, name]) => ({ cnpj, name }));

  const selectedCompanyName = registeredCompanies.find(c => c.cnpj === formData.company_cnpj)?.name || "";

  const addConfig = useMutation({
    mutationFn: async (newConfig: typeof formData) => {
      if (!newConfig.company_cnpj) throw new Error("Selecione uma empresa");
      const companyName = registeredCompanies.find(c => c.cnpj === newConfig.company_cnpj)?.name || "";
      const { error } = await supabase.from("google_forms_config").insert([{
        company_name: companyName,
        cnpj: newConfig.company_cnpj,
        spreadsheet_id: newConfig.spreadsheet_id,
        sheet_name: newConfig.sheet_name,
        form_url: newConfig.form_url || null,
        is_active: true,
      }] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      setShowForm(false);
      setFormData({ company_cnpj: "", spreadsheet_id: "", sheet_name: "Form Responses 1", form_url: "" });
      toast({ title: "Formulário adicionado!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      // First delete any user_roles referencing this config to avoid constraint violations
      await (supabase.from("user_roles") as any).delete().eq("company_id", id);
      const { error } = await supabase.from("google_forms_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      toast({ title: "Formulário removido!" });
    },
  });

  const syncConfig = useMutation({
    mutationFn: async (configId: string) => {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", { body: { config_id: configId } });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data, configId) => {
      // Also update last_sync_at from client side as fallback
      await supabase
        .from("google_forms_config")
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq("id", configId);
      queryClient.invalidateQueries({ queryKey: ["survey-responses"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      toast({ title: "Sincronização concluída!", description: `${data?.rows_synced || 0} respostas sincronizadas.` });
    },
    onError: (e: Error) => toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Integração Google Sheets</h1>
            <p className="text-sm text-muted-foreground mt-1">Vincule formulários do Google Forms às empresas cadastradas</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0">
            <Plus className="h-4 w-4" /> Novo Formulário
          </button>
        </div>

        {/* Passo a Passo */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h2 className="text-lg font-semibold text-card-foreground">Como configurar a integração</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Cadastre a empresa na aba <strong>Empresas</strong> (nome fantasia + CNPJ)</li>
            <li>Crie um Google Form com as perguntas do PROATIVA</li>
            <li>Vincule as respostas a uma planilha Google Sheets</li>
            <li>Compartilhe a planilha com acesso de <strong>leitura</strong> para a conta de serviço</li>
            <li>Copie o <strong>ID da planilha</strong> (parte da URL entre /d/ e /edit)</li>
            <li>Adicione o formulário abaixo selecionando a empresa e informando o ID da planilha</li>
          </ol>
        </div>

        {showForm && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
            <h3 className="text-sm font-semibold text-card-foreground">Novo Formulário</h3>
            {registeredCompanies.length === 0 ? (
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
                Nenhuma empresa cadastrada. <a href="/empresas-cadastro" className="underline font-medium">Cadastre uma empresa</a> antes de adicionar um formulário.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Empresa</label>
                    <select
                      value={formData.company_cnpj}
                      onChange={e => setFormData({ ...formData, company_cnpj: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                    >
                      <option value="">Selecione uma empresa...</option>
                      {registeredCompanies.map(c => (
                        <option key={c.cnpj} value={c.cnpj}>{c.name} ({formatCNPJ(c.cnpj)})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">ID da Planilha</label>
                    <input value={formData.spreadsheet_id} onChange={e => setFormData({ ...formData, spreadsheet_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="ID do Google Sheets" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Nome da Aba</label>
                    <input value={formData.sheet_name} onChange={e => setFormData({ ...formData, sheet_name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">URL do Formulário (opcional)</label>
                    <input value={formData.form_url} onChange={e => setFormData({ ...formData, form_url: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="https://docs.google.com/forms/..." />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addConfig.mutate(formData)} disabled={addConfig.isPending || !formData.company_cnpj || !formData.spreadsheet_id} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors">{addConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar</button>
                  <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
                </div>
              </>
            )}
          </div>
        )}

        {loadingAll ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : configs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center"><Link2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhum formulário configurado.</p></div>
        ) : (
          <div className="space-y-3">
            {configs.map(config => (
              <div key={config.id} className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-card-foreground truncate">{config.company_name}</h3>
                      {config.is_active ? <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> Ativa</span> : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" /> Inativa</span>}
                    </div>
                    {config.cnpj && <p className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(config.cnpj)}</p>}
                    <p className="text-xs text-muted-foreground truncate">Planilha: {config.spreadsheet_id}</p>
                    <p className="text-xs text-muted-foreground truncate">Aba: {config.sheet_name}</p>
                    {config.last_sync_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Última sincronização: {new Date(config.last_sync_at).toLocaleDateString("pt-BR")} às {new Date(config.last_sync_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    )}
                    {!config.last_sync_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" /> Ainda não sincronizado
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {config.form_url && <a href={config.form_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><ExternalLink className="h-4 w-4" /></a>}
                    <button onClick={() => syncConfig.mutate(config.id)} disabled={syncConfig.isPending} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors">{syncConfig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sincronizar</button>
                    <button onClick={() => { if (confirm("Tem certeza?")) deleteConfig.mutate(config.id); }} className="rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
