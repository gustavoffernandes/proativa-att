import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [formData, setFormData] = useState({ company_name: "", cnpj: "", spreadsheet_id: "", sheet_name: "Form Responses 1", form_url: "" });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["google-forms-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("google_forms_config").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FormConfig[];
    },
  });

  const addConfig = useMutation({
    mutationFn: async (newConfig: typeof formData) => {
      const cnpjDigits = newConfig.cnpj.replace(/\D/g, "");
      const { error } = await supabase.from("google_forms_config").insert([{
        company_name: newConfig.company_name,
        cnpj: cnpjDigits || null,
        spreadsheet_id: newConfig.spreadsheet_id,
        sheet_name: newConfig.sheet_name,
        form_url: newConfig.form_url || null,
      }] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      setShowForm(false);
      setFormData({ company_name: "", cnpj: "", spreadsheet_id: "", sheet_name: "Form Responses 1", form_url: "" });
      toast({ title: "Configuração adicionada!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("google_forms_config").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["google-forms-config"] }); toast({ title: "Configuração removida!" }); },
  });

  const syncConfig = useMutation({
    mutationFn: async (configId: string) => {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", { body: { config_id: configId } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["survey-responses"] }); queryClient.invalidateQueries({ queryKey: ["google-forms-config"] }); toast({ title: "Sincronização concluída!", description: `${data?.rows_synced || 0} respostas sincronizadas.` }); },
    onError: (e: Error) => toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" }),
  });

  const displayCNPJ = (cnpj: string | null) => {
    if (!cnpj) return null;
    return formatCNPJ(cnpj);
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Integração Google Sheets</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure a sincronização automática de dados do Google Forms</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0">
            <Plus className="h-4 w-4" /> Novo Formulário
          </button>
        </div>

        {/* Passo a Passo */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4">
          <h2 className="text-lg font-semibold text-card-foreground">Como configurar a integração</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Crie um Google Form com as perguntas do PROATIVA</li>
            <li>Vincule as respostas a uma planilha Google Sheets</li>
            <li>Compartilhe a planilha com acesso de <strong>leitura</strong> para a conta de serviço</li>
            <li>Copie o <strong>ID da planilha</strong> (parte da URL entre /d/ e /edit)</li>
            <li>Adicione a configuração abaixo informando a empresa, CNPJ e o ID</li>
          </ol>
        </div>

        {showForm && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
            <h3 className="text-sm font-semibold text-card-foreground">Nova Configuração</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Nome da Empresa</label>
                <input value={formData.company_name} onChange={e => setFormData({ ...formData, company_name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="Ex: TechSol Ltda" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">CNPJ</label>
                <input value={formData.cnpj} onChange={e => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="00.000.000/0000-00" maxLength={18} />
                <p className="text-[10px] text-muted-foreground">Identifica a empresa de forma única. Permite cadastrar múltiplos formulários para a mesma empresa.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">ID da Planilha</label>
                <input value={formData.spreadsheet_id} onChange={e => setFormData({ ...formData, spreadsheet_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="ID do Google Sheets" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Nome da Aba</label>
                <input value={formData.sheet_name} onChange={e => setFormData({ ...formData, sheet_name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-foreground">URL do Formulário (opcional)</label>
                <input value={formData.form_url} onChange={e => setFormData({ ...formData, form_url: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="https://docs.google.com/forms/..." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => addConfig.mutate(formData)} disabled={addConfig.isPending || !formData.company_name || !formData.spreadsheet_id} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors">{addConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar</button>
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : configs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center"><Link2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p></div>
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
                    {config.cnpj && <p className="text-xs text-muted-foreground">CNPJ: {displayCNPJ(config.cnpj)}</p>}
                    <p className="text-xs text-muted-foreground truncate">Planilha: {config.spreadsheet_id}</p>
                    {config.last_sync_at && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="h-3 w-3" /> Última sync: {new Date(config.last_sync_at).toLocaleString("pt-BR")}</p>}
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
