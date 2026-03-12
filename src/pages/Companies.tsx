import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Loader2, Edit2, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CompanyEntry {
  cnpj: string;
  company_name: string;
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
  const [formData, setFormData] = useState({ company_name: "", cnpj: "" });
  const [editingCnpj, setEditingCnpj] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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
  const cnpjMap = new Map<string, { name: string; count: number }>();

  configs.forEach((c: any) => {
    const cnpj = c.cnpj || "";
    if (!cnpj) return;
    if (cnpjMap.has(cnpj)) {
      cnpjMap.get(cnpj)!.count++;
    } else {
      cnpjMap.set(cnpj, { name: c.company_name, count: 1 });
    }
  });

  cnpjMap.forEach((val, cnpj) => {
    companies.push({ cnpj, company_name: val.name, form_count: val.count });
  });

  const addCompany = useMutation({
    mutationFn: async (data: { company_name: string; cnpj: string }) => {
      const cnpjDigits = cleanCNPJ(data.cnpj);
      if (cnpjDigits.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");

      // Check if CNPJ already exists
      const existing = configs.find((c: any) => c.cnpj === cnpjDigits);
      if (existing) throw new Error("Já existe uma empresa cadastrada com este CNPJ");

      // Create a placeholder config entry for this company (no spreadsheet yet)
      const { error } = await supabase.from("google_forms_config").insert([{
        company_name: data.company_name,
        cnpj: cnpjDigits,
        spreadsheet_id: "__placeholder__",
        sheet_name: "Form Responses 1",
        is_active: false,
      }] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      setShowForm(false);
      setFormData({ company_name: "", cnpj: "" });
      toast({ title: "Empresa cadastrada com sucesso!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateCompanyName = useMutation({
    mutationFn: async ({ cnpj, newName }: { cnpj: string; newName: string }) => {
      const { error } = await (supabase
        .from("google_forms_config") as any)
        .update({ company_name: newName })
        .eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
      setEditingCnpj(null);
      toast({ title: "Nome atualizado!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteCompany = useMutation({
    mutationFn: async (cnpj: string) => {
      const { error } = await (supabase
        .from("google_forms_config") as any)
        .delete()
        .eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-forms-config"] });
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
                <p className="text-[10px] text-muted-foreground">O CNPJ serve como identificador único. Não é possível cadastrar duas empresas com o mesmo CNPJ.</p>
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
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
                          autoFocus
                        />
                        <button
                          onClick={() => updateCompanyName.mutate({ cnpj: company.cnpj, newName: editName })}
                          className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingCnpj(null)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-card-foreground">{company.company_name}</h3>
                        <button
                          onClick={() => { setEditingCnpj(company.cnpj); setEditName(company.company_name); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(company.cnpj)}</p>
                    <p className="text-xs text-muted-foreground">{company.form_count} formulário(s) vinculado(s)</p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Remover empresa "${company.company_name}" e todos os formulários vinculados?`)) deleteCompany.mutate(company.cnpj); }}
                    className="rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
