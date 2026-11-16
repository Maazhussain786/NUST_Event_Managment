import { NextResponse } from 'next/server';
import { query } from './db';
import { ApiErrors } from './api-utils';
import type { JWTPayload } from './auth';
import { getEventAccess, rules, canSeeEventWorkspace, type EventAccess } from './rbac';
import { isUuid } from './event-workspace';

/** Recruitment (FR-REC-01..07): Forms -> Shortlisting -> Interviews -> Team Creation. */

export const QUESTION_TYPES = ['short_text', 'long_text', 'single_choice', 'multi_choice', 'number', 'url'] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
}

export interface FormRow {
  id: string;
  society_id: string;
  event_id: string;
  team_id: string | null;
  target_role: 'EXECUTIVE' | 'TEAM_LEAD';
  title: string;
  description: string | null;
  questions: Question[];
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINALIZED';
  closes_at: string | null;
  created_by: string;
  team_name: string | null;
  event_title: string;
}

/** Validates and normalises the question list of a form (FR-REC-01). */
export function validateQuestions(raw: unknown): Question[] | string {
  if (!Array.isArray(raw)) return 'questions must be a list';
  if (raw.length > 30) return 'A form can have at most 30 questions';
  const seen = new Set<string>();
  const out: Question[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i];
    const item = (q ?? {}) as Record<string, unknown>;
    const label = String(item.label || '').trim();
    const type = String(item.type || 'short_text') as QuestionType;
    const id = String(item.id || `q${i + 1}`).trim().slice(0, 40);
    if (!label) return `Question ${i + 1} needs a label`;
    if (label.length > 500) return `Question ${i + 1} is too long`;
    if (!QUESTION_TYPES.includes(type)) return `Question ${i + 1} has an unknown type`;
    if (seen.has(id)) return `Question ids must be unique (${id})`;
    seen.add(id);
    const question: Question = { id, label, type, required: Boolean(item.required) };
    if (type === 'single_choice' || type === 'multi_choice') {
      const options = Array.isArray(item.options) ? item.options.map((o) => String(o).trim()).filter(Boolean) : [];
      if (options.length < 2) return `Question ${i + 1} needs at least two options`;
      question.options = Array.from(new Set(options)).slice(0, 30);
    }
    out.push(question);
  }
  return out;
}

/** Validates an applicant's answers against the form (FR-REC-02). */
export function validateAnswers(questions: Question[], raw: unknown): Record<string, unknown> | string {
  const answers = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const q of questions) {
    const value = answers[q.id];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (q.required) return `Please answer: ${q.label}`;
      continue;
    }
    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const s = String(value).trim();
        const max = q.type === 'short_text' ? 500 : 5000;
        if (s.length > max) return `Answer too long: ${q.label}`;
        clean[q.id] = s;
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) return `Enter a number: ${q.label}`;
        clean[q.id] = n;
        break;
      }
      case 'url': {
        const s = String(value).trim();
        if (!/^https?:\/\/\S+$/i.test(s) || s.length > 500) return `Enter a valid link: ${q.label}`;
        clean[q.id] = s;
        break;
      }
      case 'single_choice': {
        const s = String(value);
        if (!q.options?.includes(s)) return `Choose a valid option: ${q.label}`;
        clean[q.id] = s;
        break;
      }
      case 'multi_choice': {
        const list = (Array.isArray(value) ? value : [value]).map(String);
        if (list.some((v) => !q.options?.includes(v))) return `Choose valid options: ${q.label}`;
        clean[q.id] = Array.from(new Set(list));
        break;
      }
    }
  }
  return clean;
}

export async function loadForm(formId: string): Promise<FormRow | null> {
  if (!isUuid(formId)) return null;
  const result = await query(
    `SELECT f.*, p.name AS team_name, e.title AS event_title
     FROM recruitment_forms f
     JOIN events e ON e.id = f.event_id
     LEFT JOIN event_teams et ON et.id = f.team_id
     LEFT JOIN portfolios p ON p.id = et.portfolio_id
     WHERE f.id = $1`,
    [formId],
  );
  return result.rows[0] ?? null;
}

export interface FormAccess {
  form: FormRow;
  access: EventAccess;
  canManage: boolean;
  canView: boolean;
}

/** Loads a form and the caller's rights over it, or returns an error response. */
export async function formWithAccess(user: JWTPayload, formId: string): Promise<FormAccess | NextResponse> {
  const form = await loadForm(formId);
  if (!form) return ApiErrors.notFound('Recruitment form');
  const access = await getEventAccess(user, form.event_id);
  if (!access || access.event.deleted_at) return ApiErrors.notFound('Recruitment form');
  const canManage = rules.manageRecruitmentFor(access, form.team_id);
  const canView = canManage || rules.viewAllRecruitment(access) ||
    (form.team_id !== null && access.teams.some((t) => t.teamId === form.team_id && t.teamRole === 'TEAM_LEAD'));
  return { form, access, canManage, canView: canView && canSeeEventWorkspace(access) || canManage };
}

export function isFormAcceptingApplications(form: FormRow): boolean {
  return form.status === 'OPEN' && (!form.closes_at || new Date(form.closes_at) > new Date());
}
