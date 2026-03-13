import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Settings as SettingsIcon, User, Palette, Save, UserPlus, Loader2, Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

type TabId = "perfil" | "usuarios" | "aparencia" | "geral";
type ThemeMode = "light" | "dark" | "system";

const allTabs: { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "usuarios", label: "Usuários", icon: UserPlus, adminOnly: true },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "geral", label: "Geral", icon: SettingsIcon },
];

function getStoredTheme(): ThemeMode {
  return (localStorage.getItem("proativa-theme") as ThemeMode) || "system";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", mode === "dark");
  }
  localStorage.setItem("proativa-theme", mode);
}

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState<TabId>("perfil");
  const [profile, setProfile] = useState({ name: "Admin", email: user?.email ?? "", role: "Gestor SST", company: "PROATIVA Consultoria" });
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user" | "company_user">("user");
  const [newUserCompanyId, setNewUserCompanyId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [fontSize, setFontSize] = useState<"normal" | "large">(
    (localStorage.getItem("proativa-fontsize") as "normal" | "large") || "normal"
  );
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip applying theme on first render since main.tsx already applied it
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = fontSize === "large" ? "18px" : "16px";
    localStorage.setItem("proativa-fontsize", fontSize);
  }, [fontSize]);

  const { data: companiesList = [] } = useQuery({
    queryKey: ["companies-for-user-creation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_forms_config")
        .select("id, company_name")
        .eq("is_active", true)
        .order("company_name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) { toast({ title: "Preencha todos os campos", variant: "destructive" }); return; }
    if (newUserPassword.length < 8) { toast({ title: "Senha deve ter pelo menos 8 caracteres", variant: "destructive" }); return; }
    if (newUserRole === "company_user" && !newUserCompanyId) { toast({ title: "Selecione uma empresa para o Usuário Empresa", variant: "destructive" }); return; }
    setCreatingUser(true);
    try {
      const body: Record<string, string> = { email: newUserEmail, password: newUserPassword, role: newUserRole };
      if (newUserRole === "company_user") body.company_id = newUserCompanyId;
      const { data, error } = await supabase.functions.invoke("create-user", { body });
      if (error) throw error;
      const roleLabel = newUserRole === "admin" ? "Administrador" : newUserRole === "company_user" ? "Usuário Empresa" : "Usuário Geral";
      toast({ title: "Usuário criado!", description: `${newUserEmail} foi adicionado como ${roleLabel}.` });
      setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("user"); setNewUserCompanyId("");
    } catch (e: any) { toast({ title: "Erro ao criar usuário", description: e.message, variant: "destructive" }); }
    setCreatingUser(false);
  };

  const themeOptions: { mode: ThemeMode; label: string; icon: React.ElementType; description: string }[] = [
    { mode: "light", label: "Claro", icon: Sun, description: "Tema claro padrão" },
    { mode: "dark", label: "Escuro", icon: Moon, description: "Tema escuro para conforto visual" },
    { mode: "system", label: "Sistema", icon: Monitor, description: "Segue a preferência do sistema operacional" },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Configurações</h1><p className="text-sm text-muted-foreground mt-1">Gerencie seu perfil e preferências</p></div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-56 shrink-0">
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                    activeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-card p-6 shadow-card">
            {activeTab === "perfil" && (
              <div className="space-y-4 max-w-md">
                <h3 className="text-lg font-semibold text-card-foreground">Perfil</h3>
                {["name", "email", "role", "company"].map(field => (
                  <div key={field} className="space-y-1">
                    <label className="text-sm font-medium text-foreground capitalize">{field === "name" ? "Nome" : field === "email" ? "E-mail" : field === "role" ? "Cargo" : "Empresa"}</label>
                    <input value={profile[field as keyof typeof profile]} onChange={e => setProfile({ ...profile, [field]: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" readOnly={field === "email"} />
                  </div>
                ))}
                <button onClick={() => toast({ title: "Perfil salvo!" })} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"><Save className="h-4 w-4" /> Salvar</button>
              </div>
            )}
            {activeTab === "usuarios" && (
              <div className="space-y-4 max-w-md">
                <h3 className="text-lg font-semibold text-card-foreground">Criar Novo Usuário</h3>
                <div className="space-y-1"><label className="text-sm font-medium text-foreground">E-mail</label><input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="novo@email.com" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" /></div>
                <div className="space-y-1"><label className="text-sm font-medium text-foreground">Senha</label><input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition" /></div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Tipo de Usuário</label>
                  <select value={newUserRole} onChange={e => { setNewUserRole(e.target.value as "admin" | "user" | "company_user"); setNewUserCompanyId(""); }} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="user">Usuário Geral (visualiza todas as empresas)</option>
                    <option value="company_user">Usuário Empresa (restrito a uma empresa)</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {newUserRole === "admin" && "Acesso total: gerencia integrações, usuários e todos os dados."}
                    {newUserRole === "user" && "Visualiza dados de todas as empresas, sem permissão de administração."}
                    {newUserRole === "company_user" && "Visualiza apenas os dados da empresa selecionada abaixo."}
                  </p>
                </div>
                {newUserRole === "company_user" && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Empresa Vinculada</label>
                    <select value={newUserCompanyId} onChange={e => setNewUserCompanyId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="">Selecione uma empresa...</option>
                      {companiesList.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={handleCreateUser} disabled={creatingUser} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors">{creatingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Criar Usuário</button>
              </div>
            )}
            {activeTab === "aparencia" && (
              <div className="space-y-6 max-w-lg">
                <h3 className="text-lg font-semibold text-card-foreground">Aparência</h3>

                {/* Theme */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Tema</label>
                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map(opt => (
                      <button
                        key={opt.mode}
                        onClick={() => setTheme(opt.mode)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                          theme === opt.mode
                            ? "border-primary bg-primary/5 shadow-md"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        )}
                      >
                        <opt.icon className={cn("h-6 w-6", theme === opt.mode ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-medium", theme === opt.mode ? "text-primary" : "text-foreground")}>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground text-center">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Tamanho da Fonte</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFontSize("normal")}
                      className={cn(
                        "flex-1 rounded-xl border-2 p-3 text-center transition-all",
                        fontSize === "normal" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="text-sm font-medium">Aa</span>
                      <p className="text-xs text-muted-foreground mt-1">Normal</p>
                    </button>
                    <button
                      onClick={() => setFontSize("large")}
                      className={cn(
                        "flex-1 rounded-xl border-2 p-3 text-center transition-all",
                        fontSize === "large" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="text-lg font-medium">Aa</span>
                      <p className="text-xs text-muted-foreground mt-1">Grande</p>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "geral" && (
              <div className="space-y-4 max-w-md">
                <h3 className="text-lg font-semibold text-card-foreground">Geral</h3>
                <p className="text-sm text-muted-foreground">Configurações gerais da plataforma.</p>
                <div className="rounded-lg bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Versão: 2.0.0</p><p className="text-xs text-muted-foreground">© 2026 PROATIVA</p></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
