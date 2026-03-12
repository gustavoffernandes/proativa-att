import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { type Question } from "@/data/mockData";
import { PROART_SCALES, ALL_FACTORS, classifyRisk, getRiskLabel, calculatePxS, getPRLevelLabel, getSuggestedActions } from "@/lib/proartMethodology";

export interface PDFExportData {
  companies: { id: string; name: string; sector: string; employees: number; color: string }[];
  sections: { id: string; name: string; shortName: string }[];
  questions: Question[];
  respondents: { id: string; companyId: string; name: string; sex: string; age: number; sector: string; answers: Record<string, number> }[];
  getCompanyRespondents: (companyId: string) => any[];
  getSectionAverage: (sectionId: string, companyId?: string) => number;
  getQuestionAverage: (questionId: string, companyId?: string) => number;
  getAnswerDistribution: (questionId: string, companyId?: string) => { value: number; count: number; percentage: number }[];
  getAvailableSections: () => { id: string; name: string; shortName: string }[];
  getAvailableQuestions: () => Question[];
}

const COLORS = {
  primary: [15, 30, 61] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
  warning: [234, 179, 8] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  text: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  bg: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
};

// Remove diacritics/accents for safe PDF rendering with helvetica
function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const PAGE_WIDTH = 210;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function addHeader(doc: jsPDF, companyName: string, subtitle: string) {
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, doc.internal.pageSize.width, 38, "F");

  doc.setFillColor(...COLORS.accent);
  doc.circle(22, 19, 10, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("P", 19, 23);

  doc.setFontSize(16);
  doc.text("PROATIVA", 38, 17);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 38, 25);

  doc.setFontSize(8);
  doc.text(companyName, 38, 33);
}

