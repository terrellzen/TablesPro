import type { Dispatch, SetStateAction } from "react";
import type { Status } from "../../../types/domain.js";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type StatusSetter = StateSetter<Status>;
export type AsyncLoader = (id: string) => Promise<void>;

