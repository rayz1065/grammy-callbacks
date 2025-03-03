import { assertEquals } from "jsr:@std/assert/equals";
import { createCallbacksBag } from "./callbacks-bag.ts";
import { Api, Composer, Context, Update, UserFromGetMe } from "./deps.deno.ts";
import { spy } from "jsr:@std/testing/mock";
import { assertObjectMatch } from "jsr:@std/assert/object-match";

function getCallbacksBag() {
  const composer = new Composer();
  const bag = createCallbacksBag(composer, {
    commonPrefix: "foo",
  });
  const cb = bag.register("bar", { value: "bigint" });
  return { composer, bag, cb };
}

function makeCallbackContext(data: string) {
  return new Context(
    {
      callback_query: { data },
    } as Update,
    {} as Api,
    {} as UserFromGetMe,
  );
}

Deno.test("Should pack a callback with the common prefix", () => {
  const { cb } = getCallbacksBag();
  assertEquals(cb.pack({ value: 1n }), 'foo.bar."1"');
  assertEquals(cb.pack({ value: 1065n }), 'foo.bar."429"');
});

Deno.test("Should pack a callback without the common prefix", () => {
  const composer = new Composer();
  const bag = createCallbacksBag(composer);
  const cb = bag.register("bar", { value: "bigint" });

  assertEquals(cb.pack({ value: 1n }), 'bar."1"');
  assertEquals(cb.pack({ value: 1065n }), 'bar."429"');
});

Deno.test("Should unpack a callback correctly", () => {
  const { cb } = getCallbacksBag();
  assertEquals(cb.unpack('foo.bar."1"'), { value: 1n });
  assertEquals(cb.unpack('foo.bar."429"'), { value: 1065n });
});

Deno.test("Should filter correctly", async () => {
  const onValidationErrorSpy = spy(() => {});

  const composer = new Composer();
  const bag = createCallbacksBag(composer, {
    commonPrefix: "foo",
    onValidationError: onValidationErrorSpy,
  });
  const spiedMiddleware = spy(() => {});
  const _cb = bag.register("bar", { value: "bigint" }, spiedMiddleware);

  const ctxMatched = makeCallbackContext('foo.bar."1"');

  assertEquals(spiedMiddleware.calls.length, 0);
  await composer.middleware()(ctxMatched, async () => {});
  assertEquals(spiedMiddleware.calls.length, 1);

  const ctxMalformed = makeCallbackContext('foo.bar."1');
  const ctxUnmatched = makeCallbackContext('foo.ba."1"');
  await composer.middleware()(ctxMalformed, async () => {});
  await composer.middleware()(ctxUnmatched, async () => {});
  assertEquals(spiedMiddleware.calls.length, 1);

  const ctxInvalid = makeCallbackContext("foo.bar.null");
  assertEquals(onValidationErrorSpy.calls.length, 0);
  await composer.middleware()(ctxInvalid, async () => {});
  assertEquals(spiedMiddleware.calls.length, 1);
  assertEquals(onValidationErrorSpy.calls.length, 1);
});

Deno.test("Should allow migrating callbacks", async () => {
  const composer = new Composer();
  const bag = createCallbacksBag(composer, {
    commonPrefix: "foo",
  });

  const spiedMiddleware = spy((_ctx: Context) => {});
  const cb = bag.register("barV2", { value: "bigint" }, spiedMiddleware);

  bag.migrate({
    old: { prefix: "bar", schema: { value: "number" } },
    new: cb,
    adapter: (ctx) => {
      const { value } = ctx.matchedCallback;
      return { value: BigInt(value) };
    },
  });

  const ctx = makeCallbackContext("foo.bar.123");
  assertEquals(spiedMiddleware.calls.length, 0);
  await composer.middleware()(ctx, async () => {});
  assertEquals(spiedMiddleware.calls.length, 1);
  assertObjectMatch(spiedMiddleware.calls[0].args[0], {
    matchedCallback: {
      value: 123n,
    },
  });
});
