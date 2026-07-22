import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import type { Field, RecordRow } from "../../types/domain.js";
import { buildDropdownColors } from "./dropdownColors.js";

export type DropdownOptionSet = {
  values: string[];
  colors: Record<string, string>;
};

export type DropdownOptionsByField = Record<string, DropdownOptionSet>;

export function useDropdownOptions(
  tableId: string | null,
  fields: Field[],
  records: RecordRow[]
): DropdownOptionsByField {
  const [remoteOptions, setRemoteOptions] = useState<DropdownOptionsByField>({});
  const dropdownFields = useMemo(
    () => fields.filter((field) => field.field_type === "single_select"),
    [fields]
  );

  useEffect(() => {
    if (!tableId || dropdownFields.length === 0) {
      setRemoteOptions({});
      return;
    }
    const controller = new AbortController();
    void Promise.all(dropdownFields.map(async (field) => {
      const response = await api<{ data: DropdownOptionSet }>(
        `/api/tables/${tableId}/fields/${field.field_id}/dropdown-options`,
        { signal: controller.signal }
      );
      return [field.field_id, response.data] as const;
    })).then((entries) => setRemoteOptions(Object.fromEntries(entries))).catch(() => {
      if (!controller.signal.aborted) setRemoteOptions({});
    });
    return () => controller.abort();
  }, [tableId, dropdownFields]);

  return useMemo(() => Object.fromEntries(dropdownFields.map((field) => {
    const remote = remoteOptions[field.field_id];
    const values = new Set(remote?.values ?? []);
    for (const record of records) {
      const value = record[field.physical_column_name];
      if (typeof value === "string" && value.trim()) values.add(value);
    }
    const valueList = [...values];
    return [field.field_id, {
      values: valueList,
      colors: buildDropdownColors(valueList, { ...remote?.colors, ...field.options?.choiceColors })
    }];
  })), [dropdownFields, records, remoteOptions]);
}
