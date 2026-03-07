

## Plano: Sistema de Usuários com Vinculação a Empresa

### Resumo

Adicionar um terceiro tipo de usuário ("Usuário Empresa") que só visualiza dados da empresa à qual está vinculado. Isso exige mudanças no banco de dados, no contexto de autenticação, na criação de usuários, na sidebar, e na filtragem de dados em todas as páginas.

### Modelo de dados

A tabela `user_roles` ganha uma coluna `company_id` (nullable, FK para `google_forms_config.id`). A lógica fica:

- **admin**: `role='admin'`, `company_id=null` -- acesso total
- **user** (geral): `role='user'`, `company_id=null` -- visualiza todas as empresas
- **company_user**: `role='company_user'`, `company_id='xxx'` -- visualiza apenas empresa vinculada

### Alterações

**1. Migration SQL** -- Adicionar coluna e novo valor de role:
- `ALTER TABLE user_roles ADD COLUMN company_id uuid REFERENCES google_forms_config(id) ON DELETE SET NULL`
- Adicionar constraint: se `role='company_user'` então `company_id` NOT NULL

**2. AuthContext (`src/contexts/AuthContext.tsx`)**:
- Expandir `AppRole` para `"admin" | "user" | "company_user"`
- `fetchRole` passa a retornar também o `company_id`
- Expor `userCompanyId: string | null` no contexto
- Adicionar helper `isCompanyUser` (role === 'company_user')

**3. Edge Function `create-user` (`supabase/functions/create-user/index.ts`)**:
- Aceitar `role` com valor `"company_user"` além dos existentes
- Aceitar campo `company_id` no body
- Validar que se `role='company_user'`, `company_id` é obrigatório
- Inserir `company_id` na tabela `user_roles`

**4. Settings -- Criação de Usuários (`src/pages/Settings.tsx`)**:
- Adicionar opção "Usuário Empresa" no select de tipo
- Quando selecionado "company_user", exibir dropdown para escolher a empresa (lista vinda de `google_forms_config`)
- Enviar `company_id` junto ao `create-user`

**5. Hook `useSurveyData` (`src/hooks/useSurveyData.ts`)**:
- Receber `userCompanyId` do AuthContext
- Quando `userCompanyId` está definido, filtrar `configs` e `rawResponses` para retornar apenas dados daquela empresa
- `companies` retorna apenas a empresa vinculada

**6. Sidebar (`src/components/layout/ProativaSidebar.tsx`)**:
- Esconder "Comparação Empresas" para `company_user` (ou manter apenas comparação interna por setor)
- Esconder "Integrações" para não-admin (já feito)

**7. Páginas que listam/selecionam empresas**:
- **Index, Heatmap, Demographics, Reports, ActionPlans, CompanyNotes, SurveyAnalysis**: quando `isCompanyUser`, remover seletor de empresa e fixar na empresa vinculada
- **CompanyComparison**: para `company_user`, só permitir modo "Por Setor" (comparação interna); esconder modo "Por Empresa" multi-company

**8. Tipos TypeScript (`src/integrations/supabase/types.ts`)**:
- Atualizar tipo da tabela `user_roles` para incluir `company_id: string | null`

### Segurança

- A filtragem por empresa acontece no frontend via hook. Para segurança adicional, RLS policies na `survey_responses` e `google_forms_config` poderiam restringir por `company_id` do usuário, mas isso requer uma function `get_user_company_id()` security definer.
- A edge function `create-user` já valida que apenas admins criam usuários.

### Ordem de implementação

1. Migration SQL (adicionar coluna + constraint)
2. Atualizar tipos TypeScript
3. Atualizar AuthContext
4. Atualizar edge function `create-user`
5. Atualizar Settings (UI de criação)
6. Atualizar `useSurveyData` com filtragem
7. Atualizar sidebar e todas as páginas para respeitar a restrição
8. Adicionar RLS policies (opcional, recomendado)

