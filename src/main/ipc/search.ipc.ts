import { IPC } from '@shared/ipc-channels';
import { handle } from './register';
import { searchArchives } from '../db/fts';
import type { SearchQuery, SearchResult } from '@shared/types';

export function registerSearchIpc(): void {
  handle<SearchResult>(IPC.SEARCH_QUERY, (payload) => searchArchives((payload ?? {}) as SearchQuery));
}
