export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: unknown;
};

export type PageEnvelope<T> = {
  data: T[];
  page: {
    nextCursor: string | null;
    previousCursor: string | null;
    hasMore: boolean;
    requestedLimit: number;
  };
  warnings?: string[];
};

export type FieldType =
  | "short_text"
  | "long_text"
  | "integer"
  | "decimal"
  | "currency"
  | "percentage"
  | "boolean"
  | "date"
  | "timestamp_tz"
  | "single_select"
  | "multiple_select"
  | "email"
  | "url"
  | "phone"
  | "user_reference";

export type SortDirection = "asc" | "desc";

export type RecordSort = {
  fieldId: string;
  direction: SortDirection;
};

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "is_empty"
  | "is_not_empty"
  | "is_any_of";

export type FilterExpression =
  | {
      kind: "rule";
      fieldId: string;
      operator: FilterOperator;
      value?: unknown;
    }
  | {
      kind: "group";
      conjunction: "and" | "or";
      children: FilterExpression[];
    };
