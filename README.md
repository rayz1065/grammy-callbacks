# Grammy Callbacks

This plugin will help you in creating and validating callback queries for your Telegram bots.

## Getting Started

```ts
import { Bot, InlineKeyboard } from "https://lib.deno.dev/x/grammy@1.x/mod.ts";
import { createCallbacksBag } from "https://lib.deno.dev/x/grammy_callbacks@1.x/mod.ts";

const bot = new Bot("");

// listen for callback queries in a private chat starting with 'foo.'
const callbacks = createCallbacksBag(bot.chatType("private"), {
  commonPrefix: "foo",
});

// register a new callback
const fooCountCb = callbacks.register(
  // match queries starting with foo.count.
  "count",
  // queries will contain a numeric value
  { value: "number" },
  async (ctx) => {
    // the value can be obtained by unpacking `ctx.matchedCallback`
    // it will be typed as `number`
    const { value } = ctx.matchedCallback;
    await ctx.editMessageText(`Value: ${value}`, {
      reply_markup: new InlineKeyboard().text(
        "+1",
        // pack a new callback with the value increased
        fooCountCb.pack({ value: value + 1 })
      ),
    });
  }
);

bot.chatType("private").command("start", async (ctx) => {
  await ctx.reply("Hello world", {
    reply_markup: new InlineKeyboard().text(
      "Counter",
      fooCountCb.pack({ value: 0 })
    ),
  });
});
void bot.start();
```

## Callback Schema

The data stored in the callback will follow a given schema inspired by JSON schema, it allows you to define the structure and contents of the payload.
The `CallbackSchema` will be used for 3 tasks:

- **serializing**: convert the value into an efficiently packed string
- **deserializing**: get back to the original shape from a string
- **validating**: check that the value corresponds to the schema

**Important**: the data in a callback query is currently limited to 64 bytes, trying to create a longer callback query will result in an error.

Typescript will help you greatly when it comes to defining a complex schema:

```ts
const complexSchema = {
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
} satisfies CallbackSchema; // include this to get type hints!
```

Looking for a simpler approach? <https://github.com/deptyped/callback-data>.

## Standalone Callback Data

If you don't need the ease of use of creating a whole `CallbacksBag` but want to define a single callback data you can also use `createCallbackData`.

```ts
const counterCb = createCallbackData("counter", { value: "number" });
bot.callbackQuery(counterCb.filter(), async (ctx) => {
  const res = counterCb.unpackSafe(ctx);
  if (!res.success) {
    await ctx.answerCallbackQuery("Something went wrong");
    return;
  }
  const { value } = res.data;
  await ctx.editMessageText(`Value: ${value}`, {
    reply_markup: new InlineKeyboard().text(
      "+1",
      counterCb.pack({ value: value + 1 })
    ),
  });
});
```

## Dealing With Validation Errors

By default, if a validation error occurs the handlers will be skipped, ideally for a fallback callback query to be matched instead.
If you want to instead handle the validation error yourself you can simply pass a function to `onValidationError` when creating a `CallbacksBag`.

```ts
const callbacks = createCallbacksBag(bot.chatType("private"), {
  commonPrefix: "foo",
  onValidationError: async (ctx) => {
    await ctx.answerCallbackQuery("Something went wrong...");
    await ctx.editMessageText("Retry", {
      reply_markup: new InlineKeyboard().text(
        "Counter",
        fooCountCb.pack({ value: 0 })
      ),
    });
  },
});
```
