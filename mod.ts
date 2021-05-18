import * as types from "./lib.d.ts";

type XMLHttpRequestSpec = types.XMLHttpRequest;

interface State {
  readyState: number;
  draft?: {
    method: string;
    url: URL;
    headers: Headers;
  };
  computed?: {
    type: types.XMLHttpRequestResponseType;
    blob: Blob;
    text: string;
    buffer: ArrayBuffer;
    // deno-lint-ignore no-explicit-any
    json?: any; // we are just gonna lazy-load this
  };
  controller?: AbortController;
  response?: Response;
}

// TODO: actually allow for `addEventListener` to work

export class XMLHttpRequestEventTarget
  extends EventTarget
  // This basically makes it ensure that the implemented methods match the spec
  // and include the JSDoc from the lib.d.ts.
  implements
    Pick<types.XMLHttpRequestEventTarget, keyof XMLHttpRequestEventTarget>
{
  onload: XMLHttpRequestSpec["onload"] = null;
  onerror: XMLHttpRequestSpec["onerror"] = null;
  onloadstart: XMLHttpRequestSpec["onloadstart"] = null;
  ontimeout: XMLHttpRequestSpec["ontimeout"] = null;
}

/** Use XMLHttpRequest (XHR) objects to interact with servers. You can retrieve data from a URL without having to do a full page refresh. This enables a Web page to update just part of a page without disrupting what the user is doing. */
export class XMLHttpRequest
  extends XMLHttpRequestEventTarget
  implements Pick<XMLHttpRequestSpec, keyof XMLHttpRequest>
{
  #state: State = {
    readyState: this.UNSENT,
  };

  #setReadyState = (newState: number): void => {
    this.#state.readyState = newState;

    // this technically shouldn't happen in our code but the spec is pretty
    // explicit

    if (newState === 0) return;
    // deno-lint-ignore no-explicit-any
    (this as any).onreadystatechange?.();
  };

  // it's supposed to be here
  onreadystatechange: XMLHttpRequestSpec["onreadystatechange"] = null;

  timeout = 0;

  // Technically, these need to be getters to implement the spec. Otherwise, we
  // get type errors.

  get UNSENT(): number {
    return 0;
  }

  get OPENED(): number {
    return 1;
  }

  get HEADERS_RECEIVED(): number {
    return 2;
  }

  get LOADING(): number {
    return 3;
  }

  get DONE(): number {
    return 4;
  }

  get readyState(): number {
    return this.#state.readyState;
  }

  get response(): XMLHttpRequestSpec["response"] {
    const computed = this.#state.computed!;
    switch (this.responseType) {
      case "arraybuffer":
        return computed.buffer;
      case "blob":
        return computed.blob;
      case "json":
        computed.json ??= JSON.parse(computed.text);
        return computed.json;
      case "text":
        return computed.text;
      default:
        throw Error("Unimplemented.");
    }
  }

  // MDN states that this returns `null` if the response hasn't been received
  // yet, but Chrome just returns `undefined`. Also, the TypeScript types
  // state that this property returns `string | null`. We'll just return
  // null` but non-null assert at the end to match keep the types compatible.

  get responseText(): string {
    return (this.#state.computed?.text ?? null)!;
  }

  get responseType(): types.XMLHttpRequestResponseType {
    return (this.#state.computed?.type ?? "text")!;
  }

  // Refer to the comment above as the situation is the same. I dunno what the
  // TypeScript JSDoc is saying about throwing errors as that is definitely
  // not in the spec.

  // TODO: exclude fragment flag set
  // ref: https://xhr.spec.whatwg.org/#the-responseurl-attribute

  get responseURL(): string {
    return (this.#state.response?.url ?? null)!;
  }

  get responseXML(): XMLHttpRequestSpec["responseXML"] {
    throw Error("Unimplemented.");
  }

  get status(): number {
    return this.#state.response!.status;
  }

  get statusText(): string {
    return this.#state.response!.statusText;
  }

  open(method: string, url: string): void {
    this.#state.draft = {
      method,
      url: new URL(url),
      headers: new Headers(),
    };
    this.#setReadyState(this.OPENED);
  }

  overrideMimeType(type: types.XMLHttpRequestResponseType): void {
    this.#state.computed = {
      ...this.#state.computed,
      type,
    } as State["computed"];
  }

  setRequestHeader(name: string, value: string): void {
    // it should be opened before doing this
    if (this.readyState === this.OPENED) {
      this.#state.draft!.headers.set(name, value);
    }
  }

  getResponseHeader(name: string) {
    return this.#state.response!.headers.get(name);
  }

  getAllResponseHeaders(): string {
    return Array.from(this.#state.response!.headers.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
  }

  send(body?: BodyInit | null): void {
    const controller = new AbortController();
    const draft = this.#state.draft!;

    const timeoutId = setTimeout(() => {
      controller.abort();
      // deno-lint-ignore no-explicit-any
      (this as any).ontimeout?.();
    }, this.timeout);

    fetch(draft.url, {
      ...draft,
      body,
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId);
        this.#state.response = res;
        this.#setReadyState(this.HEADERS_RECEIVED);
        this.#setReadyState(this.LOADING);

        // Can't use `Promise.all` with `res.blob()` + `res.arrayBuffer()`
        // because you can only call one of them. After that, the body is
        // dropped which results in an error.

        res.blob().then((blob) => {
          blob.arrayBuffer().then((buf) => {
            this.#state.computed = {
              ...this.#state.computed,
              text: new TextDecoder().decode(buf),
              buffer: buf,
              blob,
            } as State["computed"];
            this.#state.computed!.type ??= "text";
            this.#setReadyState(this.DONE);
            // deno-lint-ignore no-explicit-any
            (this as any).onload?.();
          });
        });
      })
      .catch((e) => {
        clearTimeout(timeoutId);
        // deno-lint-ignore no-explicit-any
        (this as any).onerror?.(e);
      });
    this.#state.controller = controller;
  }

  // This will not work at the moment because fetch does not currently support
  // the `AbortController` API in Deno.

  abort(): void {
    this.#state.controller!.abort();
  }
}
