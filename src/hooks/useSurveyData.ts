import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { questions, sections, type Respondent, type Company } from "@/data/mockData";

export interface SurveyResponse {
  id: string;
  config_id: string;
  response_timestamp: string | null;
  respondent_name: string | null;
  sex: string | null;
  age: number | null;
  sector: string | null;
  answers: Record<string, number>;
}

export interface RealCompany {
  id: string;
  name: string;
  sector: string;
  employees: number;
  color: string;
}

export interface FormConfig {
  configId: string;
  companyKey: string;
  title: string;
}

const COMPANY_COLORS = [
  "hsl(217, 71%, 45%)", "hsl(170, 60%, 45%)", "hsl(38, 92%, 55%)",
  "hsl(280, 60%, 55%)", "hsl(0, 72%, 55%)", "hsl(200, 80%, 50%)",
  "hsl(330, 65%, 50%)", "hsl(150, 55%, 45%)",
];

// ========== IMPROVED QUESTION MATCHING ==========

/**
 * Normalize text for comparison: lowercase, remove accents, extra spaces, punctuation
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a lookup map from question texts to question IDs.
 * Uses multiple strategies: exact normalized match, keyword extraction, and partial containment.
 */
function buildQuestionMatcher(): (columnHeader: string) => string | null {
  // Pre-compute normalized versions of all questions
  const normalizedQuestions = questions.map(q => ({
    id: q.id,
    section: q.section,
    number: q.number,
    originalText: q.text,
    normalized: normalize(q.text),
    // Extract significant words (>= 4 chars) for keyword matching
    keywords: normalize(q.text).split(" ").filter(w => w.length >= 4),
  }));

  return (columnHeader: string): string | null => {
    const normalizedHeader = normalize(columnHeader);
    if (!normalizedHeader || normalizedHeader.length < 3) return null;

    // Strategy 1: Exact normalized match
    const exact = normalizedQuestions.find(q => q.normalized === normalizedHeader);
    if (exact) return exact.id;

    // Strategy 2: Header contains the question text or vice-versa
    const contained = normalizedQuestions.find(q =>
      normalizedHeader.includes(q.normalized) || q.normalized.includes(normalizedHeader)
    );
    if (contained) return contained.id;

    // Strategy 3: Keyword matching - find question where most keywords match
    let bestMatch: { id: string; score: number } | null = null;
    for (const q of normalizedQuestions) {
      if (q.keywords.length === 0) continue;
      const matchedKeywords = q.keywords.filter(kw => normalizedHeader.includes(kw));
      const score = matchedKeywords.length / q.keywords.length;
      // Require at least 60% keyword match and minimum 2 keywords matched
      if (score >= 0.6 && matchedKeywords.length >= Math.min(2, q.keywords.length)) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: q.id, score };
        }
      }
    }
    if (bestMatch) return bestMatch.id;

    // Strategy 4: For very short questions (single/double words like "Amargura", "Tristeza")
    // check if any short question text appears as a word in the header
    const shortQuestions = normalizedQuestions.filter(q => q.normalized.split(" ").length <= 3);
    for (const q of shortQuestions) {
      const headerWords = normalizedHeader.split(" ");
      const qWords = q.normalized.split(" ");
      // All question words must appear in header
      if (qWords.every(qw => headerWords.some(hw => hw.includes(qw) || qw.includes(hw)))) {
        return q.id;
      }
    }

    return null;
  };
}

// Create singleton matcher
const matchQuestion = buildQuestionMatcher();