function addFooter(doc: jsPDF, pageNum: number) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...COLORS.muted);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, pageHeight - 16, PAGE_WIDTH - MARGIN, pageHeight - 16);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text(`PROATIVA - Relatório gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, MARGIN, pageHeight - 10);
  doc.text(`Página ${pageNum}`, doc.internal.pageSize.width - 30, pageHeight - 10);
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, companyName: string, subtitle: string, pageNum: { value: number }): number {
  if (y + needed > 265) {
    doc.addPage();
    pageNum.value++;
    addHeader(doc, companyName, subtitle);
    addFooter(doc, pageNum.value);
    return 48;
  }
  return y;
}

function addSectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGIN, y - 4, CONTENT_WIDTH, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN + 4, y + 1.5);
  doc.setTextColor(...COLORS.text);
  return y + 12;
}

function getClassification(value: number, type: "positive" | "negative" = "positive"): { label: string; color: [number, number, number] } {
  const risk = classifyRisk(value, type);
  if (risk === "low") return { label: "Risco Baixo", color: COLORS.success };
  if (risk === "medium") return { label: "Risco Médio", color: COLORS.warning };
  return { label: "Risco Alto", color: COLORS.danger };
}

export function exportCompanyPDF(companyId: string, data: PDFExportData) {
  const company = data.companies.find(c => c.id === companyId);
  if (!company) return;

  const doc = new jsPDF();
  const pool = data.getCompanyRespondents(companyId);
  const availableSections = data.getAvailableSections();
  const availableQuestions = data.getAvailableQuestions();
  const pageNum = { value: 1 };

  addHeader(doc, company.name, "Relatorio PROART - Avaliacao de Riscos Psicossociais");
  addFooter(doc, pageNum.value);

  let y = 48;

  // ==================== 1. COMPANY INFO ====================
  y = addSectionTitle(doc, "1. Informacoes da Avaliacao", y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);

  const infoData = [
    ["Empresa", company.name],
    ["Setor", company.sector || "Nao informado"],
    ["No de Funcionarios", String(company.employees || "N/A")],
    ["Questionarios Preenchidos", String(pool.length)],
    ["Taxa de Resposta", `${company.employees > 0 ? Math.round((pool.length / company.employees) * 100) : 0}%`],
    ["Data do Relatorio", new Date().toLocaleDateString("pt-BR")],
  ];

  autoTable(doc, {
    startY: y,
    body: infoData,
    theme: "plain",
    bodyStyles: { fontSize: 9, textColor: COLORS.text, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as any).lastAutoTable?.finalY + 6 || y + 40;

  // Demographics
  const sexGroups: Record<string, number> = {};
  const ageGroups: Record<string, number> = { "18-25": 0, "26-35": 0, "36-45": 0, "46-55": 0, "56+": 0 };
  pool.forEach((r: any) => {
    sexGroups[r.sex] = (sexGroups[r.sex] || 0) + 1;
    if (r.age <= 25) ageGroups["18-25"]++;
    else if (r.age <= 35) ageGroups["26-35"]++;
    else if (r.age <= 45) ageGroups["36-45"]++;
    else if (r.age <= 55) ageGroups["46-55"]++;
    else ageGroups["56+"]++;
  });

  y = checkPageBreak(doc, y, 30, company.name, "Perfil dos Participantes", pageNum);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Perfil dos Participantes:", MARGIN, y); y += 6;
  doc.setFont("helvetica", "normal");

  const demoData = Object.entries(sexGroups).map(([sex, count]) => [sex, String(count), `${Math.round((count / pool.length) * 100)}%`]);
  autoTable(doc, {
    startY: y,
    head: [["Genero", "Quantidade", "Percentual"]],
    body: demoData,
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.bg },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 120,
  });
  y = (doc as any).lastAutoTable?.finalY + 10 || y + 30;

  // ==================== 2. RESULTS ====================
  y = checkPageBreak(doc, y, 20, company.name, "Resultados", pageNum);
  y = addSectionTitle(doc, "2. Resultados por Escala e Fator", y);

  const factorData = ALL_FACTORS.map(f => {
    const qIds = f.questionIds;
    const answers = pool.flatMap((r: any) => qIds.map((qId: string) => r.answers[qId]).filter((v: any) => v !== undefined));
    const avg = answers.length > 0 ? (answers as number[]).reduce((a: number, b: number) => a + b, 0) / answers.length : 0;
    const scale = PROART_SCALES.find(s => s.id === f.scaleId);
    const cls = getClassification(avg, f.type);
    return { factor: f, avg: Math.round(avg * 100) / 100, risk: classifyRisk(avg, f.type), cls, scaleName: scale?.shortName || "" };
  });

  // Scale summaries with risk distribution
  PROART_SCALES.forEach(scale => {
    const scaleFactors = factorData.filter(f => f.factor.scaleId === scale.id);
    const scaleAvg = scaleFactors.length > 0 ? scaleFactors.reduce((a, f) => a + f.avg, 0) / scaleFactors.length : 0;
    const scaleType = scale.type === "positive" ? "positive" as const : "negative" as const;
    const scaleCls = getClassification(scaleAvg, scaleType);

    y = checkPageBreak(doc, y, 35, company.name, "Resultados por Escala", pageNum);

    // Scale header with colored bar
    doc.setFillColor(...scaleCls.color);
    doc.rect(MARGIN, y - 3, 3, 6, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.text);
    doc.text(removeDiacritics(`${scale.shortName} - ${scale.name}`), MARGIN + 6, y);
    doc.setTextColor(...scaleCls.color);
    doc.text(`${scaleAvg.toFixed(2)} - ${removeDiacritics(scaleCls.label)}`, 140, y);
    doc.setTextColor(...COLORS.text);
    y += 7;

    // Risk distribution
    const riskDist = { low: 0, medium: 0, high: 0 };
    pool.forEach((r: any) => {
      const answers = scaleFactors.flatMap(f => f.factor.questionIds.map((qId: string) => r.answers[qId]).filter((v: any) => v !== undefined));
      if (answers.length === 0) return;
      const avg = (answers as number[]).reduce((a: number, b: number) => a + b, 0) / answers.length;
      const risk = classifyRisk(avg, scaleType);
      riskDist[risk]++;
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const total = riskDist.low + riskDist.medium + riskDist.high;

    // Risk distribution as horizontal bar
    if (total > 0) {
      const barWidth = 100;
      const barHeight = 6;
      const barX = MARGIN + 6;
      const lowW = (riskDist.low / total) * barWidth;
      const medW = (riskDist.medium / total) * barWidth;
      const highW = (riskDist.high / total) * barWidth;

      doc.setFillColor(...COLORS.success); doc.rect(barX, y - 2, lowW, barHeight, "F");
      doc.setFillColor(...COLORS.warning); doc.rect(barX + lowW, y - 2, medW, barHeight, "F");
      doc.setFillColor(...COLORS.danger); doc.rect(barX + lowW + medW, y - 2, highW, barHeight, "F");

      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text(`Baixo: ${Math.round((riskDist.low / total) * 100)}%  |  Médio: ${Math.round((riskDist.medium / total) * 100)}%  |  Alto: ${Math.round((riskDist.high / total) * 100)}%`, barX + barWidth + 4, y + 2);
      y += 8;
    }

    // Factor details
    scaleFactors.forEach(f => {
      doc.setTextColor(...f.cls.color);
      doc.setFontSize(8);
      doc.text(removeDiacritics(`  - ${f.factor.name}: ${f.avg.toFixed(2)} - ${f.cls.label}`), MARGIN + 6, y);
      doc.setTextColor(...COLORS.text);
      y += 4;
    });
    y += 4;
  });

  // Factor Summary Table
  y = checkPageBreak(doc, y, 20, company.name, "Tabela de Fatores", pageNum);

  autoTable(doc, {
    startY: y,
    head: [["Escala", "Fator", "Tipo", "Media", "Classificacao"]],
    body: factorData.map(f => [f.scaleName, removeDiacritics(f.factor.name), f.factor.type === "positive" ? "Positiva" : "Negativa", f.avg.toFixed(2), removeDiacritics(f.cls.label)]),
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.bg },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const label = factorData[data.row.index]?.cls.label;
        if (label === "Risco Alto") data.cell.styles.textColor = COLORS.danger;
        else if (label === "Risco Médio") data.cell.styles.textColor = COLORS.warning;
        else data.cell.styles.textColor = COLORS.success;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ==================== 3. P×S MATRIX ====================
  doc.addPage();
  pageNum.value++;
  addHeader(doc, company.name, "Calculo do Risco PxS");
  addFooter(doc, pageNum.value);

  let py = 48;
  py = addSectionTitle(doc, "3. Calculo do Risco e Matriz PxS (SESI 2022)", py);

  const eotAvg = factorData.filter(f => f.scaleName === "EOT").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorData.filter(f => f.scaleName === "EOT").length);
  const colAvg = factorData.find(f => f.factor.name.includes("Coletivista"))?.avg || 0;
  const eistAvg = factorData.filter(f => f.scaleName === "EIST").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorData.filter(f => f.scaleName === "EIST").length);
  const edtAvg = factorData.filter(f => f.scaleName === "EDT").reduce((a, f) => a + f.avg, 0) / Math.max(1, factorData.filter(f => f.scaleName === "EDT").length);

  // Calculate high risk count the same way as ActionPlans page
  const highRiskCount = pool.filter((r: any) => {
    const negFactors = ALL_FACTORS.filter(f => f.type === "negative");
    return negFactors.some(f => {
      const vals = f.questionIds.map((qId: string) => r.answers[qId]).filter((v: any) => v !== undefined);
      return vals.length > 0 && ((vals as number[]).reduce((a: number, b: number) => a + b, 0) / vals.length) >= 3.70;
    });
  }).length;

  const pxs = calculatePxS(eotAvg, colAvg, eistAvg, edtAvg, pool.length, highRiskCount);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.text("RISCO = PROBABILIDADE (P) x SEVERIDADE (S)", MARGIN, py); py += 8;

  // Variables table
  autoTable(doc, {
    startY: py,
    head: [["Variável", "Valor", "Descrição"]],
    body: [
      ["Probabilidade (P)", String(pxs.P), "Baseada na exposição (EIST) e controle (EOT + EEG)"],
      ["Severidade (S)", String(pxs.S), "Baseada na gravidade (EDT) e exposição de pessoas"],
      ["Risco (P×S)", String(pxs.risk), `${pxs.P} × ${pxs.S} = ${pxs.risk}`],
      ["Classificação", getPRLevelLabel(pxs.prLevel), `Prazo de ação: ${pxs.deadlineDays === 0 ? "Imediato" : pxs.deadlineDays + " dias"}`],
    ],
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 }, 1: { cellWidth: 25, halign: "center" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  py = (doc as any).lastAutoTable?.finalY + 8 || py + 40;

  // P×S Matrix table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Matriz de Classificacao dos Riscos:", MARGIN, py); py += 4;

  autoTable(doc, {
    startY: py,
    head: [["P \\ S", "S=1", "S=2", "S=3", "S=4", "S=5"]],
    body: [
      ["P=5", "5", "10", "15", "20", "25"],
      ["P=4", "4", "8", "12", "16", "20"],
      ["P=3", "3", "6", "9", "12", "15"],
      ["P=2", "2", "4", "6", "8", "10"],
      ["P=1", "1", "2", "3", "4", "5"],
    ],
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold", halign: "center" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text, halign: "center" },
    columnStyles: { 0: { fontStyle: "bold" } },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      if (data.section === "body") {
        const val = parseInt(data.cell.raw as string);
        if (!isNaN(val)) {
          if (val >= 17) data.cell.styles.fillColor = [254, 202, 202];
          else if (val >= 10) data.cell.styles.fillColor = [254, 240, 138];
          else if (val >= 5) data.cell.styles.fillColor = [187, 247, 208];
          else data.cell.styles.fillColor = [219, 234, 254];

          if (val === pxs.risk) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.lineWidth = 0.5;
            data.cell.styles.lineColor = [0, 0, 0];
          }
        }
      }
    },
  });

  py = (doc as any).lastAutoTable?.finalY + 8 || 200;

  // Risk levels legend
  autoTable(doc, {
    startY: py,
    head: [["Nivel", "Classificacao", "Faixa de Risco", "Conduta"]],
    body: [
      ["Critico", "PR1", "25", "Acoes corretivas imediatas. Reavaliacao apos implementacao."],
      ["Alto", "PR2", "15-24", "Rotinas reavaliadas e novas medidas em ate 30 dias."],
      ["Moderado", "PR3", "10-14", "Rotinas monitoradas, novas medidas em ate 90 dias."],
      ["Baixo", "PR4", "6-9", "Manter controle, avaliar prevencao em 180 dias."],
      ["Muito Baixo", "NA", "1-5", "Manter controle existente, reavaliacao anual."],
    ],
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: COLORS.text },
    columnStyles: { 3: { cellWidth: 70 } },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ==================== 4. CONCLUSION ====================
  doc.addPage();
  pageNum.value++;
  addHeader(doc, company.name, "Conclusao");
  addFooter(doc, pageNum.value);

  let cy = 48;
  cy = addSectionTitle(doc, "4. Conclusao", cy);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);

  const riskLabelMap: Record<string, string> = { "PR1": "CRITICO", "PR2": "ALTO", "PR3": "MODERADO", "PR4": "BAIXO", "NA": "MUITO BAIXO" };

  const wrapText = (text: string, maxWidth: number): string[] => {
    return doc.splitTextToSize(text, maxWidth);
  };

  const conclusionText = removeDiacritics(
    `A avaliacao dos riscos psicossociais realizada atraves do Protocolo PROART (Protocolo de Avaliacao dos Riscos Psicossociais no Trabalho), desenvolvido pelo Dr. Emilio Peres Facas da Universidade de Brasilia, revelou que o ambiente de trabalho da empresa ${company.name} apresenta classificacao de risco ${riskLabelMap[pxs.prLevel] || "MODERADO"} (${pxs.prLevel}), com indice PxS igual a ${pxs.risk}.`
  );

  const conclusionLines = wrapText(conclusionText, CONTENT_WIDTH);
  conclusionLines.forEach((line: string) => {
    doc.text(line, MARGIN, cy); cy += 4.5;
  });
  cy += 6;

  // Attention points as a structured table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Principais pontos de atencao identificados:", MARGIN, cy); cy += 6;

  const attentionData: string[][] = [];
  PROART_SCALES.forEach(scale => {
    const scaleFactors = factorData.filter(f => f.factor.scaleId === scale.id);
    const scaleAvg = scaleFactors.length > 0 ? scaleFactors.reduce((a, f) => a + f.avg, 0) / scaleFactors.length : 0;
    const scaleType = scale.type === "positive" ? "positive" as const : "negative" as const;
    const cls = getClassification(scaleAvg, scaleType);
    
    attentionData.push([removeDiacritics(scale.shortName), removeDiacritics(scale.name), scaleAvg.toFixed(2), removeDiacritics(cls.label)]);
    
    const riskyFactorsInScale = scaleFactors.filter(f => f.risk === "high" || f.risk === "medium");
    riskyFactorsInScale.forEach(f => {
      attentionData.push(["", `  - ${removeDiacritics(f.factor.name)}`, f.avg.toFixed(2), removeDiacritics(f.cls.label)]);
    });
  });

  autoTable(doc, {
    startY: cy,
    head: [["Escala", "Descricao", "Media", "Classificacao"]],
    body: attentionData,
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    columnStyles: { 0: { cellWidth: 18, fontStyle: "bold" }, 2: { cellWidth: 18, halign: "center" }, 3: { cellWidth: 30 } },
    alternateRowStyles: { fillColor: COLORS.bg },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const label = String(data.cell.raw);
        if (label.includes("Alto")) data.cell.styles.textColor = COLORS.danger;
        else if (label.includes("Medio")) data.cell.styles.textColor = COLORS.warning;
        else data.cell.styles.textColor = COLORS.success;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  cy = (doc as any).lastAutoTable?.finalY + 8 || cy + 40;

  cy = checkPageBreak(doc, cy, 20, company.name, "Conclusao", pageNum);

  const recText = removeDiacritics(
    `Recomenda-se a implementacao prioritaria das acoes propostas no Plano de Acao (secao 5), com reavaliacao em ${pxs.deadlineDays === 0 ? "ate 30 dias" : pxs.deadlineDays + " dias"} para acompanhamento da evolucao dos indicadores. As intervencoes devem priorizar os fatores classificados como Risco Alto.`
  );
  const recLines = wrapText(recText, CONTENT_WIDTH);
  recLines.forEach((line: string) => {
    doc.text(line, MARGIN, cy); cy += 4.5;
  });

  // ==================== 5. ACTION PLAN ====================
  // Uses the EXACT SAME logic as ActionPlans.tsx page
  doc.addPage();
  pageNum.value++;
  addHeader(doc, company.name, "Plano de Acao");
  addFooter(doc, pageNum.value);

  let ay = 48;
  ay = addSectionTitle(doc, "5. Plano de Acao Sugerido", ay);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);

  const introLines = wrapText(
    "Com base nos resultados obtidos e utilizando a mesma logica de geracao automatica de planos da plataforma, recomenda-se a implementacao das seguintes acoes para os fatores identificados com risco medio ou alto:",
    CONTENT_WIDTH
  );
  introLines.forEach((line: string) => {
    doc.text(line, MARGIN, ay); ay += 4.5;
  });
  ay += 4;

  // Generate action plans using same logic as ActionPlans page
  const riskyFactors = factorData.filter(f => f.risk === "high" || f.risk === "medium");

  if (riskyFactors.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("Nenhum fator com risco medio ou alto identificado. Manter controles existentes.", MARGIN, ay);
  } else {
    let planNum = 1;
    riskyFactors.forEach(f => {
      const suggested = getSuggestedActions(f.factor.id, f.risk);
      if (!suggested) return;

      ay = checkPageBreak(doc, ay, 30, company.name, "Plano de Acao (cont.)", pageNum);

      // Plan header
      doc.setFillColor(...(f.risk === "high" ? COLORS.danger : COLORS.warning));
      doc.rect(MARGIN, ay - 3, 3, 6, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`${planNum}. ${removeDiacritics(suggested.title)}`, MARGIN + 6, ay);
      ay += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text(`Fator: ${removeDiacritics(f.factor.name)} | Media: ${f.avg.toFixed(2)} | ${removeDiacritics(getRiskLabel(f.risk))} | Escala: ${f.scaleName}`, MARGIN + 6, ay);
      doc.setTextColor(...COLORS.text);
      ay += 6;

      // Tasks as a clean table
      const taskData = suggested.tasks.map((task, i) => [`${i + 1}`, removeDiacritics(task)]);
      
      autoTable(doc, {
        startY: ay,
        body: taskData,
        theme: "plain",
        bodyStyles: { fontSize: 7.5, textColor: COLORS.text, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
        columnStyles: { 
          0: { cellWidth: 8, halign: "center", fontStyle: "bold", textColor: COLORS.accent },
          1: { cellWidth: CONTENT_WIDTH - 20 }
        },
        margin: { left: MARGIN + 8, right: MARGIN },
      });
      ay = (doc as any).lastAutoTable?.finalY + 6 || ay + 20;

      planNum++;
    });
  }

  // ==================== 6. DETAIL PAGES ====================
  availableSections.forEach(section => {
    const qs = availableQuestions.filter(q => q.section === section.id);
    if (qs.length === 0) return;

    doc.addPage();
    pageNum.value++;
    addHeader(doc, company.name, `Detalhamento - ${section.name}`);
    addFooter(doc, pageNum.value);

    const tableData = qs.map(q => {
      const avg = data.getQuestionAverage(q.id, companyId);
      const dist = data.getAnswerDistribution(q.id, companyId);
      return [
        `${q.number}`,
        q.text,
        avg.toFixed(2),
        ...dist.map(d => `${d.count} (${d.percentage}%)`),
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [["No", "Pergunta", "Media", "Nunca", "Raramente", "As vezes", "Frequente", "Sempre"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fontSize: 7, textColor: COLORS.text },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 45 },
        2: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: COLORS.bg },
      margin: { left: MARGIN, right: MARGIN },
    });
  });

  // Sector breakdown
  const sectors = [...new Set(pool.map((r: any) => r.sector))].sort();
  if (sectors.length > 0) {
    doc.addPage();
    pageNum.value++;
    addHeader(doc, company.name, "Respostas por Setor");
    addFooter(doc, pageNum.value);

    const sectorTableData = sectors.map(sector => {
      const sectorPool = pool.filter((r: any) => r.sector === sector);
      const sectionAvgs = availableSections.map(s => {
        const qs = availableQuestions.filter(q => q.section === s.id);
        if (qs.length === 0 || sectorPool.length === 0) return "0.00";
        const qsWithData = qs.filter(q => sectorPool.some((r: any) => r.answers[q.id] !== undefined));
        if (qsWithData.length === 0) return "0.00";
        const avg = qsWithData.reduce((acc, q) => {
          const sum = sectorPool.reduce((a: number, r: any) => a + (r.answers[q.id] || 0), 0);
          return acc + sum / sectorPool.length;
        }, 0) / qsWithData.length;
        return avg.toFixed(2);
      });
      return [sector, `${sectorPool.length}`, ...sectionAvgs];
    });

    autoTable(doc, {
      startY: 48,
      head: [["Setor", "Respostas", ...availableSections.map(s => s.shortName)]],
      body: sectorTableData,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: COLORS.text },
      alternateRowStyles: { fillColor: COLORS.bg },
      margin: { left: MARGIN, right: MARGIN },
    });
  }

  // Footer page
  doc.addPage();
  pageNum.value++;
  addHeader(doc, company.name, "");
  addFooter(doc, pageNum.value);

  let fy = 80;
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text("PROATIVA", MARGIN, fy); fy += 8;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.text("Protocolo de Avaliacao dos Riscos Psicossociais no Trabalho (PROART)", MARGIN, fy); fy += 5;
  doc.text("Desenvolvido pelo Dr. Emilio Peres Facas - Universidade de Brasilia (UnB)", MARGIN, fy); fy += 10;

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(8);
  doc.text(`Relatório gerado automaticamente em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, MARGIN, fy); fy += 5;
  doc.text(`Empresa avaliada: ${company.name}`, MARGIN, fy); fy += 8;
  doc.text("As interpretacoes e recomendacoes devem ser validadas por profissional habilitado em", MARGIN, fy); fy += 4;
  doc.text("saude e seguranca do trabalho.", MARGIN, fy);

  doc.save(`relatorio_PROART_${company.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
}

export function exportComparisonPDF(companyIds: string[], data: PDFExportData, sectorFilter?: string) {
  const selected = data.companies.filter(c => companyIds.includes(c.id));
  if (selected.length === 0) return;

  const doc = new jsPDF("landscape");
  const availableSections = data.getAvailableSections();
  const availableQuestions = data.getAvailableQuestions();
  let pageNum = 1;

  const subtitle = sectorFilter ? `Comparativo - Setor: ${sectorFilter}` : "Relatório Comparativo";
  addHeader(doc, selected.map(c => c.name).join(" vs "), subtitle);
  addFooter(doc, pageNum);

  let y = 48;

  const overviewData = selected.map(c => {
    const avgs = availableSections.map(s => data.getSectionAverage(s.id, c.id).toFixed(2));
    const overall = availableSections.length > 0
      ? (availableSections.reduce((acc, s) => acc + data.getSectionAverage(s.id, c.id), 0) / availableSections.length).toFixed(2)
      : "0";
    return [c.name, `${data.getCompanyRespondents(c.id).length}`, ...avgs, overall];
  });

  autoTable(doc, {
    startY: y,
    head: [["Empresa", "Respostas", ...availableSections.map(s => s.shortName), "Media"]],
    body: overviewData,
    theme: "grid",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.bg },
    margin: { left: MARGIN, right: MARGIN },
  });

  availableSections.forEach(section => {
    const qs = availableQuestions.filter(q => q.section === section.id);
    if (qs.length === 0) return;

    doc.addPage("landscape");
    pageNum++;
    addHeader(doc, `Comparativo - ${section.name}`, subtitle);
    addFooter(doc, pageNum);

    const tableData = qs.map(q => {
      const vals = selected.map(c => {
        const avg = data.getQuestionAverage(q.id, c.id);
        const dist = data.getAnswerDistribution(q.id, c.id);
        const total = dist.reduce((a, d) => a + d.count, 0);
        return `${avg.toFixed(2)} (n=${total})`;
      });
      return [`${q.number}`, q.text, ...vals];
    });

    autoTable(doc, {
      startY: 48,
      head: [["Nº", "Pergunta", ...selected.map(c => c.name)]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fontSize: 7, textColor: COLORS.text },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 70 },
      },
      alternateRowStyles: { fillColor: COLORS.bg },
      margin: { left: MARGIN, right: MARGIN },
    });
  });

  doc.save(`comparativo_PROATIVA_${new Date().toISOString().split("T")[0]}.pdf`);
}
