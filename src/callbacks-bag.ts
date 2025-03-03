import {
  Composer,
  Context,
  Filter,
  Middleware,
  NextFunction,
} from "./deps.deno.ts";
import { CallbackDataCodec, createCallbackData } from "./callback-data.ts";
import { CallbackSchema, InferCallbackSchema } from "./schema.ts";
import {
  CALLBACK_DATA_MAX_LENGTH,
  escapeRegExp,
  MaybeNestedCallbackData,
  normalizeCallbackData,
  splitWithTail,
} from "./utils.ts";

type MaybePromise<T> = T | Promise<T>;
export type CallbackBagContext<
  C extends Context,
  T extends CallbackSchema,
> = Filter<
  Omit<C, "matchedCallback"> & {
    matchedCallback: InferCallbackSchema<T>;
  },
  "callback_query:data"
>;
export type CallbacksBagFlavor = {
  matchedCallback?: unknown;
};

type CallbacksBagCodec<C extends Context, T extends CallbackSchema> =
  & Omit<CallbackDataCodec<T>, "filter">
  & { composer: Composer<CallbackBagContext<C, T>> };

/**
 * A container for multiple callbacks. The `register` function allows adding
 * more callback queries to the listened ones.
 */
export type CallbacksBag<C extends Context> = {
  /**
   * Register a new callback query in this bag.
   *
   * ```ts
   * const callbackData = bag.register('foo', { value: 'number' }, (ctx) => {
   *   const { value } = callbackData.unpack(ctx);
   * })
   * ```
   */
  register: <T extends CallbackSchema>(
    prefix: string,
    schema: T,
    ...middleware: Middleware<CallbackBagContext<C, T>>[]
  ) => CallbacksBagCodec<C, T>;
  /**
   * Utility function to migrate a callback query from an old schema to a new
   * schema.
   * When updating the schema of a callback query you _must_ change the prefix
   * to ensure that existing buttons in chats don't fail validation (or worse,
   * succeed with incorrect data).
   * This function helps you maintain backwards compatibility, by offering a way
   * to migrate the data from the old schema to the new schema.
   *
   * **NOTE**:
   * - It's your responsibility to ensure that the data conforms to the new
   * schema, you can ensure this by using Typescript;
   * - **Only pass codec's generated from this bag**.
   *
   * Example:
   * ```ts
   * const counterCb = callbacks.register(
   *   "count2",
   *   { value: "number", increment: "number" },
   *   async (ctx) => {},
   * );
   *
   * callbacks.migrate({
   *   old: { prefix: "count", schema: { value: "number" } },
   *   new: counterCb,
   *   adapter: (ctx) => {
   *     const { value } = ctx.matchedCallback;
   *     return { increment: 1, value };
   *   },
   * });
   * ```
   */
  migrate: <T extends CallbackSchema, T2 extends CallbackSchema>(
    migrationInfo: {
      old: { prefix: string; schema: T };
      new: CallbacksBagCodec<C, T2>;
      adapter: NoInfer<
        (ctx: CallbackBagContext<C, T>) => InferCallbackSchema<T2>
      >;
    },
  ) => void;
};

/**
 * Create a bag of callbacks that can share a common prefix.
 * The bag will be registered on the passed parent composer.
 *
 * Example:
 * ```ts
 * // create a new callbacks bag
 * const fooCallbacks = createCallbacksBag(composer.chatType('private'), {
 *   commonPrefix: 'foo',
 *   onValidationError: async (ctx) => {
 *     await ctx.answerCallbackQuery('Something went wrong...');
 *   },
 * });
 *
 * // register a simple counter in the bag, returns a callback codec
 * const fooCountCb = fooCallbacks.register(
 *   'count',
 *   { value: 'number' },
 *   async (ctx) => {
 *     const { value } = ctx.matchedCallback;
 *     await ctx.editMessageText(`Value: ${value}`, {
 *       reply_markup: new InlineKeyboard().text(
 *         '+1',
 *         // use the callback codec to create a callback to the handler
 *         fooCountCb.pack({ value: value + 1 })
 *       ),
 *     });
 *   }
 * );
 * ```
 */
