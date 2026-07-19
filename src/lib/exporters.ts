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

/** hard期限タスクをICS（終日イベント）としてエクスポート */
export function exportIcs(tasks: TaskInstance[]) {
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
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yurikago//JP',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
  download('yurikago-deadlines.ics', ics, 'text/calendar');
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** 全データJSONバックアップ（Claude Code分析の入力にも使う） */
export function exportJson(
  household: Household, tasks: TaskInstance[], items: PurchaseItem[], records: CareRecord[] = [],
) {
  const payload = {
    exportedAt: new Date().toISOString(),
    household,
    tasks,
    items,
    records,
  };
  download(
    `yurikago-export-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}
