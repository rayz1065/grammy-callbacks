import { assertEquals } from "jsr:@std/assert/equals";
import { assertInstanceOf } from "jsr:@std/assert/instance-of";
import { assertObjectMatch } from "jsr:@std/assert/object-match";
import { CallbackUnpackError, createCallbackData } from "./callback-data.ts";
import { assertThrows } from "jsr:@std/assert/throws";
import { assertLessOrEqual } from "jsr:@std/assert/less-or-equal";

function getCallback() {
  return createCallbackData("prefix", {
    value: "bigint",
  });
}

Deno.test("Should pack a callback correctly", () => {
  const cb = getCallback();
  assertEquals(cb.pack({ value: 1n }), 'prefix."1"');
  assertEquals(cb.pack({ value: 1065n }), 'prefix."429"');
});

Deno.test("Should unpack a callback correctly", () => {
  const cb = getCallback();
  assertEquals(cb.unpack('prefix."1"'), { value: 1n });
  assertEquals(cb.unpack('prefix."429"'), { value: 1065n });
});

Deno.test("Should throw an error for unpack with malformed input", () => {
  const cb = getCallback();
  try {
    cb.unpack('prefix."1');
  } catch (error) {
    assertInstanceOf(error, CallbackUnpackError);
    assertEquals(error.unpackError.reason, "MALFORMED_INPUT");
  }
});

Deno.test("Should throw an error for unpack with invalid data", () => {
  const cb = getCallback();
  try {
    cb.unpack("prefix.null");
  } catch (error) {
    assertInstanceOf(error, CallbackUnpackError);
    assertEquals(error.unpackError.reason, "VALIDATION_ERROR");
  }
});

Deno.test("Should unpack callback safely", () => {
  const cb = getCallback();
  assertEquals(cb.unpackSafe('prefix."1"'), {
    success: true,
    data: { value: 1n },
  });
  assertObjectMatch(cb.unpackSafe('prefix."1'), {
    success: false,
    reason: "MALFORMED_INPUT",
  });
  assertObjectMatch(cb.unpackSafe("prefix.null"), {
    success: false,
    reason: "VALIDATION_ERROR",
  });
});

Deno.test("Should filter correctly", () => {
  const cb = createCallbackData("prefix?+|()", {});
  const filter = cb.filter();
  assertEquals(filter.test("prefix?+|().1"), true);
  assertEquals(filter.test("prefix?+|()."), true);
  assertEquals(filter.test("prefix?+|()"), false);
  assertEquals(filter.test("-prefix?+|()."), false);
});

Deno.test("Should disallow invalid prefixes", () => {
  assertThrows(() => createCallbackData("", {}));
  assertThrows(() => createCallbackData("prefix.", {}));
});

Deno.test("Should throw on invalid callback length", () => {
  const cb = getCallback();
  assertLessOrEqual(cb.pack({ value: BigInt(Math.pow(2, 196)) }).length, 64);
  assertThrows(() => cb.pack({ value: BigInt(Math.pow(2, 225)) }));
});
