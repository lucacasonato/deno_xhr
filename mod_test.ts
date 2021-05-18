import { XMLHttpRequest } from "./mod.ts";

import { assertEquals } from "https://deno.land/std@0.97.0/testing/asserts.ts";

Deno.test("Ready State Callbacks", () => {
  const xhr = new XMLHttpRequest();
  let times = 0;
  xhr.onreadystatechange = () => void times++;
  xhr.open("GET", "https://foo.bar");
  assertEquals(times, 1);
});
