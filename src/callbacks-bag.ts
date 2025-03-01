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
  ) => Omit<CallbackDataCodec<T>, "filter"> & {
    composer: Composer<CallbackBagContext<C, T>>;
  };
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
