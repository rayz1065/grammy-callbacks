import {
  CALLBACK_DATA_MAX_LENGTH,
  escapeRegExp,
  MaybeNestedCallbackData,
  normalizeCallbackData,
  splitWithTail,
} from "./utils.ts";
import { getSchemaDecoder } from "./decoder.ts";
import { getSchemaEncoder } from "./encoder.ts";
import { CallbackSchema, InferCallbackSchema } from "./schema.ts";
import { getSchemaValidator, SchemaValidationError } from "./validator.ts";

/**
 * Return type of `unpackSafe`, contains the data if success is true or an error
 * if success if false.
 * The unpacking may fail either due to the input being malformed (was not
 * created through pack) or because the contain data doesn't respect the given
 * schema in which case a validation error is returned.
 */
export type CallbackUnpackSafeReturnType<Output = unknown> =
  | CallbackUnpackSafeError
  | CallbackUnpackSafeSuccess<Output>;
export type CallbackUnpackSafeError =
  | {
    success: false;
    reason: "VALIDATION_ERROR";
    errors: Array<SchemaValidationError>;
    data?: never;
  }
  | {
    success: false;
    reason: "MALFORMED_INPUT";
    errors?: never;
    data?: never;
  };
export type CallbackUnpackSafeSuccess<Output = unknown> = {
  success: true;
  reason?: never;
  errors?: never;
  data: Output;
};

/**
 * An encoder and decoder (codec) for callback query data.
 *
 * To create the callback data use `pack` and pass the data to serialize.
 * To obtain the encoded data from the callback data, use `unpackSafe`
 * (recommended) or `unpack`.
 *
 * To filter for this callback use `filter`:
 * ```ts
 * bot.callbackQuery(callbackData.filter(), async (ctx) => {
 *   const res = callbackData.unpackSafe(ctx);
 *   if (!res.success) {
 *     await ctx.answerCallbackQuery("Something went wrong");
 *     return;
 *   }
 * });
 * ```
 */
export type CallbackDataCodec<T extends CallbackSchema> = {
  /**
   * Serialize the data into a callback query string.
   */
  pack: (data: InferCallbackSchema<T>) => string;
  /**
   * Deserialize the callback data and obtain the original data.
   * If the callback data does not correspond to a valid payload (i.e. the
   * encoded data is malformed or the data types are invalid) an error of type
   * `CallbackUnpackError` will be thrown.
   *
   * @throws {CallbackUnpackError}
   */
  unpack: (callback: MaybeNestedCallbackData) => InferCallbackSchema<T>;
  /**
   * Deserialize the callback data and obtain the original data.
   * If the callback data does not correspond to a valid payload (i.e. the
   * encoded data is malformed or the data types are invalid) the return value
   * will have `success` set to `false`.
   */
  unpackSafe: (
    callback: MaybeNestedCallbackData,
  ) => CallbackUnpackSafeReturnType<InferCallbackSchema<T>>;
  /**
   * Obtain a regex to filter for this callback data.
   */
  filter: () => RegExp;
};

/**
 * Error thrown by the unsafe version of `unpack`.
 */
export class CallbackUnpackError extends Error {
  constructor(public unpackError: CallbackUnpackSafeError) {
    super(`Error unpacking callback: ${unpackError.reason}`);
  }
}

/**
 * Create a callback data serializer/deserializer with a specific prefix and a
 * schema.
 * The produced callback will be of the form `${prefix}.${serializedData}`.
 * The prefix may not contain '.', as that is used as a separator.
 *
 * _Instead of using this directly, consider using a callbacks bag._
 *
 * Example:
 * ```ts
 * const counterCb = createCallbackData('counter', { value: 'number' });
 * bot.callbackQuery(counterCb.filter(), async (ctx) => {
 *   const res = counterCb.unpackSafe(ctx);
 *   if (!res.success) {
 *     await ctx.answerCallbackQuery('Something went wrong');
 *     return;
 *   }
 *   const { value } = res.data;
 *   await ctx.editMessageText(`Value: ${value}`, {
 *     reply_markup: new InlineKeyboard().text(
 *       '+1',
 *       counterCb.pack({ value: value + 1 })
 *     ),
 *   });
 * });
 * ```
 */
export function createCallbackData<T extends CallbackSchema>(
  prefix: string,
  schema: T,
): CallbackDataCodec<T> {
  const sep = ".";
  const escapedSep = "\\.";
  const escapedPrefix = escapeRegExp(prefix);
  const encoder = getSchemaEncoder(schema);
  const decoder = getSchemaDecoder(schema);
  const checker = getSchemaValidator(schema);

  if (prefix.includes(sep)) {
    throw new Error(`Prefix may not contain ${sep}`);
  } else if (prefix === "") {
    throw new Error("Prefix may not be empty");
  }

  const unpackSafe: CallbackDataCodec<T>["unpackSafe"] = (callback) => {
    callback = normalizeCallbackData(callback);
    const [, serialized] = splitWithTail(callback, sep, 2);

    let encoded: unknown;
    try {
      encoded = JSON.parse(`[${serialized}]`);
    } catch {
      return {
        success: false,
        reason: "MALFORMED_INPUT",
      };
    }

    const decoded = decoder(encoded);
    const res = checker(decoded);

    if (!res.success) {
      return {
        reason: "VALIDATION_ERROR",
        ...res,
      };
    }

    return {
      success: true,
      data: res.data,
    };
  };

  return {
    pack: (data) => {
      const res = checker(data);
      if (!res.success) {
        throw new Error("Data to pack doesn't conform to schema");
      }
      const encoded = encoder(res.data);
      let serialized = JSON.stringify(encoded);
      serialized = serialized.substring(1, serialized.length - 1);

      const packed = `${prefix}${sep}${serialized}`;
      if (packed.length > CALLBACK_DATA_MAX_LENGTH) {
        throw new Error("Callback data exceeds maximum length");
      }

      return packed;
    },
    unpackSafe,
    unpack: (callback) => {
      const res = unpackSafe(callback);
      if (!res.success) {
        throw new CallbackUnpackError(res);
      }
      return res.data;
    },
    filter: () => {
      return new RegExp(`^${escapedPrefix}${escapedSep}.*$`);
    },
  };
}
