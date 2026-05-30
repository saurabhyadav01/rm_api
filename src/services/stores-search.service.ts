import { storesListService, type StoresListInput } from "./stores-list.service";

export type StoresSearchInput = StoresListInput;

/** Same response shape and store rows as `POST /stores/list` (keyword + filters optional). */
export async function storesSearchService(input: StoresSearchInput) {
  return storesListService(input);
}
