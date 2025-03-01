import {
  CallbackSchema,
  CallbackSchemaItem,
  CallbackSchemaItemCore,
  InferCallbackSchema,
  normalizeSchemaItem,
} from "./schema.ts";

type CallbackPayloadPrimitive = number | string | boolean | null | bigint;
type CallbackPayload<T = CallbackPayloadPrimitive> =
  | T
  | Array<CallbackPayload<T>>
  | { [K: string]: CallbackPayload<T> };
type EncodedPrimitive = number | string | null;
type EncodedValue = EncodedPrimitive | EncodedValue[];

type EncoderFactory<T = CallbackSchemaItemCore["type"]> = (
  spec: CallbackSchemaItemCore & { type: T },
) => Encoder;
type Encoder<T = CallbackPayload> = (payload: T) => EncodedValue;

/**
 * Get a function to encode a payload based on a given schema.
 * The given payload must satisfy the schema.
 */
export function getSchemaEncoder<T extends CallbackSchema>(
  schema: T,
): Encoder<InferCallbackSchema<T>> {
  return getEncoder({ type: "object", properties: schema }) as Encoder<
    InferCallbackSchema<T>
  >;
}

/**
 * Function factories based on a spec to transform a payload of a specific type
 * into an array of arrays that can be JSON-encoded in an efficient format.
 *
 * Two different operations are performed: converting datatypes to supported or
 * more efficient ones (e.g. bigint to string) and converting objects into
 * lists.
 * The encoders do not perform any check on the payload, since it's assumed that
 * the schema was checked beforehand.
 * Any check is therefore only for assertion purposes.
 */
const encoders: {
  [K in CallbackSchemaItemCore["type"]]: EncoderFactory<K>;
} = {
  boolean: () => (payload) => (payload === null ? 2 : Number(payload)),
  number: () => (payload) => (payload === null ? null : (payload as number)),
  string: () => (payload) => (payload === null ? null : (payload as string)),
  bigint: () => (payload) =>
    payload === null ? null : (payload as bigint).toString(16),
  array: (spec) => {
    const arrayIfyChild = getEncoder(spec.items);

    return (payload) => {
      if (payload === null) {
        return null;
      } else if (!Array.isArray(payload)) {
        throw new Error("Expected an array");
      }
      return payload.map(arrayIfyChild);
    };
  },
  object: (spec) => {
    const keys = Object.keys(spec.properties).sort();
    const children = Object.fromEntries(
      keys.map((k) => [k, getEncoder(spec.properties[k])]),
    );
    return (payload) => {
      if (payload === null) {
        return null;
      } else if (typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Expected an object");
      }
      return keys.map((k) => children[k](payload[k] ?? null));
    };
  },
};

function getEncoder(spec: CallbackSchemaItem) {
  spec = normalizeSchemaItem(spec);
  const encoder = encoders[spec.type] as EncoderFactory;
  return encoder(spec);
}
