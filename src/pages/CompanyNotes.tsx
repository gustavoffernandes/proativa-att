import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSurveyData } from "@/hooks/useSurveyData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Plus, Trash2, Edit3, Save, X, Loader2, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CompanyNote {
  id: string;
  company_config_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function CompanyNotes() {
  const { isLoading: surveyLoading, hasData, companies } = useSurveyData();
  const { user, isCompanyUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showNew, setShowNew] = useState(false);

  // For company_user, auto-select their company
  const effectiveCompany = isCompanyUser && companies.length === 1 ? companies[0].id : (selectedCompany || companies[0]?.id || "");

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["company-notes", effectiveCompany],
    queryFn: async () => {
      if (!effectiveCompany) return [];
      const { data, error } = await supabase
        .from("company_notes")
        .select("*")
        .eq("company_config_id", effectiveCompany)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as CompanyNote[];
    },
    enabled: !!effectiveCompany,
  });

  const createMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const { error } = await supabase.from("company_notes").insert({
        company_config_id: effectiveCompany,
        user_id: user!.id,
        title,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-notes", effectiveCompany] });
      setShowNew(false); setNewTitle(""); setNewContent("");
      toast({ title: "Nota criada!" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      const { error } = await supabase.from("company_notes").update({ title, content }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-notes", effectiveCompany] });
      setEditingId(null);
      toast({ title: "Nota atualizada!" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-notes", effectiveCompany] });
      toast({ title: "Nota removida." });
    },
  });

  if (surveyLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  if (!hasData) return <DashboardLayout><div className="flex flex-col items-center justify-center h-64 text-center"><p className="text-sm text-muted-foreground">Nenhum dado disponível.</p></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Bloco de Notas</h1><p className="text-sm text-muted-foreground mt-1">Anotações por empresa</p></div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isCompanyUser && (
            <select value={effectiveCompany} onChange={e => setSelectedCompany(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm w-full sm:w-auto">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nova Nota
          </button>
        </div>

        {showNew && (
          <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-card space-y-3">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Título" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Conteúdo da nota..." rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y" />
            <div className="flex gap-2">
              <button onClick={() => createMutation.mutate({ title: newTitle, content: newContent })} disabled={!newTitle.trim()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"><Save className="h-4 w-4" /> Salvar</button>
              <button onClick={() => { setShowNew(false); setNewTitle(""); setNewContent(""); }} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /> Cancelar</button>
            </div>
          </div>
        )}

        {notesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : notes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <StickyNote className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma nota para esta empresa.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {notes.map(note => (
              <div key={note.id} className="rounded-xl border border-border bg-card p-5 shadow-card">
                {editingId === note.id ? (
                  <div className="space-y-3">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y" />
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate({ id: note.id, title: editTitle, content: editContent })} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"><Save className="h-3 w-3" /> Salvar</button>
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"><X className="h-3 w-3" /> Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-card-foreground">{note.title || "Sem título"}</h4>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingId(note.id); setEditTitle(note.title); setEditContent(note.content); }} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteMutation.mutate(note.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-3">{new Date(note.updated_at).toLocaleDateString("pt-BR")} {new Date(note.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
