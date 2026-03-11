import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, Building2, Users, FileText, Download,
  Settings, ChevronLeft, ChevronRight, Shield, Link2, X, LogOut, StickyNote, ClipboardList, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const menuItems = [
  { path: "/", label: "Visão Geral", icon: LayoutDashboard, adminOnly: false, hideForCompanyUser: false },
  { path: "/analise", label: "Análise por Pergunta", icon: BarChart3, adminOnly: false, hideForCompanyUser: false },
  { path: "/empresas", label: "Comparação Empresas", icon: Building2, adminOnly: false, hideForCompanyUser: true },
  { path: "/demografico", label: "Perfil Demográfico", icon: Users, adminOnly: false, hideForCompanyUser: false },
  { path: "/heatmap", label: "Heatmap Satisfação", icon: FileText, adminOnly: false, hideForCompanyUser: false },
  { path: "/evolucao", label: "Evolução Temporal", icon: TrendingUp, adminOnly: false, hideForCompanyUser: false },
  { path: "/relatorios", label: "Relatórios", icon: Download, adminOnly: false, hideForCompanyUser: false },
  { path: "/plano-acao", label: "Plano de Ação", icon: ClipboardList, adminOnly: false, hideForCompanyUser: false },
  { path: "/notas", label: "Bloco de Notas", icon: StickyNote, adminOnly: false, hideForCompanyUser: true },
  { path: "/integracoes", label: "Integrações", icon: Link2, adminOnly: true, hideForCompanyUser: false },
];

const bottomItems = [
  { path: "/configuracoes", label: "Configurações", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export function ProativaSidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  const location = useLocation();
  const { user, signOut, isAdmin, isCompanyUser } = useAuth();

  const visibleMenuItems = menuItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.hideForCompanyUser && isCompanyUser) return false;
    return true;
  });

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
          "max-md:-translate-x-full max-md:w-[260px]",
          mobileOpen && "max-md:translate-x-0",
          "md:z-40",
          collapsed ? "md:w-[72px]" : "md:w-[260px]"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="animate-fade-in">
                <h1 className="text-sm font-bold text-sidebar-primary-foreground">PROATIVA</h1>
                <p className="text-[10px] text-sidebar-foreground opacity-60">Dashboard Analítico</p>
              </div>
            )}
          </div>
          <button className="md:hidden rounded-lg p-1 text-sidebar-foreground hover:bg-sidebar-accent transition-colors" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          <p className={cn("mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40", collapsed && !mobileOpen && "hidden")}>Menu</p>
          {visibleMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink key={item.path} to={item.path} onClick={handleNavClick}
                className={cn("group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                {isActive && <div className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-ring" />}
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {(!collapsed || mobileOpen) && <span className="animate-fade-in">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
          {(!collapsed || mobileOpen) && user && (
            <div className="mb-2 px-3 py-2 rounded-lg bg-sidebar-accent/50">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user.email}</p>
            </div>
          )}
          {bottomItems.map((item) => (
            <NavLink key={item.path} to={item.path} onClick={handleNavClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
          <button onClick={() => signOut()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {(!collapsed || mobileOpen) && <span>Sair</span>}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            {collapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronLeft className="h-[18px] w-[18px]" />}
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
