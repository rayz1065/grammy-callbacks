# Grammy Callbacks

This plugin will help you in creating and validating callback queries for your Telegram bots.

The problems it tackles include:

🗜 efficiently **packing complex data** into callbacks (that are limited to 64 bytes)

📖 decoding callbacks in a **type-safe** way, verifying the contained data is valid

🔄 maintaining **backwards compatibility** even as your features change

## Getting Started

```ts
import {
  Bot,
  Context,
  InlineKeyboard,
} from "https://lib.deno.dev/x/grammy@1.x/mod.ts";
import { createCallbacksBag } from "https://lib.deno.dev/x/grammy_callbacks@1.x/mod.ts";

type MyContext = Context;
const bot = new Bot<MyContext>("");

// listen for callback queries starting with 'foo.'
const callbacks = createCallbacksBag<MyContext>({ commonPrefix: "foo" });
bot.use(callbacks);

// register a new callback, the return value is a codec we can use to encode
// the callback data
const fooCountCb = callbacks.register(
  {
    // match queries starting with foo.count.
    prefix: "count",
    // queries will contain a numeric value
    schema: { value: "number" },
  },
  async (ctx) => {
    // the value can be obtained by unpacking `ctx.matchedCallback`
    // it will be typed as `number`
    const { value } = ctx.matchedCallback;
    await ctx.editMessageText(`Value: ${value}`, {
      reply_markup: new InlineKeyboard().text(
        "+1",
        // pack a new callback with the value increased
        fooCountCb.pack({ value: value + 1 }),
      ),
    });
  },
);

bot.command("start", async (ctx) => {
  await ctx.reply("Hello world", {
    reply_markup: new InlineKeyboard().text(
      "Counter",
      fooCountCb.pack({ value: 0 }),
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
import { CallbackSchema } from "https://lib.deno.dev/x/grammy_callbacks@1.x/mod.ts";

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
  enum: {
    type: "enum",
    // careful: don't reorder the values, read the info on migration below!
    enum: ["a", "b", "c"] as const, // include `as const` to get type hints on `pack`
  },
} satisfies CallbackSchema; // include this to get type hints!
```

Looking for a simpler approach? <https://github.com/deptyped/callback-data>.

## Migrating

If you change your schema, old keyboards will stop working, this can result in a very confusing user experience and misbehaving code.
The simplest thing you can do to tackle this issue is to change the prefix of your callbacks every time you do an update and keep the old callbacks as a stub asking the user to restart the bot, but we can do better!

Looking at the example above, let's say we want to add a new value within the schema specifying how much we want to increase the counter:

```ts
const fooCountCb = callbacks.register(
  {
    // remember to use a new unique prefix!
    prefix: "count2",
    // update the schema as needed
    schema: { value: "number", increment: "number" },
  },
  async (ctx) => {
    const { value, increment } = ctx.matchedCallback;
    await ctx.editMessageText(`Value: ${value}`, {
      reply_markup: new InlineKeyboard().text(
        `+${increment}`,
        fooCountCb.pack({ value: value + increment, increment }),
      ),
    });
  },
);
```

For backwards compatibility we also want to handle the _old_ callback format, that didn't include the increment.
We could keep the old handler, and accept some code duplication, or even extract the logic into a separate handler function.
Instead, we avoid duplication entirely by migrating the old callback schema to the new one, setting a default for the `increment` value that we previously didn't have:

```ts
callbacks.migrate(
  {
    old: {
      prefix: "count",
      schema: { value: "number" },
    },
    new: fooCountCb,
    adapter: (ctx) => {
      const { value } = ctx.matchedCallback;
      // set a default for increment
      return { increment: 1, value };
    },
  },
);
```

To summarize, every time you want to do a change to the schema of a callback you:

- call `migrate` on the callbacks bag, passing in the current prefix and schema as well as the callback codec
- update the prefix of your `register`-ed handler, a simple numeric version will suffice
- make the breaking changes you need to the schema
- implement the adapter, migrating the old data to the new schema
- update any call to `pack` on your codec to adapt them to the new schema (using Typescript is highly encouraged for this)

Changes on schema which are breaking include:

- changing the keys in an object
- changing the type of an item, for example from number to string
- shuffling the options in an enum, or placing a new enum option anywhere but the end

Some changes which are not breaking include:

- adding a new enum option **at the end** of the array of options
- making an item nullable

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
      counterCb.pack({ value: value + 1 }),
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
        fooCountCb.pack({ value: 0 }),
      ),
    });
  },
});
```
