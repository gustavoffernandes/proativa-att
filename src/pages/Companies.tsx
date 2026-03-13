import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Loader2, Edit2, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CompanyEntry {
  cnpj: string;
  company_name: string;
  sector: string;
  employee_count: number | null;
  form_count: number;
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function cleanCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export default function Companies() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ company_name: "", cnpj: "", sector: "", employee_count: "" });
  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", sector: "", employee_count: "" });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["google-forms-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_forms_config")
        .select("*")
        .order("company_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Group configs by CNPJ to build company list
  const companies: CompanyEntry[] = [];
  const cnpjMap = new Map<string, { name: string; sector: string; employee_count: number | null; count: number }>();

  configs.forEach((c: any) => {
    const cnpj = c.cnpj || "";
    if (!cnpj) return;
    const isPlaceholder = c.spreadsheet_id === "__placeholder__";
    if (cnpjMap.has(cnpj)) {
      if (!isPlaceholder) cnpjMap.get(cnpj)!.count++;
    } else {
      cnpjMap.set(cnpj, { name: c.company_name, sector: c.sector || "", employee_count: c.employee_count || null, count: isPlaceholder ? 0 : 1 });
    }
  });

  cnpjMap.forEach((val, cnpj) => {
    companies.push({ cnpj, company_name: val.name, sector: val.sector, employee_count: val.employee_count, form_count: val.count });
  });

  const addCompany = useMutation({
    mutationFn: async (data: typeof formData) => {
      const cnpjDigits = cleanCNPJ(data.cnpj);
      if (cnpjDigits.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");

      const existing = configs.find((c: any) => c.cnpj === cnpjDigits);
      if (existing) throw new Error("Já existe uma empresa cadastrada com este CNPJ");

      const { error } = await supabase.from("google_forms_config").insert([{
        company_name: data.company_name,
        cnpj: cnpjDigits,
        spreadsheet_id: "__placeholder__",
        sheet_name: "Form Responses 1",
        is_active: false,
        sector: data.sector || null,
        employee_count: data.employee_count ? parseInt(data.employee_count) : null,
      }] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      setShowForm(false);
      setFormData({ company_name: "", cnpj: "", sector: "", employee_count: "" });
      toast({ title: "Empresa cadastrada com sucesso!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ cnpj, newName, sector, employee_count }: { cnpj: string; newName: string; sector: string; employee_count: string }) => {
      const updateData: any = { company_name: newName };
      if (sector !== undefined) updateData.sector = sector || null;
      if (employee_count !== undefined) updateData.employee_count = employee_count ? parseInt(employee_count) : null;

      const { error } = await (supabase
        .from("google_forms_config") as any)
        .update(updateData)
        .eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      setEditingCnpj(null);
      toast({ title: "Empresa atualizada!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteCompany = useMutation({
    mutationFn: async (cnpj: string) => {
      const configIds = configs.filter((c: any) => c.cnpj === cnpj).map((c: any) => c.id);
      // Delete user_roles referencing these configs
      for (const configId of configIds) {
        await (supabase.from("user_roles") as any).delete().eq("company_id", configId);
      }
      // Delete survey_responses
      for (const configId of configIds) {
        await supabase.from("survey_responses").delete().eq("config_id", configId);
      }
      // Delete configs
      const { error } = await (supabase
        .from("google_forms_config") as any)
        .delete()
        .eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      queryClient.invalidateQueries({ queryKey: ["google-forms-config-all"] });
      queryClient.invalidateQueries({ queryKey: ["survey-responses"] });
      toast({ title: "Empresa removida!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
            <p className="text-sm text-muted-foreground mt-1">Cadastre e gerencie as empresas mentoradas</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" /> Nova Empresa
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
            <h3 className="text-sm font-semibold text-card-foreground">Cadastrar Empresa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Nome Fantasia</label>
                <input
                  value={formData.company_name}
                  onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                  placeholder="Ex: TechSol Ltda"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">CNPJ</label>
                <input
                  value={formData.cnpj}
                  onChange={e => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
                <p className="text-[10px] text-muted-foreground">O CNPJ serve como identificador único.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Setor de Atuação</label>
                <input
                  value={formData.sector}
                  onChange={e => setFormData({ ...formData, sector: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                  placeholder="Ex: Tecnologia, Indústria, Saúde..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Número de Funcionários</label>
                <input
                  type="number"
                  value={formData.employee_count}
                  onChange={e => setFormData({ ...formData, employee_count: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                  placeholder="Ex: 50"
                  min="1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addCompany.mutate(formData)}
                disabled={addCompany.isPending || !formData.company_name || cleanCNPJ(formData.cnpj).length !== 14}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {addCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Salvar
              </button>
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Empresa" para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map(company => (
              <div key={company.cnpj} className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editingCnpj === company.cnpj ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Nome Fantasia</label>
                            <input
                              value={editData.name}
                              onChange={e => setEditData({ ...editData, name: e.target.value })}
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                              autoFocus
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Setor</label>
                            <input
                              value={editData.sector}
                              onChange={e => setEditData({ ...editData, sector: e.target.value })}
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                              placeholder="Ex: Tecnologia"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Nº de Funcionários</label>
                            <input
                              type="number"
                              value={editData.employee_count}
                              onChange={e => setEditData({ ...editData, employee_count: e.target.value })}
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                              placeholder="Ex: 50"
                              min="1"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCompany.mutate({ cnpj: company.cnpj, newName: editData.name, sector: editData.sector, employee_count: editData.employee_count })}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                          >
                            <Check className="h-3 w-3" /> Salvar
                          </button>
                          <button onClick={() => setEditingCnpj(null)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
                            <X className="h-3 w-3" /> Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-card-foreground">{company.company_name}</h3>
                          <button
                            onClick={() => { setEditingCnpj(company.cnpj); setEditData({ name: company.company_name, sector: company.sector || "", employee_count: company.employee_count ? String(company.employee_count) : "" }); }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(company.cnpj)}</p>
                        {company.sector && <p className="text-xs text-muted-foreground">Setor: {company.sector}</p>}
                        {company.employee_count && <p className="text-xs text-muted-foreground">Funcionários: {company.employee_count}</p>}
                        <p className="text-xs text-muted-foreground">{company.form_count} formulário(s) vinculado(s)</p>
                      </>
                    )}
                  </div>
                  {editingCnpj !== company.cnpj && (
                    <button
                      onClick={() => { if (confirm(`Remover empresa "${company.company_name}" e todos os formulários vinculados?`)) deleteCompany.mutate(company.cnpj); }}
                      className="rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
