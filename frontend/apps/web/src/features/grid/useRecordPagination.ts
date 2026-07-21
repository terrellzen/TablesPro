import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../lib/api.js";
import { errorMessage } from "../../lib/format.js";
import type { PageEnvelope, RecordRow } from "../../types/domain.js";

type RecordQuery = {
  selectedTableId: string | null;
  filterFieldId: string;
  filterValue: string;
  sortFieldId: string;
  sortDirection: "asc" | "desc";
  onError: (message: string) => void;
};

export type RecordPagination = {
  records: RecordRow[];
  setRecords: Dispatch<SetStateAction<RecordRow[]>>;
  hasMore: boolean;
  loadingMore: boolean;
  loadingRows: boolean;
  loadMoreError: string | null;
  reloadRecords: (tableId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  cancelRecordRequests: () => void;
};

export function useRecordPagination(query: RecordQuery): RecordPagination {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const initialRequestRef = useRef<AbortController | null>(null);
  const loadMoreRequestRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const cancelRecordRequests = useCallback(() => {
    generationRef.current += 1;
    initialRequestRef.current?.abort();
    loadMoreRequestRef.current?.abort();
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, []);

  const fetchPage = useCallback(async (tableId: string, cursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    if (query.filterFieldId && query.filterValue) {
      params.set("filter", JSON.stringify({
        kind: "rule",
        fieldId: query.filterFieldId,
        operator: "contains",
        value: query.filterValue
      }));
    }
    if (query.sortFieldId) {
      params.set("sort", JSON.stringify([{ fieldId: query.sortFieldId, direction: query.sortDirection }]));
    }
    return api<PageEnvelope<RecordRow>>(`/api/tables/${tableId}/records?${params.toString()}`, signal ? { signal } : {});
  }, [query.filterFieldId, query.filterValue, query.sortDirection, query.sortFieldId]);

  const reloadRecords = useCallback(async (tableId: string) => {
    cancelRecordRequests();
    const generation = generationRef.current;
    const controller = new AbortController();
    initialRequestRef.current = controller;
    setRecords([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadMoreError(null);
    setLoadingRows(true);
    try {
      const response = await fetchPage(tableId, undefined, controller.signal);
      if (generationRef.current !== generation) return;
      setRecords(response.data);
      setHasMore(response.page?.hasMore ?? false);
      setNextCursor(response.page?.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted && generationRef.current === generation) query.onError(errorMessage(error));
    } finally {
      if (generationRef.current === generation) setLoadingRows(false);
    }
  }, [cancelRecordRequests, fetchPage, query.onError]);

  const loadMore = useCallback(async () => {
    if (!query.selectedTableId || !hasMore || loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const generation = generationRef.current;
    const controller = new AbortController();
    loadMoreRequestRef.current?.abort();
    loadMoreRequestRef.current = controller;
    try {
      const response = await fetchPage(query.selectedTableId, nextCursor, controller.signal);
      if (generationRef.current !== generation) return;
      setRecords((current) => {
        const existingIds = new Set(current.map((record) => record.record_id));
        return [...current, ...response.data.filter((record) => !existingIds.has(record.record_id))];
      });
      setHasMore(response.page?.hasMore ?? false);
      setNextCursor(response.page?.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted && generationRef.current === generation) {
        const message = errorMessage(error);
        setLoadMoreError(message);
        query.onError(message);
      }
    } finally {
      if (generationRef.current === generation) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchPage, hasMore, nextCursor, query.onError, query.selectedTableId]);

  return { records, setRecords, hasMore, loadingMore, loadingRows, loadMoreError, reloadRecords, loadMore, cancelRecordRequests };
}
