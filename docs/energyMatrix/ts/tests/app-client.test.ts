import assert from "node:assert/strict";
import test from "node:test";

import { resolveClientBase, resolveProjectName } from "../src/appRuntime.ts";

test("client base uses the page origin so the Vite proxy can handle FIN auth", () => {
  assert.equal(resolveClientBase({ origin: "http://localhost:8083" }).toString(), "http://localhost:8083/");
});

test("local dev on 8083 defaults to mytest instead of sys", () => {
  assert.equal(
    resolveProjectName({ pathname: "/", search: "", hostname: "localhost", port: "8083" }),
    "mytest",
  );
});

test("explicit project sources win over the local dev fallback", () => {
  assert.equal(
    resolveProjectName({ pathname: "/", search: "?project=demo", hostname: "localhost", port: "8083" }),
    "demo",
  );
  assert.equal(
    resolveProjectName({ pathname: "/", search: "", hostname: "localhost", port: "8083" }, "shellProj"),
    "shellProj",
  );
  assert.equal(
    resolveProjectName({ pathname: "/api/mytest/about", search: "", hostname: "localhost", port: "8080" }),
    "mytest",
  );
});

test("VITE_FIN_PROJECT is only a development fallback", () => {
  assert.equal(
    resolveProjectName(
      { pathname: "/", search: "", hostname: "127.0.0.1", port: "8093" },
      undefined,
      { DEV: true, VITE_FIN_PROJECT: "mytest" },
    ),
    "mytest",
  );
  assert.equal(
    resolveProjectName(
      { pathname: "/", search: "", hostname: "fin.example", port: "" },
      undefined,
      { DEV: false, VITE_FIN_PROJECT: "mytest" },
    ),
    "sys",
  );
});
