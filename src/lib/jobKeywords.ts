// Heurísticas de palavra-chave compartilhadas entre o scraper de HTML e os
// conectores de API (que só têm um título em texto livre pra adivinhar
// senioridade/contrato, sem um campo estruturado pra isso). Os padrões de
// senioridade cobrem inglês e português no mesmo regex (ex.: "s[eê]nior"
// casa tanto "senior" quanto "sênior").

export const WORK_TYPE_KEYWORDS: [RegExp, string][] = [
  [/h[ií]brido|hybrid/i, "hibrido"],
  [/presencial|on-?site/i, "presencial"],
  [/remoto|remote|home[\s-]?office/i, "remoto"],
];

export const SENIORITY_KEYWORDS: [RegExp, string][] = [
  [/est[aá]gi[oá]|intern(ship)?/i, "estagio"],
  [/j[uú]nior|\bjr\b/i, "junior"],
  [/pleno|mid-?level/i, "pleno"],
  [/s[eê]nior|\bsr\b|lead|staff|principal/i, "senior"],
  [/especialista|specialist|expert/i, "especialista"],
];

export const CONTRACT_KEYWORDS: [RegExp, string][] = [
  [/\bclt\b/i, "clt"],
  [/\bpj\b|pessoa jur[ií]dica/i, "pj"],
  [/est[aá]gi[oá]|intern(ship)?/i, "estagio"],
  [/freelan(cer|ce)?/i, "freelancer"],
  [/tempor[aá]rio|temporary/i, "temporario"],
];

export const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/desenvolv|program|software|\bti\b|tecnologia|dados|engineer(ing)?|developer/i, "TI"],
  [/marketing/i, "Marketing"],
  [/vendas|comercial|\bsales\b/i, "Vendas"],
  [/recursos humanos|\brh\b|\bhr\b|people/i, "RH"],
  [/financeiro|cont[aá]bil|finance/i, "Financeiro"],
  [/design|\bux\b|\bui\b/i, "Design"],
  [/atendimento|suporte|\bsac\b|support/i, "Atendimento"],
  [/jur[ií]dico|advocacia|legal/i, "Jurídico"],
  [/engenharia/i, "Engenharia"],
  [/sa[uú]de|enfermagem|medicina|health|medical/i, "Saúde"],
  [/educa[cç][aã]o|professor|ensino|education/i, "Educação"],
  [/log[ií]stica|estoque|almoxarifado|logistics/i, "Logística"],
  [/administrativo|admin/i, "Administrativo"],
];

export function matchFirst(text: string, keywords: [RegExp, string][]): string | null {
  for (const [re, label] of keywords) {
    if (re.test(text)) return label;
  }
  return null;
}
