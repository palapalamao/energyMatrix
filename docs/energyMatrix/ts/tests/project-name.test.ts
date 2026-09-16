import assert from "node:assert/strict";
import test from "node:test";

import { resolveProjectName } from "../src/projectName.ts";

test("development project overrides the FIN shell project", () => {
  assert.equal(
    resolveProjectName({
      routeProject: undefined,
      devProject: " mytest ",
      isDev: true,
      shellProject: "shell-project",
      pathname: "/",
    }),
    "mytest"
  );
});

test("production ignores the development override", () => {
  assert.equal(
    resolveProjectName({
      routeProject: undefined,
      devProject: "mytest",
      isDev: false,
      shellProject: "production-project",
      pathname: "/",
    }),
    "production-project"
  );
});

test("route, URL, and sys fallbacks remain available", () => {
  assert.equal(
    resolveProjectName({
      routeProject: "route-project",
      devProject: "mytest",
      isDev: true,
      shellProject: "shell-project",
      pathname: "/api/path-project/",
    }),
    "route-project"
  );

  assert.equal(
    resolveProjectName({
      routeProject: undefined,
      devProject: " ",
      isDev: true,
      shellProject: undefined,
      pathname: "/api/path-project/",
    }),
    "path-project"
  );

  assert.equal(
    resolveProjectName({
      routeProject: undefined,
      devProject: undefined,
      isDev: true,
      shellProject: undefined,
      pathname: "/",
    }),
    "sys"
  );
});
