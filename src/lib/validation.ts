// Pure validation — no React, no Supabase. Produces a detailed report and the
// parsed payload (only when fully valid). The database constraints are the
// backstop; this gives the human a readable report and blocks bad imports.

export interface ParsedQuestion {
  id: number;
  topic: string;
  exam: string;
  q: string;
  opts: string[];
  answer: number;
  source: string | null;
  explanation: string;
}

export interface ParsedBank {
  name: string;
  description: string | null;
  questions: ParsedQuestion[];
}

export interface QuestionIssue {
  position: number; // 1-based position in the array
  id?: number;
  message: string;
}

export interface FileReport {
  fileName: string;
  ok: boolean;
  bankName: string | null;
  questionCount: number;
  fileErrors: string[]; // structural problems (bad JSON, missing fields)
  questionIssues: QuestionIssue[];
  parsed?: ParsedBank;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateBankFile(fileName: string, raw: string): FileReport {
  const report: FileReport = {
    fileName,
    ok: false,
    bankName: null,
    questionCount: 0,
    fileErrors: [],
    questionIssues: [],
  };

  // 1. JSON syntax
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    report.fileErrors.push('Not valid JSON — the file could not be parsed.');
    return report;
  }

  // 2. Top-level shape
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    report.fileErrors.push('The top level must be an object with "name" and "questions".');
    return report;
  }
  const obj = data as Record<string, unknown>;

  if (!isNonEmptyString(obj.name)) {
    report.fileErrors.push('Missing or empty "name".');
  } else {
    report.bankName = obj.name.trim();
  }

  if (!Array.isArray(obj.questions)) {
    report.fileErrors.push('Missing "questions" — it must be an array.');
    return report;
  }
  if (obj.questions.length === 0) {
    report.fileErrors.push('"questions" is empty — nothing to import.');
    return report;
  }
  report.questionCount = obj.questions.length;

  // 3. Per-question validation
  const seenIds = new Map<number, number>(); // id -> first position
  const seenText = new Map<string, number>(); // normalised text -> first position
  const clean: ParsedQuestion[] = [];

  obj.questions.forEach((item, i) => {
    const pos = i + 1;
    const add = (message: string, id?: number) =>
      report.questionIssues.push({ position: pos, id, message });

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      add('Not an object.');
      return;
    }
    const qn = item as Record<string, unknown>;
    const rawId = qn.id;
    const id = typeof rawId === 'number' && Number.isInteger(rawId) ? rawId : undefined;

    if (id === undefined) add('"id" must be an integer.');
    else {
      const first = seenIds.get(id);
      if (first !== undefined) add(`Duplicate id ${id} (also at position ${first}).`, id);
      else seenIds.set(id, pos);
    }

    if (!isNonEmptyString(qn.topic)) add('"topic" is missing or empty.', id);
    if (!isNonEmptyString(qn.exam)) add('"exam" is missing or empty.', id);
    if (!isNonEmptyString(qn.q)) add('"q" (question text) is missing or empty.', id);
    if (!isNonEmptyString(qn.explanation)) add('"explanation" is missing or empty.', id);
    if (qn.source !== undefined && qn.source !== null && typeof qn.source !== 'string')
      add('"source" must be text when present.', id);

    // options
    let optsOk = false;
    if (!Array.isArray(qn.opts)) {
      add('"opts" must be an array.', id);
    } else if (qn.opts.length < 2) {
      add('"opts" must have at least 2 options.', id);
    } else if (!qn.opts.every((o) => isNonEmptyString(o))) {
      add('Every option in "opts" must be non-empty text.', id);
    } else {
      optsOk = true;
    }

    // answer
    const answer = qn.answer;
    if (typeof answer !== 'number' || !Number.isInteger(answer)) {
      add('"answer" must be an integer index.', id);
    } else if (optsOk && (answer < 0 || answer >= (qn.opts as unknown[]).length)) {
      add(`"answer" (${answer}) is out of range for the options.`, id);
    }

    // duplicate question text
    if (isNonEmptyString(qn.q)) {
      const key = qn.q.trim().toLowerCase();
      const first = seenText.get(key);
      if (first !== undefined) add(`Duplicate question text (also at position ${first}).`, id);
      else seenText.set(key, pos);
    }

    // collect a clean record (only meaningful if this question had no issues)
    if (
      id !== undefined &&
      isNonEmptyString(qn.topic) &&
      isNonEmptyString(qn.exam) &&
      isNonEmptyString(qn.q) &&
      isNonEmptyString(qn.explanation) &&
      optsOk &&
      typeof answer === 'number'
    ) {
      clean.push({
        id,
        topic: (qn.topic as string).trim(),
        exam: (qn.exam as string).trim(),
        q: (qn.q as string).trim(),
        opts: (qn.opts as string[]).map((o) => o.trim()),
        answer,
        source: isNonEmptyString(qn.source) ? (qn.source as string).trim() : null,
        explanation: (qn.explanation as string).trim(),
      });
    }
  });

  report.ok = report.fileErrors.length === 0 && report.questionIssues.length === 0;
  if (report.ok && report.bankName) {
    report.parsed = {
      name: report.bankName,
      description: isNonEmptyString(obj.description) ? obj.description.trim() : null,
      questions: clean,
    };
  }
  return report;
}
