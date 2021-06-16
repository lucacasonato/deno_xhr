import { XMLHttpRequest } from "./mod.ts";

// deno-lint-ignore no-explicit-any
(window as any).XMLHttpRequest = XMLHttpRequest;
