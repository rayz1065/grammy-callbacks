import { getSchemaDecoder } from "./decoder.ts";
import { assertEquals } from "jsr:@std/assert";

Deno.test("Should decode all primitive types", () => {
  const decoder = getSchemaDecoder({
    aNumber: "number",
    bBigint: "bigint",
    cString: "string",
    dBoolean: { type: "boolean", nullable: true },
  });
  assertEquals(
    decoder([1, "1", "hi", 1]),
    {
      aNumber: 1,
      bBigint: 1n,
      cString: "hi",
      dBoolean: true,
    },
  );
  assertEquals(
    decoder([1, "1", "hi", 2]),
    {
      aNumber: 1,
      bBigint: 1n,
      cString: "hi",
      dBoolean: null,
    },
  );
});

Deno.test("Should decode objects", () => {
  const decoder = getSchemaDecoder({
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
    decoder([[[1], ["test"], [1]]]),
    {
      root: {
        childA: { value: 1 },
        childB: { value: "test" },
        childC: { value: true },
      },
    },
  );
  assertEquals(
    decoder([null]),
    { root: null },
  );
});

Deno.test("Should decode arrays", () => {
  const decoder = getSchemaDecoder({
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
    decoder([[[1, 2, 3], null, [4, 5, 6]]]),
    {
      root: [
        [1, 2, 3],
        null,
        [4, 5, 6],
      ],
    },
  );
  assertEquals(
    decoder([null]),
    { root: null },
  );
});

Deno.test("Should decode enums", () => {
  const decoder = getSchemaDecoder({
    enum: {
      type: "enum",
      enum: ["hello", "world"],
      nullable: true,
    },
  });
  assertEquals(decoder([1]), { enum: "hello" });
  assertEquals(decoder([2]), { enum: "world" });
  assertEquals(decoder([0]), { enum: null });
});
