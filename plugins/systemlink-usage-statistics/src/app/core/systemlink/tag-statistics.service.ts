import { Injectable } from '@angular/core';

import { SystemLinkContextService } from './systemlink-context.service';

export interface TagHistoryEntry {
  value: number;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class TagStatisticsService {
  constructor(private readonly context: SystemLinkContextService) {}

  tagPath(metricKey: string): string {
    const sanitized = metricKey
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .split('-')
      .filter(p => p.length > 0)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
    return `SystemLink.Statistics.${sanitized}`;
  }

  // Creates/updates all tags then writes their current values in two bulk calls.
  async writeAllMetrics(metrics: Array<{ key: string; value: number }>, timestamp: string): Promise<void> {
    const workspaceId = await this.context.resolveWorkspaceId();
    const entries = metrics.map(m => ({ path: this.tagPath(m.key), value: m.value }));
    await this.bulkEnsureTags(entries.map(e => e.path), workspaceId);
    await this.bulkWriteValues(entries, timestamp, workspaceId);
  }

  // Single-metric path kept for the per-metric selection used by stats dialog.
  async ensureTagAndWriteValue(metricKey: string, value: number, timestamp: string): Promise<void> {
    await this.writeAllMetrics([{ key: metricKey, value }], timestamp);
  }

  async readTagHistory(metricKey: string): Promise<TagHistoryEntry[]> {
    const path = this.tagPath(metricKey);
    const workspaceId = await this.context.resolveWorkspaceId();
    // The Tag Historian API has no workspace URL segment; workspace goes in the body.
    const historyPath = '/nitaghistorian/v2/tags/query-history';
    const allEntries: TagHistoryEntry[] = [];
    let continuationToken = '';
    const startTime = new Date(Date.now() - 365 * 10 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    for (let page = 0; page < 20; page++) {
      let response: Response | null = null;
      // Retry with exponential backoff for transient failures (429, 5xx, network)
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise<void>(r => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
        }
        try {
          response = await fetch(
            this.context.buildApiUrl(historyPath),
            this.context.buildRequestInit({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path,
                ...(workspaceId ? { workspace: workspaceId } : {}),
                startTime,
                endTime,
                take: 1000,
                continuationToken,
                sortOrder: 'ASCENDING',
              }),
            }),
          );
          // Retry on rate-limit or server errors; stop on client errors
          if (response.ok || (response.status >= 400 && response.status < 429)) break;
          console.warn(`[TagStatistics] query-history ${response.status}, retry ${attempt + 1}`);
        } catch (e) {
          console.warn('[TagStatistics] query-history network error, retry', attempt + 1, e);
          response = null;
        }
      }

      if (!response?.ok) {
        if (response) {
          console.error('[TagStatistics] query-history failed:', response.status, await response.text().catch(() => ''));
        }
        break;
      }

      const payload = (await response.json()) as unknown;
      const entries = this.parseHistory(payload);
      allEntries.push(...entries);

      const record = payload as Record<string, unknown>;
      const next = typeof record['continuationToken'] === 'string' ? record['continuationToken'] : '';
      if (!next || entries.length === 0) break;
      continuationToken = next;
    }

    return allEntries;
  }

  private async bulkEnsureTags(paths: string[], workspaceId: string | null): Promise<void> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/nitag/v2/update-tags'),
        this.context.buildRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: paths.map(path => ({
              path,
              type: 'INT',
              ...(workspaceId ? { workspace: workspaceId } : {}),
              properties: {
                nitagHistoryTTLDays: '365',
                nitagMaxHistoryCount: '10000',
                nitagRetention: 'DURATION',
              },
            })),
          }),
        }),
      );
      if (!response.ok) {
        console.error('[TagStatistics] update-tags failed:', response.status, await response.text().catch(() => ''));
      }
    } catch (e) {
      console.error('[TagStatistics] update-tags error:', e);
    }
  }

  private async bulkWriteValues(entries: Array<{ path: string; value: number }>, timestamp: string, workspaceId: string | null): Promise<void> {
    try {
      const response = await fetch(
        this.context.buildApiUrl('/nitag/v2/update-current-values'),
        this.context.buildRequestInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            entries.map(e => ({
              path: e.path,
              ...(workspaceId ? { workspace: workspaceId } : {}),
              updates: [
                {
                  value: { type: 'INT', value: String(Math.round(e.value)) },
                  timestamp,
                },
              ],
            })),
          ),
        }),
      );
      if (!response.ok) {
        console.error('[TagStatistics] update-current-values failed:', response.status, await response.text().catch(() => ''));
      }
    } catch (e) {
      console.error('[TagStatistics] update-current-values error:', e);
    }
  }

  private parseHistory(payload: unknown): TagHistoryEntry[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;

    // Shape from /history endpoint: { values: [...] }
    if (Array.isArray(record['values'])) {
      return this.extractEntries(record['values'] as unknown[]);
    }

    // Shape: top-level array
    if (Array.isArray(payload)) {
      return this.extractEntries(payload as unknown[]);
    }

    // Shape: { tagsWithValues: [{ values: [...] }] }
    if (Array.isArray(record['tagsWithValues'])) {
      const first = (record['tagsWithValues'] as unknown[])[0];
      if (first && typeof first === 'object') {
        const tagRecord = first as Record<string, unknown>;
        if (Array.isArray(tagRecord['values'])) {
          return this.extractEntries(tagRecord['values'] as unknown[]);
        }
      }
    }

    // Shape from /values endpoint: { current: { timestamp, value: { type, value } } }
    if (record['current'] && typeof record['current'] === 'object') {
      return this.extractEntries([record['current']]);
    }

    return [];
  }

  private extractEntries(items: unknown[]): TagHistoryEntry[] {
    const entries: TagHistoryEntry[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;
      const timestamp = typeof record['timestamp'] === 'string' ? record['timestamp'] : null;
      if (!timestamp) {
        continue;
      }

      let value: number | null = null;
      const valueField = record['value'];

      if (typeof valueField === 'number') {
        value = valueField;
      } else if (typeof valueField === 'string') {
        value = parseFloat(valueField);
      } else if (valueField && typeof valueField === 'object') {
        const vr = valueField as Record<string, unknown>;
        const raw = vr['value'];
        if (typeof raw === 'number') value = raw;
        else if (typeof raw === 'string') value = parseFloat(raw);
      }

      if (value !== null && isFinite(value)) {
        entries.push({ value, timestamp });
      }
    }
    return entries;
  }
}
