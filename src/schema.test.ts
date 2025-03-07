import { AssertTrue, IsExact } from "jsr:@std/testing/types";
import { CallbackSchema, InferCallbackSchema } from "./mod.ts";

Deno.test("should infer the correct return type", () => {
  const schema = {
    bigint: "bigint",
    number: "number",
    string: "string",
    boolean: "boolean",
    nullablePrimitives: {
      type: "object",
      properties: {
        bigint: { type: "bigint", nullable: true },
        number: { type: "number", nullable: true },
        string: { type: "string", nullable: true },
        boolean: { type: "boolean", nullable: true },
      },
    },
    array: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foo: "string",
          bar: "number",
        },
      },
    },
    enum: {
      type: "enum",
      enum: ["hello", "world", 1, 2, 3] as const,
    },
    union: {
      type: "union",
      options: {
        a: "string",
        b: "number",
        c: {
          type: "object",
          properties: {
            d: "string",
            e: "number",
          },
        },
      },
    },
  } satisfies CallbackSchema;

  type Test = AssertTrue<
    IsExact<
      InferCallbackSchema<typeof schema>,
      {
        bigint: bigint;
        number: number;
        string: string;
        boolean: boolean;
        nullablePrimitives: {
          bigint: bigint | null;
          number: number | null;
          string: string | null;
          boolean: boolean | null;
        };
        array: Array<
          {
            foo: string;
            bar: number;
          }
        >;
        enum: "hello" | "world" | 1 | 2 | 3;
        union:
          | { type: "a"; data: string }
          | { type: "b"; data: number }
          | { type: "c"; data: { d: string; e: number } };
      }
    >
  >;
});