export function useSurveyData() {
  const { userCompanyId, isCompanyUser } = useAuth();

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ["google-forms-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_forms_config")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: rawResponses = [], isLoading: loadingResponses } = useQuery({
    queryKey: ["survey-responses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*");
      if (error) throw error;
      return (data || []) as SurveyResponse[];
    },
  });

  const isLoading = loadingConfigs || loadingResponses;

  // Build a map from CNPJ (or config id) to grouped company info
  // This deduplicates companies that have multiple forms
  const cnpjToConfigIds = new Map<string, string[]>();
  const cnpjToCompanyInfo = new Map<string, { name: string; sector: string; employees: number | null; cnpj: string }>();

  const formConfigs: FormConfig[] = [];

  configs.forEach((c: any) => {
    const key = c.cnpj || c.id;
    if (!cnpjToConfigIds.has(key)) {
      cnpjToConfigIds.set(key, []);
      cnpjToCompanyInfo.set(key, {
        name: c.company_name,
        sector: c.sector ? c.sector.charAt(0).toUpperCase() + c.sector.slice(1).toLowerCase() : "Não informado",
        employees: c.employee_count || null,
        cnpj: c.cnpj || "",
      });
    }
    cnpjToConfigIds.get(key)!.push(c.id);

    // Only track real forms (not placeholders)
    if (c.spreadsheet_id !== "__placeholder__") {
      formConfigs.push({
        configId: c.id,
        companyKey: key,
        title: c.form_title || c.sheet_name || `Formulário ${cnpjToConfigIds.get(key)!.length}`,
      });
    }
  });

  // Map from config_id to company key (CNPJ or id)
  const configIdToCompanyKey = new Map<string, string>();
  cnpjToConfigIds.forEach((configIds, key) => {
    configIds.forEach(configId => configIdToCompanyKey.set(configId, key));
  });

  // Filter by company if user is company_user
  const userCompanyKey = userCompanyId ? configIdToCompanyKey.get(userCompanyId) || userCompanyId : null;

  const filteredCompanyKeys = isCompanyUser && userCompanyKey
    ? [userCompanyKey]
    : Array.from(cnpjToConfigIds.keys());

  const filteredConfigIds = new Set<string>();
  filteredCompanyKeys.forEach(key => {
    (cnpjToConfigIds.get(key) || []).forEach(id => filteredConfigIds.add(id));
  });

  const filteredRawResponses = rawResponses.filter(r => filteredConfigIds.has(r.config_id));

  const companies: RealCompany[] = filteredCompanyKeys.map((key, i) => {
    const info = cnpjToCompanyInfo.get(key)!;
    const companyConfigIds = cnpjToConfigIds.get(key) || [];
    const responseCount = filteredRawResponses.filter(r => companyConfigIds.includes(r.config_id)).length;
    return {
      id: key, // Use CNPJ as company id
      name: info.name,
      sector: info.sector,
      employees: info.employees || responseCount,
      color: COMPANY_COLORS[i % COMPANY_COLORS.length],
    };
  });

  const respondents: Respondent[] = filteredRawResponses.map(r => {
    const formattedAnswers: Record<string, number> = {};

    if (r.answers) {
      Object.entries(r.answers).forEach(([columnHeader, cellValue]) => {
        const matchedQuestionId = matchQuestion(columnHeader);

        if (matchedQuestionId) {
          let numValue = parseInt(String(cellValue), 10);

          if (isNaN(numValue)) {
            const textVal = String(cellValue).toLowerCase();
            if (textVal.includes("nunca")) numValue = 1;
            else if (textVal.includes("raramente")) numValue = 2;
            else if (textVal.includes("vezes") || textVal.includes("às vezes")) numValue = 3;
            else if (textVal.includes("frequentemente") || textVal.includes("frequente")) numValue = 4;
            else if (textVal.includes("sempre")) numValue = 5;
          }

          if (numValue >= 1 && numValue <= 5) {
            formattedAnswers[matchedQuestionId] = numValue;
          }
        }
      });
    }

    return {
      id: r.id,
      configId: r.config_id,
      companyId: configIdToCompanyKey.get(r.config_id) || r.config_id,
      name: r.respondent_name || "Anônimo",
      sex: (r.sex === "Masculino" || r.sex === "Feminino") ? r.sex : "Prefiro não declarar",
      age: r.age || 0,
      sector: r.sector ? r.sector.charAt(0).toUpperCase() + r.sector.slice(1).toLowerCase() : "Não informado",
      answers: formattedAnswers,
      responseTimestamp: r.response_timestamp,
    };
  });

  const hasData = respondents.length > 0;

  function getCompanyRespondents(companyId: string): Respondent[] {
    return respondents.filter(r => r.companyId === companyId);
  }

  function getQuestionAverage(questionId: string, companyId?: string): number {
    const pool = companyId ? getCompanyRespondents(companyId) : respondents;
    const withAnswer = pool.filter(r => r.answers[questionId] !== undefined);
    if (withAnswer.length === 0) return 0;
    const sum = withAnswer.reduce((acc, r) => acc + (r.answers[questionId] || 0), 0);
    return Math.round((sum / withAnswer.length) * 100) / 100;
  }

  function getSectionAverage(sectionId: string, companyId?: string): number {
    const sectionQuestions = questions.filter(q => q.section === sectionId);
    if (sectionQuestions.length === 0) return 0;
    const pool = companyId ? getCompanyRespondents(companyId) : respondents;
    if (pool.length === 0) return 0;

    const questionsWithData = sectionQuestions.filter(q =>
      pool.some(r => r.answers[q.id] !== undefined)
    );
    if (questionsWithData.length === 0) return 0;

    const avg = questionsWithData.reduce((acc, q) => acc + getQuestionAverage(q.id, companyId), 0) / questionsWithData.length;
    return Math.round(avg * 100) / 100;
  }

  function getAnswerDistribution(questionId: string, companyId?: string) {
    const pool = companyId ? getCompanyRespondents(companyId) : respondents;
    const withAnswer = pool.filter(r => r.answers[questionId] !== undefined);
    return [1, 2, 3, 4, 5].map(value => {
      const count = withAnswer.filter(r => r.answers[questionId] === value).length;
      return {
        value,
        count,
        percentage: withAnswer.length > 0 ? Math.round((count / withAnswer.length) * 100) : 0,
      };
    });
  }

  function getAvailableQuestions() {
    const available = new Set<string>();
    respondents.forEach(r => {
      Object.keys(r.answers).forEach(k => available.add(k));
    });
    return questions.filter(q => available.has(q.id));
  }

  function getAvailableSections() {
    const availableQs = getAvailableQuestions();
    const sectionIds = new Set(availableQs.map(q => q.section));
    return sections.filter(s => sectionIds.has(s.id));
  }

  function getOutlierResponses(companyId: string, threshold: number = 1.5) {
    const pool = getCompanyRespondents(companyId);
    const outliers: { respondent: Respondent; questionId: string; value: number; sectorAvg: number; deviation: number }[] = [];

    const sectorGroups: Record<string, Respondent[]> = {};
    pool.forEach(r => {
      if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
      sectorGroups[r.sector].push(r);
    });

    Object.entries(sectorGroups).forEach(([, sectorRespondents]) => {
      if (sectorRespondents.length < 3) return;

      const availableQs = getAvailableQuestions();
      availableQs.forEach(q => {
        const answers = sectorRespondents.filter(r => r.answers[q.id] !== undefined).map(r => r.answers[q.id]);
        if (answers.length < 3) return;

        const mean = answers.reduce((a, b) => a + b, 0) / answers.length;
        const stdDev = Math.sqrt(answers.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / answers.length);
        if (stdDev === 0) return;

        sectorRespondents.forEach(r => {
          if (r.answers[q.id] === undefined) return;
          const deviation = Math.abs(r.answers[q.id] - mean) / stdDev;
          if (deviation >= threshold) {
            outliers.push({
              respondent: r,
              questionId: q.id,
              value: r.answers[q.id],
              sectorAvg: Math.round(mean * 100) / 100,
              deviation: Math.round(deviation * 100) / 100,
            });
          }
        });
      });
    });

    return outliers.sort((a, b) => b.deviation - a.deviation);
  }

  function getSectorAverages(companyId: string) {
    const pool = getCompanyRespondents(companyId);
    const sectorSet = [...new Set(pool.map(r => r.sector))].sort();
    const availableSects = getAvailableSections();

    return sectorSet.map(sector => {
      const sectorPool = pool.filter(r => r.sector === sector);
      const sectionAvgs: Record<string, number> = {};
      availableSects.forEach(s => {
        const qs = questions.filter(q => q.section === s.id);
        const qsWithData = qs.filter(q => sectorPool.some(r => r.answers[q.id] !== undefined));
        if (qsWithData.length === 0) { sectionAvgs[s.id] = 0; return; }
        const avg = qsWithData.reduce((acc, q) => {
          const withAns = sectorPool.filter(r => r.answers[q.id] !== undefined);
          if (withAns.length === 0) return acc;
          return acc + withAns.reduce((a, r) => a + r.answers[q.id], 0) / withAns.length;
        }, 0) / qsWithData.length;
        sectionAvgs[s.id] = Math.round(avg * 100) / 100;
      });
      return { sector, count: sectorPool.length, sectionAvgs };
    });
  }

  function getFormConfigsForCompany(companyKey: string): FormConfig[] {
    return formConfigs.filter(f => f.companyKey === companyKey);
  }

  return {
    isLoading,
    hasData,
    companies,
    respondents,
    formConfigs,
    getCompanyRespondents,
    getQuestionAverage,
    getSectionAverage,
    getAnswerDistribution,
    getAvailableQuestions,
    getAvailableSections,
    getOutlierResponses,
    getSectorAverages,
    getFormConfigsForCompany,
  };
}
