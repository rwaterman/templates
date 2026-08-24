"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

test("runtime provides the URL API used by the server", () => {
  const url = new URL("/work?ms=50", "http://localhost");
  assert.equal(url.pathname, "/work");
  assert.equal(url.searchParams.get("ms"), "50");
});

