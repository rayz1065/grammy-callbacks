import { assertEquals } from "jsr:@std/assert/equals";
import { getSchemaValidator } from "./validator.ts";
import { assertObjectMatch } from "jsr:@std/assert/object-match";

Deno.test("should validate all primitive types", () => {
  const primitives = ["number", "bigint", "boolean", "string"] as const;
  const values = [1, 1n, true, "hello"];
  const validators = primitives.map((x) => getSchemaValidator({ value: x }));

  for (let i = 0; i < validators.length; i++) {
    for (let j = 0; j < validators.length; j++) {
      assertObjectMatch(validators[i]({ value: values[j] }), {
        success: i == j,
      });
    }
    assertObjectMatch(validators[i]({ value: null }), {
      success: false,
    });
  }
});

Deno.test("should validate objects", () => {
  const validator = getSchemaValidator({
    number: "number",
    child: {
      type: "object",
      properties: {
        string: "string",
        bigint: "bigint",
        boolean: "boolean",
      },
    },
  });
  assertObjectMatch(
    validator({
      number: 1,
      child: { string: "hello", bigint: 1n, boolean: true },
    }),
    { success: true },
  );
  assertObjectMatch(
    validator({
      number: 1,
      child: null,
    }),
    { success: false },
  );
  assertEquals(
    validator({
      number: 1,
      child: { string: true, bigint: "test", boolean: 1n },
    }).errors?.length,
    3,
  );

  const nullableValidator = getSchemaValidator({
    child: {
      type: "object",
      nullable: true,
      properties: {
        a: "string",
      },
    },
  });
  assertObjectMatch(
    nullableValidator({ child: null }),
    { success: true },
  );
});

Deno.test("should validate arrays", () => {
  const validator = getSchemaValidator({
    root: {
      type: "array",
      items: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  });
  assertObjectMatch(
    validator({
      root: [["test"]],
    }),
    { success: true },
  );
  assertObjectMatch(
    validator({
      root: null,
    }),
    { success: false },
  );
  assertEquals(
    validator({
      root: [[null, 1, 2, 3, "test"]],
    }).errors?.length,
    4,
  );

  const nullableValidator = getSchemaValidator({
    root: {
      type: "array",
      items: {
        type: "array",
        nullable: true,
        items: {
          type: "string",
        },
      },
    },
  });
  assertObjectMatch(
    nullableValidator({ root: [null, ["a"], null] }),
    { success: true },
  );
});

Deno.test("Should validate enums", () => {
  const validator = getSchemaValidator({
    enum: {
      type: "enum",
      enum: ["hello", "world"] as const,
    },
  });
  assertObjectMatch(validator({ enum: "hello" }), { success: true });
  assertObjectMatch(validator({ enum: "world" }), { success: true });
  assertObjectMatch(validator({ enum: null }), { success: false });
  assertObjectMatch(validator({ enum: 1 }), { success: false });

  const nullableValidator = getSchemaValidator({
    enum: {
      type: "enum",
      enum: ["hello", "world"] as const,
      nullable: true,
    },
  });
  assertObjectMatch(validator({ enum: "hello" }), { success: true });
  assertObjectMatch(validator({ enum: "world" }), { success: true });
  assertObjectMatch(nullableValidator({ enum: null }), { success: true });
  assertObjectMatch(validator({ enum: "test" }), { success: false });
});
