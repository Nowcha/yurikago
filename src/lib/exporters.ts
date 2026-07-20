import type { Household, TaskInstance, PurchaseItem, CareRecord } from '../types';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** hard期限・未完了・期限日確定済みのタスクをICS用の.icsテキストに変換（DOM非依存） */
export function buildIcsCalendar(tasks: TaskInstance[]): string {
  const events = tasks
    .filter((t) => t.deadline === 'hard' && t.dueDateResolved && t.status !== 'done' && t.status !== 'na')
    .map((t) => {
      const d = t.dueDateResolved!.replace(/-/g, '');
      return [
        'BEGIN:VEVENT',
        `UID:${t.id}@yurikago`,
        `DTSTART;VALUE=DATE:${d}`,
        `SUMMARY:【期限】${escapeIcs(t.title)}`,
        `DESCRIPTION:${escapeIcs(t.notes ?? '')}`,
        'BEGIN:VALARM',
        'TRIGGER:-P3D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcs(t.title)} 期限3日前`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yurikago//JP',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/** hard期限タスクをICS（終日イベント）としてエクスポート */
export function exportIcs(tasks: TaskInstance[]) {
  download('yurikago-deadlines.ics', buildIcsCalendar(tasks), 'text/calendar');
}

export interface ExportPayload {
  exportedAt: string;
  household: Household;
  tasks: TaskInstance[];
  items: PurchaseItem[];
  records: CareRecord[];
}

/** 全データJSONバックアップのペイロード構築（DOM非依存） */
export function buildExportPayload(
  household: Household, tasks: TaskInstance[], items: PurchaseItem[], records: CareRecord[] = [],
): ExportPayload {
  return { exportedAt: new Date().toISOString(), household, tasks, items, records };
}

/** 全データJSONバックアップ（Claude Code分析の入力にも使う） */
export function exportJson(
  household: Household, tasks: TaskInstance[], items: PurchaseItem[], records: CareRecord[] = [],
) {
  const payload = buildExportPayload(household, tasks, items, records);
  download(
    `yurikago-export-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}
