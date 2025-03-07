import { getSchemaEncoder } from "./encoder.ts";
import { assertEquals } from "jsr:@std/assert";

Deno.test("Should encode all primitive types", () => {
  const encoder = getSchemaEncoder({
    aNumber: "number",
    bBigint: "bigint",
    cString: "string",
    dBoolean: { type: "boolean", nullable: true },
  });
  assertEquals(
    encoder({
      aNumber: 1,
      bBigint: 1n,
      cString: "hi",
      dBoolean: true,
    }),
    [1, "1", "hi", 1],
  );
  assertEquals(
    encoder({
      aNumber: 1,
      bBigint: 1n,
      cString: "hi",
      dBoolean: null,
    }),
    [1, "1", "hi", 2],
  );
});

Deno.test("Should encode objects", () => {
  const encoder = getSchemaEncoder({
    root: {
      type: "object",
      nullable: true,
      properties: {
        childA: {
          type: "object",
          properties: {
            value: "number",
          },
        },
        childB: {
          type: "object",
          properties: {
            value: "string",
          },
        },
        childC: {
          type: "object",
          properties: {
            value: "boolean",
          },
        },
      },
    },
  });
  assertEquals(
    encoder({
      root: {
        childA: { value: 1 },
        childB: { value: "test" },
        childC: { value: true },
      },
    }),
    [[[1], ["test"], [1]]],
  );
  assertEquals(
    encoder({
      root: null,
    }),
    [null],
  );
});

Deno.test("Should encode arrays", () => {
  const encoder = getSchemaEncoder({
    root: {
      type: "array",
      nullable: true,
      items: {
        type: "array",
        items: "number",
        nullable: true,
      },
    },
  });
  assertEquals(
    encoder({
      root: [
        [1, 2, 3],
        null,
        [4, 5, 6],
      ],
    }),
    [[[1, 2, 3], null, [4, 5, 6]]],
  );
  assertEquals(
    encoder({
      root: null,
    }),
    [null],
  );
});

Deno.test("Should encode unions", () => {
  const encoder = getSchemaEncoder({
    root: {
      type: "union",
      nullable: true,
      options: {
        a: "string",
        b: "number",
        c: {
          type: "object",
          properties: {
            d: "bigint",
            e: "number",
          },
        },
      },
    },
  });
  assertEquals(
    encoder({
      root: {
        type: "a",
        data: "test",
      },
    }),
    [[0, "test"]],
  );
  assertEquals(
    encoder({
      root: {
        type: "b",
        data: 123,
      },
    }),
    [[1, 123]],
  );
  assertEquals(
    encoder({
      root: {
        type: "c",
        data: {
          d: 123n,
          e: 456,
        },
      },
    }),
    [[2, ["7b", 456]]],
  );
  assertEquals(
    encoder({
      root: null,
    }),
    [null],
  );
});

Deno.test("Should encode enums", () => {
  const encoder = getSchemaEncoder({
    enum: {
      type: "enum",
      enum: ["hello", "world"] as const,
      nullable: true,
    },
  });
  assertEquals(encoder({ enum: "hello" }), [1]);
  assertEquals(encoder({ enum: "world" }), [2]);
  assertEquals(encoder({ enum: null }), [0]);
});