export function createCallbacksBag<C extends Context & CallbacksBagFlavor>(
  parent: Composer<C>,
  options?: {
    commonPrefix?: string;
    onValidationError?: (
      ctx: Filter<C, "callback_query:data">,
      next: NextFunction,
    ) => MaybePromise<unknown>;
  },
): CallbacksBag<C> {
  const sep = ".";
  const escapedSep = "\\.";
  options ??= {};
  const { commonPrefix, onValidationError = (_ctx, next) => next() } = options;

  if (commonPrefix !== undefined) {
    if (commonPrefix.includes(sep)) {
      throw new Error(`Prefix cannot contain ${sep}`);
    } else if (commonPrefix === "") {
      throw new Error("Prefix cannot be empty");
    }
  }

  const commonPrefixSep = options.commonPrefix
    ? `${options.commonPrefix}${sep}`
    : "";

  const usedPrefixes = new Set();
  const composer = parent.callbackQuery(
    new RegExp(
      `^${escapeRegExp(commonPrefixSep)}[^${escapedSep}]+${escapedSep}.*$`,
    ),
  );

  return {
    migrate: (migrationInfo) => {
      const { old: { prefix, schema }, new: newCb, adapter } = migrationInfo;
      if (usedPrefixes.has(prefix)) {
        throw new Error(`Prefix ${prefix} already in use`);
      }
      usedPrefixes.add(prefix);
      const callbackData = createCallbackData(prefix, schema);

      const unpackSafe = (callback: MaybeNestedCallbackData) => {
        callback = normalizeCallbackData(callback);
        const [, childCallback] = splitWithTail(callback, sep, 2);
        return callbackData.unpackSafe(childCallback);
      };

      composer
        .callbackQuery(
          new RegExp(
            `^${escapeRegExp(commonPrefixSep)}${prefix}${escapedSep}.*$`,
          ),
        )
        .lazy((ctx) => {
          const res = unpackSafe(ctx.callbackQuery);
          if (res.success) {
            ctx.matchedCallback = res.data;
            // deno-lint-ignore no-explicit-any
            ctx.matchedCallback = adapter(ctx as any);
            return newCb.composer as Middleware<C>;
          } else if (res.reason === "VALIDATION_ERROR") {
            return [onValidationError];
          }
          return [];
        });
    },
    register: (prefix, schema, ...middleware) => {
      if (usedPrefixes.has(prefix)) {
        throw new Error(`Prefix ${prefix} already in use`);
      }
      usedPrefixes.add(prefix);

      const child = new Composer(...middleware);
      const callbackData = createCallbackData(prefix, schema);

      const unpackSafe = (callback: MaybeNestedCallbackData) => {
        callback = normalizeCallbackData(callback);
        const [, childCallback] = splitWithTail(callback, sep, 2);
        return callbackData.unpackSafe(childCallback);
      };

      composer
        .callbackQuery(
          new RegExp(
            `^${escapeRegExp(commonPrefixSep)}${prefix}${escapedSep}.*$`,
          ),
        )
        .lazy((ctx) => {
          const res = unpackSafe(ctx.callbackQuery);
          if (res.success) {
            ctx.matchedCallback = res.data;
            return child as Middleware<C>;
          } else if (res.reason === "VALIDATION_ERROR") {
            return [onValidationError];
          }
          return [];
        });

      return {
        composer: child,
        pack: (data) => {
          const packed = `${commonPrefixSep}${callbackData.pack(data)}`;
          if (packed.length > CALLBACK_DATA_MAX_LENGTH) {
            throw new Error("Callback data exceeds maximum length");
          }
          return packed;
        },
        unpack: (callback) => {
          if (commonPrefixSep === "") {
            return callbackData.unpack(callback);
          }
          callback = normalizeCallbackData(callback);
          const [, childCallback] = splitWithTail(callback, sep, 2);
          return callbackData.unpack(childCallback);
        },
        unpackSafe,
      };
    },
  };
}
